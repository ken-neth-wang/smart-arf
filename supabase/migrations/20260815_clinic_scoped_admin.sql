-- ═══════════════════════════════════════════════════════════════════
-- Migration: clinic-scoped admin + membership lifecycle
-- (docs/user-clinic-management-plan.md — phase 1)
--
-- What changes:
--   1. profiles.platform_admin — rare cross-clinic tier (create clinic,
--      deactivate accounts). Seeded from current admins (one shot).
--   2. is_admin(clinic_id) — per-clinic admin check; is_last_admin(clinic_id);
--      is_member(clinic_id); is_platform_admin(). Global is_admin() dropped.
--   3. clinic_memberships gains DELETE (removal) + last-admin guard +
--      clinic_id immutability. Access config only — clinical tables keep
--      their no-DELETE invariant.
--   4. Profiles: self-approve hole closed (approve = admin, deactivate =
--      platform), roster visibility = shared clinic.
--   5. patients/encounters: global-admin clause dropped; receiving-clinic
--      admins can edit referrals into their clinic.
--   6. photos/audio: clinic_id derived from the encounter (via its patient)
--      on insert — client-supplied value ignored.
--
-- Idempotent: safe to re-run. Clinical data untouched.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. platform_admin column + one-shot seeding ──────────────────
alter table public.profiles add column if not exists platform_admin boolean not null default false;

-- Seed exactly once: promote everyone who is an admin anywhere TODAY
-- (they hold global powers under the old policies). Sentinel: the zero-arg
-- is_admin() still exists (dropped at the end of this migration) → re-runs
-- skip the seed, so post-migration clinic admins are NOT auto-promoted.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    update public.profiles set platform_admin = true
    where id in (select user_id from public.clinic_memberships where role = 'admin');
  end if;
end $$;

-- ── 2. Helper functions (all SECURITY DEFINER → bypass RLS, no recursion) ──

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin(clinic uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.clinic_memberships
    where user_id = auth.uid() and clinic_id = clinic and role = 'admin'
  )
$$;

create or replace function public.is_member(clinic uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.clinic_memberships
    where user_id = auth.uid() and clinic_id = clinic
  )
$$;

-- True when `clinic` has <= 1 admin membership (used to block removing /
-- demoting the last one). SECURITY DEFINER so policies can call it without
-- recursing into clinic_memberships RLS.
create or replace function public.is_last_admin(clinic uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select (
    select count(*) from public.clinic_memberships
    where clinic_id = clinic and role = 'admin'
  ) <= 1
$$;

-- Is the current user an admin of ANY clinic? (Used for the pending-approvals
-- list: pending users belong to no clinic, so they'd otherwise be invisible
-- to every admin — and unapprovable.)
create or replace function public.is_any_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.clinic_memberships
    where user_id = auth.uid() and role = 'admin'
  )
$$;

-- Snapshot-safe, recursion-safe visibility helpers for the patients /
-- encounters SELECT policies. The app saves via INSERT .. RETURNING, where a
-- policy that re-queries the TARGET table cannot see the new row (spurious
-- 42501 on every save); plain inline subqueries across patients↔encounters
-- recurse through each other's policies. SECURITY DEFINER functions reading
-- the OTHER table with the row's id as a parameter dodge both problems.
create or replace function public.referral_into_my_clinics(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.encounters e
    where e.patient_id = pid
      and e.referred_to_clinic_id in (select public.my_clinics())
  )
$$;

create or replace function public.patient_at_my_clinic(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.patients p
    where p.id = pid
      and p.clinic_id in (select public.my_clinics())
  )
$$;

-- ── 3. clinic_memberships: immutability + guard triggers ─────────

-- clinic_id is immutable on update — reassignment is delete + insert, so an
-- admin of clinic A can never "move" a row into clinic B they don't control.
create or replace function public.guard_membership_update()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.clinic_id <> old.clinic_id then
    raise exception 'clinic_memberships.clinic_id is immutable — delete + insert instead';
  end if;
  return new;
end $$;

drop trigger if exists memberships_guard_update on public.clinic_memberships;
create trigger memberships_guard_update
  before update on public.clinic_memberships
  for each row execute function public.guard_membership_update();

-- ── 4. profiles: approve/deactivate/platform gates ────────────────
-- Closes the existing hole where any user could set their own approved=true.

create or replace function public.guard_profiles_update()
returns trigger language plpgsql set search_path = public
as $$
begin
  -- Direct/administrative connections (migrations, SQL editor, service-role
  -- harness) manage profiles without a user JWT — only app-role requests
  -- (authenticated) pass through the approve/deactivate gates below.
  if pg_has_role(current_user, 'service_role', 'member')
     or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if new.platform_admin is distinct from old.platform_admin
     and not public.is_platform_admin() then
    raise exception 'only platform admins can change platform_admin';
  end if;

  if new.approved is distinct from old.approved then
    if new.approved = false then
      if not public.is_platform_admin() then
        raise exception 'only platform admins can deactivate accounts';
      end if;
    else
      if not (public.is_platform_admin() or exists (
        select 1 from public.clinic_memberships
        where user_id = auth.uid() and role = 'admin'
      )) then
        raise exception 'only admins can approve accounts';
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profiles_update();

-- ── 5. photos/audio: clinic_id derived from the encounter ────────
-- The encounter is the attribution anchor; its clinic is the patient's
-- clinic (encounters carry no clinic_id). Client-supplied clinic_id is
-- honored only for the schema-permitted orphan case (encounter_id null).

create or replace function public.derive_media_clinic()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.encounter_id is not null then
    select p.clinic_id into new.clinic_id
    from public.encounters e
    join public.patients p on p.id = e.patient_id
    where e.id = new.encounter_id;
  end if;
  return new;
end $$;

drop trigger if exists photos_derive_clinic on public.photos;
create trigger photos_derive_clinic
  before insert on public.photos
  for each row execute function public.derive_media_clinic();

drop trigger if exists audio_derive_clinic on public.audio;
create trigger audio_derive_clinic
  before insert on public.audio
  for each row execute function public.derive_media_clinic();

-- ── 6. Policies: clinic_memberships ──────────────────────────────
-- Roster: your own rows, any clinic you belong to, or platform admin.
alter table public.clinic_memberships enable row level security;

drop policy if exists "memberships_self_select" on public.clinic_memberships;
drop policy if exists "memberships_select" on public.clinic_memberships;
create policy "memberships_select" on public.clinic_memberships
  for select using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.is_member(clinic_id)
  );

drop policy if exists "memberships_admin_insert" on public.clinic_memberships;
create policy "memberships_admin_insert" on public.clinic_memberships
  for insert with check (
    public.is_platform_admin()
    or public.is_admin(clinic_id)
  );

-- Role changes: admin of that clinic (not your own row; not the last admin).
drop policy if exists "memberships_admin_update" on public.clinic_memberships;
create policy "memberships_admin_update" on public.clinic_memberships
  for update
  using (
    public.is_platform_admin()
    or (
      public.is_admin(clinic_id)
      and user_id <> auth.uid()
      and not (role = 'admin' and public.is_last_admin(clinic_id))
    )
  )
  with check (
    public.is_platform_admin()
    or (public.is_admin(clinic_id) and user_id <> auth.uid())
  );

-- NEW — removal. Admin of that clinic (not your own row, not the last admin)
-- or platform admin. Deletes the ACCESS ROW ONLY: clinical data is
-- clinic-owned (clinic_id + created_by on the records) and stays put.
drop policy if exists "memberships_admin_delete" on public.clinic_memberships;
create policy "memberships_admin_delete" on public.clinic_memberships
  for delete using (
    public.is_platform_admin()
    or (
      public.is_admin(clinic_id)
      and user_id <> auth.uid()
      and not (role = 'admin' and public.is_last_admin(clinic_id))
    )
  );

alter table public.allowed_emails enable row level security;
drop policy if exists "allowlist_admin_all" on public.allowed_emails;
create policy "allowlist_admin_all" on public.allowed_emails
  for all
  using (public.is_platform_admin() or public.is_admin(clinic_id))
  with check (public.is_platform_admin() or public.is_admin(clinic_id));

-- ── 8. Policies: clinics — creation is a platform action ──────────
drop policy if exists "clinics_admin_insert" on public.clinics;
drop policy if exists "clinics_platform_insert" on public.clinics;
create policy "clinics_platform_insert" on public.clinics
  for insert with check (public.is_platform_admin());

-- ── 9. Policies: profiles ─────────────────────────────────────────
-- Read: self, platform admin, anyone sharing ≥1 clinic, and — for admins —
-- pending users (they belong to no clinic yet; the approvals list is global).
drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_platform_admin()
    or (public.is_any_admin() and not profiles.approved)
    or exists (
      select 1 from public.clinic_memberships mine
      join public.clinic_memberships theirs on theirs.clinic_id = mine.clinic_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

-- Update: self (display data), platform admin, or any clinic admin (approve).
-- WITH CHECK deliberately true — safe because (1) Postgres applies the SELECT
-- policy's USING to the NEW row on UPDATE (profiles_select is the real
-- new-row gate), and (2) guard_profiles_update enforces the
-- approve/deactivate/platform transitions. Approve flow ORDER matters:
-- insert the membership BEFORE approved=true (lib/admin.ts approveUserCloud
-- currently does the reverse and must be fixed in phase 4).
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or public.is_any_admin()
  )
  with check (true);

-- ── 10. Policies: patients — global-admin clause dropped ─────────
drop policy if exists "patients_select" on public.patients;
-- Row-ref own-clinic branch + definer helper for the referral branch —
-- snapshot-safe for INSERT .. RETURNING (the app's save path) and free of
-- the patients↔encounters policy recursion. See the helper notes in §2.
create policy "patients_select" on public.patients
  for select using (
    public.is_platform_admin()
    or (
      public.is_approved()
      and (
        clinic_id in (select public.my_clinics())
        or public.referral_into_my_clinics(patients.id)
      )
    )
  );

drop policy if exists "patients_insert" on public.patients;
create policy "patients_insert" on public.patients
  for insert with check (
    public.is_platform_admin()
    or (
      public.is_approved()
      and clinic_id in (select public.my_clinics())
      and created_by = auth.uid()
    )
  );

-- Update: own-clinic member ∨ receiving-clinic admin (referrals into a
-- clinic they admin) ∨ platform admin. Referred-in stays read-only for
-- plain members of the receiving clinic.
drop policy if exists "patients_update" on public.patients;
create policy "patients_update" on public.patients
  for update
  using (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
    or (
      public.is_approved()
      and exists (
        select 1
        from public.encounters e
        join public.clinic_memberships m on m.clinic_id = e.referred_to_clinic_id
        where e.patient_id = patients.id
          and m.user_id = auth.uid()
          and m.role = 'admin'
      )
    )
  )
  with check (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
    or (
      public.is_approved()
      and exists (
        select 1
        from public.encounters e
        join public.clinic_memberships m on m.clinic_id = e.referred_to_clinic_id
        where e.patient_id = patients.id
          and m.user_id = auth.uid()
          and m.role = 'admin'
      )
    )
  );

-- ── 11. Policies: encounters — same shape as patients ────────────
drop policy if exists "encounters_select" on public.encounters;
-- Same helper-based shape as patients_select (definer fns, prior rows only);
-- the new-encounter case passes via patient_at_my_clinic.
create policy "encounters_select" on public.encounters
  for select using (
    public.is_platform_admin()
    or (
      public.is_approved()
      and (
        public.patient_at_my_clinic(encounters.patient_id)
        or public.referral_into_my_clinics(encounters.patient_id)
      )
    )
  );

drop policy if exists "encounters_insert" on public.encounters;
create policy "encounters_insert" on public.encounters
  for insert with check (
    public.is_platform_admin()
    or (
      public.is_approved()
      and public.patient_visible(patient_id)
      and created_by = auth.uid()
    )
  );

drop policy if exists "encounters_update" on public.encounters;
create policy "encounters_update" on public.encounters
  for update
  using (
    public.is_platform_admin()
    or (public.is_approved() and public.patient_visible(patient_id))
    or (
      public.is_approved()
      and exists (
        select 1
        from public.clinic_memberships m
        where m.user_id = auth.uid()
          and m.role = 'admin'
          and m.clinic_id = encounters.referred_to_clinic_id
      )
    )
  )
  with check (
    public.is_platform_admin()
    or (public.is_approved() and public.patient_visible(patient_id))
    or (
      public.is_approved()
      and exists (
        select 1
        from public.clinic_memberships m
        where m.user_id = auth.uid()
          and m.role = 'admin'
          and m.clinic_id = encounters.referred_to_clinic_id
      )
    )
  );

-- ── 12. Policies: photos/audio — platform clause swap only ───────
drop policy if exists "photos_select" on public.photos;
create policy "photos_select" on public.photos
  for select using (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
  );

drop policy if exists "photos_insert" on public.photos;
create policy "photos_insert" on public.photos
  for insert with check (
    public.is_approved()
    and clinic_id in (select public.my_clinics())
    and created_by = auth.uid()
  );

drop policy if exists "photos_update" on public.photos;
create policy "photos_update" on public.photos
  for update
  using (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
  )
  with check (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
  );

drop policy if exists "audio_select" on public.audio;
create policy "audio_select" on public.audio
  for select using (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
  );

drop policy if exists "audio_insert" on public.audio;
create policy "audio_insert" on public.audio
  for insert with check (
    public.is_approved()
    and clinic_id in (select public.my_clinics())
    and created_by = auth.uid()
  );

drop policy if exists "audio_update" on public.audio;
create policy "audio_update" on public.audio
  for update
  using (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
  )
  with check (
    public.is_platform_admin()
    or (public.is_approved() and clinic_id in (select public.my_clinics()))
  );

-- ── 13. Storage read policies: global admin → platform admin ─────
drop policy if exists "photos_storage_read" on storage.objects;
create policy "photos_storage_read" on storage.objects
  for select using (bucket_id = 'photos' and (public.is_platform_admin() or public.is_approved()));

drop policy if exists "audio_storage_read" on storage.objects;
create policy "audio_storage_read" on storage.objects
  for select using (bucket_id = 'audio' and (public.is_platform_admin() or public.is_approved()));

-- ── 13b. ai_runs: platform-only read (was global is_admin) ───────
drop policy if exists "ai_runs_select" on public.ai_runs;
create policy "ai_runs_select" on public.ai_runs
  for select using (public.is_platform_admin());

-- ── 14. Drop the global is_admin() ────────────────────────────────
-- Every caller has been re-pointed above. Old name freed for the
-- clinic-scoped overload (same name, different signature).
drop function if exists public.is_admin();
