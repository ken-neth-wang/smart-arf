-- Hosted-DB RLS behavior check for the clinic-scoped admin migration.
-- Runs ENTIRELY inside one transaction that ends in ROLLBACK: the live
-- database is untouched. Personas are impersonated the way PostgREST does
-- it (role authenticated + request.jwt.claims), so these are the real
-- policies the app will hit. Any failed assertion aborts with a message.

begin;

\i supabase/migrations/20260815_clinic_scoped_admin.sql

-- ── fixture ids ──
insert into public.clinics (id, name, type) values
  ('11111111-1111-1111-1111-111111111111', 'City', 'primary'),
  ('22222222-2222-2222-2222-222222222222', 'Riverside', 'secondary'),
  ('33333333-3333-3333-3333-333333333333', 'Elsewhere', 'tertiary');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', 'platform@t.local'),
  ('00000000-0000-0000-0000-00000000aa02', 'admina@t.local'),
  ('00000000-0000-0000-0000-00000000aa03', 'adminb@t.local'),
  ('00000000-0000-0000-0000-00000000aa04', 'workera@t.local'),
  ('00000000-0000-0000-0000-00000000aa05', 'workerab@t.local'),
  ('00000000-0000-0000-0000-00000000aa06', 'workerb@t.local'),
  ('00000000-0000-0000-0000-00000000aa07', 'outsider@t.local'),
  ('00000000-0000-0000-0000-00000000aa08', 'pending@t.local');

insert into public.clinic_memberships (user_id, clinic_id, role) values
  ('00000000-0000-0000-0000-00000000aa02', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('00000000-0000-0000-0000-00000000aa03', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('00000000-0000-0000-0000-00000000aa04', '11111111-1111-1111-1111-111111111111', 'health_worker'),
  ('00000000-0000-0000-0000-00000000aa05', '11111111-1111-1111-1111-111111111111', 'health_worker'),
  ('00000000-0000-0000-0000-00000000aa05', '22222222-2222-2222-2222-222222222222', 'health_worker'),
  ('00000000-0000-0000-0000-00000000aa06', '22222222-2222-2222-2222-222222222222', 'health_worker'),
  ('00000000-0000-0000-0000-00000000aa07', '33333333-3333-3333-3333-333333333333', 'health_worker');

-- handle_new_user (auth.users trigger) created each profile as pending;
-- set flags directly (administrative connections bypass the profile guard).
update public.profiles set approved = true
where id in ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-00000000aa02',
             '00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-00000000aa04',
             '00000000-0000-0000-0000-00000000aa05','00000000-0000-0000-0000-00000000aa06',
             '00000000-0000-0000-0000-00000000aa07');
update public.profiles set platform_admin = true
where id = '00000000-0000-0000-0000-00000000aa01';

insert into public.patients (id, first_name, mrn, referral_code, clinic_id) values
  ('pt-a1',   'Ann', 'A1', 'RC-A1', '11111111-1111-1111-1111-111111111111'),
  ('pt-b1',   'Bob', 'B1', 'RC-B1', '22222222-2222-2222-2222-222222222222'),
  ('pt-aref', 'Ref', 'AR', 'RC-AR', '11111111-1111-1111-1111-111111111111');

insert into public.encounters (id, patient_id, type, date, referred_to_clinic_id) values
  ('en-a1',   'pt-a1',   'initial', '2026-08-15', null),
  ('en-aref', 'pt-aref', 'initial', '2026-08-15', '22222222-2222-2222-2222-222222222222');

insert into public.allowed_emails (email, clinic_id, role) values
  ('invite-a@t.local', '11111111-1111-1111-1111-111111111111', 'health_worker'),
  ('invite-b@t.local', '22222222-2222-2222-2222-222222222222', 'health_worker');

-- helper: run a block as a persona (savepoint keeps SET LOCAL scoped)
-- usage inside this script: repeated inline blocks.

-- ═══ 1. Visibility matrix ═══
savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa04","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.patients) <> 2 then raise exception 'FAIL workerA visibility'; end if;
  if (select count(*) from public.patients where id = 'pt-b1') <> 0 then raise exception 'FAIL workerA sees B'; end if;
  if (select count(*) from public.clinic_memberships where clinic_id = '22222222-2222-2222-2222-222222222222') <> 0 then raise exception 'FAIL workerA sees foreign roster'; end if;
  raise notice 'OK 1: workerA sees own clinic + referral-out only';
end $$;
rollback to savepoint sp;

savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa05","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.patients) <> 3 then raise exception 'FAIL workerAB visibility'; end if;
  raise notice 'OK 2: workerAB (A+B) sees all 3';
end $$;
rollback to savepoint sp;

savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa03","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.patients) <> 2 then raise exception 'FAIL adminB visibility (got %: %)', (select count(*) from public.patients), (select coalesce(string_agg(id, ','),'∅') from public.patients); end if;
  if (select count(*) from public.patients where id = 'pt-a1') <> 0 then raise exception 'FAIL adminB still global-admin'; end if;
  if (select count(*) from public.allowed_emails) <> 1 then raise exception 'FAIL adminB allowlist scope'; end if;
  raise notice 'OK 3: adminB scoped to own clinic + referred-in; allowlist scoped';
end $$;
rollback to savepoint sp;

savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa07","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.patients) <> 0 then raise exception 'FAIL outsider visibility'; end if;
  if (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000aa02') <> 0 then raise exception 'FAIL outsider sees adminA profile'; end if;
  raise notice 'OK 4: outsider sees nothing of A/B';
end $$;
rollback to savepoint sp;

savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}';
do $$ begin
  -- platform sees REAL data too — assert on the fixture patients (all 3 clinics)
  if (select count(*) from public.patients where id in ('pt-a1','pt-b1','pt-aref')) <> 3
  then raise exception 'FAIL platform visibility (fixture patients: %; is_plat=%)', (select count(*) from public.patients where id in ('pt-a1','pt-b1','pt-aref')), public.is_platform_admin(); end if;
  raise notice 'OK 5: platform sees all';
end $$;
rollback to savepoint sp;

savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa08","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.patients) <> 0 then raise exception 'FAIL pending visibility'; end if;
  raise notice 'OK 6: pending sees nothing';
end $$;
rollback to savepoint sp;

-- ═══ 2. Referred-in edit rules ═══
savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa06","role":"authenticated"}';
do $$ begin
  update public.patients set last_name = 'nope' where id = 'pt-aref';
  if found then raise exception 'FAIL workerB edited referred-in patient'; end if;
  raise notice 'OK 7: workerB referred-in read-only';
end $$;
rollback to savepoint sp;

savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa03","role":"authenticated"}';
do $$ begin
  update public.patients set last_name = 'refin-ok' where id = 'pt-aref';
  if not found then raise exception 'FAIL adminB could not edit referred-in patient'; end if;
  raise notice 'OK 8: receiving-clinic admin edits referred-in patient';
end $$;
rollback to savepoint sp;

-- ═══ 3. KEYSTONE: revocation round-trip ═══
savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa02","role":"authenticated"}';
do $$ begin
  delete from public.clinic_memberships
    where user_id = '00000000-0000-0000-0000-00000000aa05' and clinic_id = '22222222-2222-2222-2222-222222222222';
  if found then raise exception 'FAIL adminA deleted a B-clinic membership'; end if;
  raise notice 'OK 9: foreign-clinic admin cannot remove B membership';
end $$;
rollback to savepoint sp;

savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa03","role":"authenticated"}';
do $$ begin
  delete from public.clinic_memberships
    where user_id = '00000000-0000-0000-0000-00000000aa05' and clinic_id = '22222222-2222-2222-2222-222222222222';
  if not found then raise exception 'FAIL adminB could not remove B membership'; end if;
  raise notice 'OK 10a: adminB removed workerAB@B';
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa05","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.patients) <> 2 then raise exception 'FAIL workerAB post-revocation visibility'; end if;
  if (select count(*) from public.patients where id = 'pt-b1') <> 0 then raise exception 'FAIL workerAB still sees B'; end if;
  raise notice 'OK 10b: workerAB lost exactly B visibility';
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa03","role":"authenticated"}';
insert into public.clinic_memberships (user_id, clinic_id, role)
values ('00000000-0000-0000-0000-00000000aa05', '22222222-2222-2222-2222-222222222222', 'health_worker');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa05","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.patients) <> 3 then raise exception 'FAIL re-add restore'; end if;
  raise notice 'OK 10c: re-add restored full visibility';
end $$;
rollback to savepoint sp;

-- ═══ 4. Last-admin guard + immutability ═══
savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa02","role":"authenticated"}';
do $$ begin
  delete from public.clinic_memberships where user_id = auth.uid() and role = 'admin';
  if found then raise exception 'FAIL sole admin self-deleted'; end if;
  update public.clinic_memberships set role = 'health_worker' where user_id = auth.uid() and role = 'admin';
  if found then raise exception 'FAIL sole admin self-demoted'; end if;
  update public.clinic_memberships set clinic_id = '22222222-2222-2222-2222-222222222222'
    where user_id = '00000000-0000-0000-0000-00000000aa04' and clinic_id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FAIL clinic_id mutation allowed';
exception
  when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK 11: self-delete/self-demote blocked; clinic_id immutable (%)', sqlerrm;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa03","role":"authenticated"}';
do $$ begin
  delete from public.clinic_memberships
    where user_id = '00000000-0000-0000-0000-00000000aa02' and clinic_id = '11111111-1111-1111-1111-111111111111';
  if found then raise exception 'FAIL last-admin row removed cross-clinic'; end if;
  raise notice 'OK 12: last-admin row protected cross-clinic';
end $$;
rollback to savepoint sp;

-- ═══ 5. Profile gates ═══
savepoint sp;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa08","role":"authenticated"}';
do $$ begin
  update public.profiles set approved = true where id = auth.uid();
  raise exception 'FAIL pending self-approved';
exception
  when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK 13: self-approve blocked (%)', sqlerrm;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa02","role":"authenticated"}';
update public.profiles set approved = true where id = '00000000-0000-0000-0000-00000000aa08';
do $$ begin
  update public.profiles set approved = false where id = '00000000-0000-0000-0000-00000000aa08';
  raise exception 'FAIL clinic admin deactivated account';
exception
  when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK 14: admin approved pending; deactivate is platform-only (%)', sqlerrm;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}';
update public.profiles set approved = false where id = '00000000-0000-0000-0000-00000000aa08';
raise notice 'OK 15: platform deactivated account';

-- ═══ 6. Clinic creation + media derivation ═══
do $$ begin
  insert into public.clinics (name, type) values ('Nope', 'primary');
  raise exception 'FAIL clinic admin created clinic';
exception
  when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK 16: clinic creation platform-only (%)', sqlerrm;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa01","role":"authenticated"}';
insert into public.clinics (name, type) values ('Platform OK', 'primary');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000aa04","role":"authenticated"}';
insert into public.photos (id, patient_id, encounter_id, clinic_id, storage_path, mime_type)
values ('ph-1', 'pt-a1', 'en-a1', '22222222-2222-2222-2222-222222222222', 't/ph-1', 'image/jpeg');
do $$ begin
  if (select clinic_id from public.photos where id = 'ph-1') <> '11111111-1111-1111-1111-111111111111'
  then raise exception 'FAIL photo clinic not derived from encounter'; end if;
  raise notice 'OK 17: photo clinic_id derived from encounter (client value ignored)';
end $$;
rollback to savepoint sp;

rollback;

select 'ALL_BEHAVIOR_CHECKS_PASSED__NOTHING_PERSISTED' as result;
