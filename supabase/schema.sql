-- SMART-ARF — Supabase schema (patient-anchored, QA / test harness)
--
-- Two tables: patients (the anchor) + encounters (any clinical visit).
-- Mirrors lib/types.ts Patient + Encounter. For QA: prove data goes in and
-- comes out across devices. NOT for production until the client-side
-- encryption layer (Phase 3a) is added — this schema stores plaintext by
-- design for now and must be wrapped in encryption before real patient data.
--
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- If upgrading from the previous 2-table (patients+followups) prototype:
--   DROP TABLE IF EXISTS public.followups;
--   DROP TABLE IF EXISTS public.patients;
-- then run this file.

-- ─────────────────────────────────────────────────────────────
-- patients — the anchor
-- ─────────────────────────────────────────────────────────────
create table if not exists public.patients (
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
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    text,
  delete_reason text,
  delete_notes  text
);

create index if not exists patients_referral_code_idx on public.patients (referral_code);
create index if not exists patients_inactive_idx on public.patients (inactive);
-- MRN uniqueness: only enforce on non-empty values (single-country scope).
-- Multi-clinic/country scoping deferred — drop this index if collisions arise.
create unique index if not exists patients_mrn_unique
  on public.patients (mrn) where mrn <> '';

-- ─────────────────────────────────────────────────────────────
-- encounters — all clinical visits (initial assessments + follow-ups)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.encounters (
  id              text primary key,
  patient_id      text not null references public.patients(id) on delete cascade,
  type            text not null,            -- 'initial' | 'followup'
  date            text not null,

  -- scoring block (null when not scored — pure followup without re-assessment)
  inputs          jsonb,
  score           integer,
  level           text,
  result_label    text,
  range           text,
  breakdown       jsonb,
  actions         jsonb,
  includes_level_b boolean not null default false,

  -- outcome block (empty string when not assessed)
  confirmed_dx    text not null default '',
  final_dx        text not null default '',
  bpg_status      text not null default '',
  echo_findings   text not null default '',
  complications   text not null default '',
  notes           text not null default '',

  referred_to     text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists encounters_patient_id_idx on public.encounters (patient_id);
create index if not exists encounters_type_idx on public.encounters (type);
create index if not exists encounters_updated_at_idx on public.encounters (updated_at desc);

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security
--
-- OPEN for QA. This lets anyone with the anon/publishable key read/write —
-- exactly what QA testing needs (no auth configured yet). Before real data,
-- replace these with authenticated, clinic-scoped policies (Phase 3a/3b).
-- ─────────────────────────────────────────────────────────────
alter table public.patients enable row level security;
alter table public.encounters enable row level security;

-- QA policies: permissive. DELETE before production.
drop policy if exists "qa_read_patients"   on public.patients;
drop policy if exists "qa_write_patients"  on public.patients;
drop policy if exists "qa_update_patients" on public.patients;
drop policy if exists "qa_delete_patients" on public.patients;
create policy "qa_read_patients"   on public.patients  for select using (true);
create policy "qa_write_patients"  on public.patients  for insert with check (true);
create policy "qa_update_patients" on public.patients  for update using (true);
create policy "qa_delete_patients" on public.patients  for delete using (true);

drop policy if exists "qa_read_encounters"   on public.encounters;
drop policy if exists "qa_write_encounters"  on public.encounters;
drop policy if exists "qa_update_encounters" on public.encounters;
drop policy if exists "qa_delete_encounters" on public.encounters;
create policy "qa_read_encounters"   on public.encounters  for select using (true);
create policy "qa_write_encounters"  on public.encounters  for insert with check (true);
create policy "qa_update_encounters" on public.encounters  for update using (true);
create policy "qa_delete_encounters" on public.encounters  for delete using (true);
