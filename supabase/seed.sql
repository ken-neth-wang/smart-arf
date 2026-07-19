-- SMART-ARF — Dev seed
--
-- Run AFTER schema.sql (which wipes everything incl. user accounts). Stands up
-- one clinic + allowlists ONE email as admin. Then SIGN UP with that email →
-- auto-approved admin. (If a user with that email already exists, step 3
-- re-attaches their profile/membership so a plain login works too.)
--
-- 👇 EDIT THE ONE EMAIL: find/replace ADMIN_EMAIL@example.com below 👇
--    (the Supabase SQL editor has no variables, so just replace the literal)

-- 1. Dev clinic — FIXED id so re-running never creates duplicates.
insert into public.clinics (id, name, type)
values ('00000000-0000-0000-0000-000000000001', 'Dev Clinic', 'primary')
on conflict (id) do nothing;

-- 2. Allowlist the admin email.
--    • FRESH signup with it  → handle_new_user auto-approves + assigns admin.
insert into public.allowed_emails (email, clinic_id, role)
values ('ADMIN_EMAIL@example.com', '00000000-0000-0000-0000-000000000001', 'admin')
on conflict (email) do update set clinic_id = excluded.clinic_id, role = excluded.role;

-- 3. EXISTING-user fallback. handle_new_user only fires on NEW signups, so if
--    the auth account already exists (auth.users survives a schema reset) a
--    plain login won't recreate the profile. This re-establishes it directly.
insert into public.profiles (id, display_name, email, approved)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)), u.email, true
from auth.users u
where u.email = 'ADMIN_EMAIL@example.com'
on conflict (id) do update set approved = true, email = excluded.email;

insert into public.clinic_memberships (user_id, clinic_id, role)
select u.id, '00000000-0000-0000-0000-000000000001', 'admin'
from auth.users u
where u.email = 'ADMIN_EMAIL@example.com'
on conflict (user_id, clinic_id) do update set role = 'admin';

-- ── Verify ────────────────────────────────────────────────────
-- select p.email, p.approved, cm.role, c.name as clinic
-- from public.profiles p
-- join public.clinic_memberships cm on cm.user_id = p.id
-- join public.clinics c on c.id = cm.clinic_id;
--
-- Expected (after you've signed up / logged in once): one row, approved=true, role=admin.
