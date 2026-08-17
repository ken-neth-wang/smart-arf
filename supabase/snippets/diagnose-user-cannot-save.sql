-- ═══════════════════════════════════════════════════════════════
-- DIAGNOSTIC (read-only) — "user can log in but patient saves never
-- appear in the database"
--
-- Run in the Supabase SQL editor. Replace the two placeholders:
--   'HER@EMAIL'   her actual login email (case doesn't matter)
--   'CLINIC-ID'   the uuid of the clinic she should belong to
--
-- Everything here is SELECT-only. Nothing mutates.
-- ═══════════════════════════════════════════════════════════════

-- 1 ─ Identity + approval + auth recency ─────────────────────────
-- KEY READS:
--   approved = false        → gate should trap her on /login; if she's
--                             in the app, something else is going on.
--   last_sign_in_at recent  → she IS authenticating against THIS
--                             project (rules out a stale build pointed
--                             at an old project).
--   No row at all           → she's logging in with a different email
--                             than you think (run 1b).
select u.id, u.email, u.email_confirmed_at, u.last_sign_in_at, u.created_at as auth_created,
       p.display_name, p.approved, p.platform_admin
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('HER@EMAIL');

-- 1b ─ Catch a different/dupe account by display name or email fragment
select p.id, p.display_name, p.email, p.approved, p.platform_admin,
       u.last_sign_in_at, u.created_at as auth_created
from public.profiles p
join auth.users u on u.id = p.id
where p.display_name ilike '%PART OF HER NAME%'
   or p.email ilike '%PART OF HER EMAIL%';

-- 2 ─ Her clinic memberships (THE #1 SUSPECT) ────────────────────
-- patients_insert requires clinic_id ∈ my_clinics(). Zero rows here
-- (or a row pointing at the wrong/duplicate clinic) = every patient
-- insert is RLS-denied, while login still works (approved=true is
-- all the gate checks).
select m.user_id, p.email, m.clinic_id, c.name as clinic_name, c.type,
       m.role, m.created_at as member_since
from public.clinic_memberships m
join public.profiles p on p.id = m.user_id
join public.clinics c on c.id = m.clinic_id
where p.email = lower('HER@EMAIL');

-- 3 ─ Duplicate clinic rows? (saves landing in the "other" clinic)
select id, name, type, created_at
from public.clinics
order by lower(name), created_at;

-- 4 ─ Did her uid EVER write anything, in ANY clinic? ────────────
-- Run with her uuid from step 1. Recent rows ⇒ saves ARE landing and
-- you were looking in the wrong clinic / filtered them out (check
-- clinic_id + is_test + inactive below). Zero rows ⇒ the inserts were
-- denied (RLS or constraint) — go to step 5.
select id, referral_code, first_name, last_name, mrn, clinic_id,
       is_test, inactive, deleted_at, created_at, created_by
from public.patients
where created_by = 'HER-UUID'
order by created_at desc;

-- 5 ─ MRN collision for the specific patient she tried ───────────
-- patients_mrn_clinic_unique covers SOFT-DELETED rows too (the app's
-- own dedup ignores them, so a re-admission of a previously removed
-- patient explodes on this index with a duplicate-key error).
select id, mrn, first_name, last_name, clinic_id,
       inactive, deleted_at, delete_reason, created_at
from public.patients
where mrn = 'THE-MRN-SHE-ENTERED'
  and clinic_id = 'CLINIC-ID';

-- 6 ─ Optional: recent encounters by her (same logic as step 4)
select e.id, e.patient_id, e.type, e.date, e.created_at, e.created_by
from public.encounters e
where e.created_by = 'HER-UUID'
order by e.created_at desc
limit 20;
