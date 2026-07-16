-- SMART-ARF — Supabase schema (patient-anchored + roles/auth)
--
-- Tables: clinics, profiles, clinic_memberships, patients, encounters
-- RLS: authenticated + clinic-scoped (full-history referral model)
-- Auth: email/password (Supabase Auth); Google OAuth later.
--
-- FRESH INSTALL — drops + recreates all public tables. Run in the Supabase
-- SQL editor. Then run bootstrap-admin.sql to create the first admin.

-- ═══════════════════════════════════════════════════════════════
-- DROP (clean slate)
-- ═══════════════════════════════════════════════════════════════
drop table if exists public.encounters cascade;
drop table if exists public.patients cascade;
drop table if exists public.clinic_memberships cascade;
drop table if exists public.profiles cascade;
drop table if exists public.clinics cascade;
drop table if exists public.allowed_emails cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.set_audit_fields();
drop function if exists public.is_approved();
drop function if exists public.my_clinics();
drop function if exists public.patient_visible(text);

-- ═══════════════════════════════════════════════════════════════
-- clinics — the facility entity (roles needs it)
-- ═══════════════════════════════════════════════════════════════
create table public.clinics (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       text not null default '',   -- 'primary' | 'secondary' | 'tertiary'
  created_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════
-- profiles — 1:1 with auth.users (auth.users is locked; holds app metadata)
-- ═══════════════════════════════════════════════════════════════
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email        text not null default '',   -- denormalized from auth.users (auth schema isn't API-readable)
  approved     boolean not null default false,   -- the invite gate: false = pending
  created_at   timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════
-- clinic_memberships — user ↔ clinic ↔ role (many-to-many)
-- ═══════════════════════════════════════════════════════════════
create table public.clinic_memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  role       text not null check (role in ('health_worker','admin')),
  created_at timestamptz not null default now(),
  unique (user_id, clinic_id)
);

-- ═══════════════════════════════════════════════════════════════
-- allowed_emails — pre-approval allowlist (admin enters before signup)
-- A signup whose email is here → auto-approved + auto-assigned clinic/role.
-- ═══════════════════════════════════════════════════════════════
create table public.allowed_emails (
  email      text primary key,                       -- matched case-insensitively by the trigger
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  role       text not null default 'health_worker' check (role in ('health_worker','admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  used_at    timestamptz                            -- null until claimed by a signup
);

-- ═══════════════════════════════════════════════════════════════
-- patients — the anchor (now clinic-scoped + audited)
-- ═══════════════════════════════════════════════════════════════
create table public.patients (
  id            text primary key,
  referral_code text unique not null,
  first_name    text not null default '',
  last_name     text not null default '',
  mrn           text not null default '',
  phone1        text not null default '',
  phone2        text not null default '',
  date_of_birth date,
  gender        text not null default '',
  setting       text not null default '',
  is_test       boolean not null default false,
  inactive      boolean not null default false,
  clinic_id     uuid references public.clinics(id),
  created_by    uuid references auth.users(id) default auth.uid(),
  updated_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text,
  delete_notes  text
);

create index patients_referral_code_idx on public.patients (referral_code);
create index patients_clinic_id_idx      on public.patients (clinic_id);
create index patients_inactive_idx       on public.patients (inactive);
-- MRN uniqueness only on non-empty values (single-country scope assumed).
create unique index patients_mrn_unique on public.patients (mrn) where mrn <> '';

-- ═══════════════════════════════════════════════════════════════
-- encounters — clinical visits (now with referred_to_clinic_id + audited)
-- ═══════════════════════════════════════════════════════════════
create table public.encounters (
  id                    text primary key,
  patient_id            text not null references public.patients(id) on delete cascade,
  type                  text not null,            -- 'initial' | 'followup'
  date                  text not null,
  -- scoring block (null when not scored — pure followup)
  inputs                jsonb,
  score                 integer,
  level                 text,
  result_label          text,
  range                 text,
  breakdown             jsonb,
  actions               jsonb,
  includes_level_b      boolean not null default false,
  facility_type         text,                     -- 'primary' | 'secondary' | null (assessment-level, record-only)
  -- outcome block
  confirmed_dx          text not null default '',
  final_dx              text not null default '',
  bpg_status            text not null default '',
  echo_findings         text not null default '',
  complications         text not null default '',
  notes                 text not null default '',
  referred_to           text not null default '',
  referred_to_clinic_id uuid references public.clinics(id),
  created_by            uuid references auth.users(id) default auth.uid(),
  updated_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index encounters_patient_id_idx            on public.encounters (patient_id);
create index encounters_type_idx                  on public.encounters (type);
create index encounters_referred_to_clinic_id_idx on public.encounters (referred_to_clinic_id);
create index encounters_updated_at_idx            on public.encounters (updated_at desc);

-- ═══════════════════════════════════════════════════════════════
-- Trigger: auto-create a profile on signup (approved = false → pending)
-- ═══════════════════════════════════════════════════════════════
-- handle_new_user v2: allowlisted email → auto-approve + auto-assign;
-- otherwise pending. security definer → bypasses RLS (no auth.uid() at signup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  ae record;
  nm text;
begin
  nm := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));

  select * into ae from public.allowed_emails
    where lower(email) = lower(new.email)
    limit 1;

  if found then
    insert into public.profiles (id, display_name, email, approved)
      values (new.id, nm, new.email, true)
      on conflict (id) do update
        set approved = true, display_name = excluded.display_name, email = excluded.email;

    insert into public.clinic_memberships (user_id, clinic_id, role)
      values (new.id, ae.clinic_id, ae.role)
      on conflict (user_id, clinic_id) do update set role = excluded.role;

    update public.allowed_emails set used_at = now() where email = ae.email;
  else
    insert into public.profiles (id, display_name, email, approved)
      values (new.id, nm, new.email, false)
      on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- Trigger: refresh updated_at + updated_by on every update
-- ═══════════════════════════════════════════════════════════════
create or replace function public.set_audit_fields()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger patients_set_audit
  before update on public.patients
  for each row execute function public.set_audit_fields();

create trigger encounters_set_audit
  before update on public.encounters
  for each row execute function public.set_audit_fields();

-- ═══════════════════════════════════════════════════════════════
-- RLS helper functions (SECURITY DEFINER → bypass RLS, no recursion)
-- ═══════════════════════════════════════════════════════════════

-- Is the current user approved?
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select approved from public.profiles where id = auth.uid()), false)
$$;

-- Is the current user an admin of any clinic?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.clinic_memberships
    where user_id = auth.uid() and role = 'admin'
  )
$$;

-- The clinic ids the current user belongs to.
create or replace function public.my_clinics()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select clinic_id from public.clinic_memberships where user_id = auth.uid()
$$;

-- Is a patient visible to the current user? (own clinic OR referred in)
create or replace function public.patient_visible(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.patients p
    where p.id = pid
    and (
      p.clinic_id in (select public.my_clinics())
      or exists (
        select 1 from public.encounters e
        where e.patient_id = pid
        and e.referred_to_clinic_id in (select public.my_clinics())
      )
    )
  )
$$;

-- ═══════════════════════════════════════════════════════════════
-- Row-Level Security
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles            enable row level security;
alter table public.clinic_memberships  enable row level security;
alter table public.clinics             enable row level security;
alter table public.patients            enable row level security;
alter table public.encounters          enable row level security;

-- profiles: a user reads/edits only their own (so unapproved users can see
-- their own "pending" status). INSERT happens via the handle_new_user trigger.
drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
-- profiles: self read/update (so unapproved users see their own pending state);
-- admins can read ALL profiles and approve (update approved) any of them.
-- (INSERT still happens only via the handle_new_user trigger.)
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- clinic_memberships: a user reads their own; admins read all + assign memberships.
drop policy if exists "memberships_self_select" on public.clinic_memberships;
create policy "memberships_self_select" on public.clinic_memberships
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "memberships_admin_insert" on public.clinic_memberships;
create policy "memberships_admin_insert" on public.clinic_memberships
  for insert with check (public.is_admin());
drop policy if exists "memberships_admin_update" on public.clinic_memberships;
create policy "memberships_admin_update" on public.clinic_memberships
  for update using (public.is_admin()) with check (public.is_admin());

-- allowed_emails: admin-only (read + write). Public cannot enumerate the list.
alter table public.allowed_emails enable row level security;
drop policy if exists "allowlist_admin_all" on public.allowed_emails;
create policy "allowlist_admin_all" on public.allowed_emails
  for all using (public.is_admin()) with check (public.is_admin());

-- clinics: any approved user can read the clinic list; admins can create one.
drop policy if exists "clinics_approved_read" on public.clinics;
create policy "clinics_approved_read" on public.clinics
  for select using (public.is_approved());
drop policy if exists "clinics_admin_insert" on public.clinics;
create policy "clinics_admin_insert" on public.clinics
  for insert with check (public.is_admin());

-- patients: full-history scoping. No DELETE policy → hard-delete denied.
drop policy if exists "patients_select" on public.patients;
drop policy if exists "patients_insert" on public.patients;
drop policy if exists "patients_update" on public.patients;
create policy "patients_select" on public.patients
  for select using (public.is_approved() and public.patient_visible(id));
create policy "patients_insert" on public.patients
  for insert with check (
    public.is_approved()
    and clinic_id in (select public.my_clinics())
    and created_by = auth.uid()
  );
create policy "patients_update" on public.patients
  for update using (
    public.is_approved() and clinic_id in (select public.my_clinics())
  ) with check (
    public.is_approved() and clinic_id in (select public.my_clinics())
  );

-- encounters: visible if the patient is visible; editable at your clinic.
drop policy if exists "encounters_select" on public.encounters;
drop policy if exists "encounters_insert" on public.encounters;
drop policy if exists "encounters_update" on public.encounters;
create policy "encounters_select" on public.encounters
  for select using (public.is_approved() and public.patient_visible(patient_id));
create policy "encounters_insert" on public.encounters
  for insert with check (
    public.is_approved()
    and public.patient_visible(patient_id)
    and created_by = auth.uid()
  );
create policy "encounters_update" on public.encounters
  for update using (public.is_approved() and public.patient_visible(patient_id))
  with check (public.is_approved() and public.patient_visible(patient_id));
