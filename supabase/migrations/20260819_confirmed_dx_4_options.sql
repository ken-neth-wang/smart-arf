-- ═══════════════════════════════════════════════════════════════════
-- Migration: confirmed_dx option set change (clinical-team feedback
-- 2026-08)
--
-- What changes (DATA ONLY — no schema):
--   confirmed_dx values move from  '' | 'arf' | 'not-arf' | 'uncertain'
--   to                          '' | 'ruled-out' | 'possible' | 'likely' | 'confirmed'
--   (the graded outcome mirroring the verdict vocabulary).
--
-- Mapping:
--   'arf'       → 'confirmed'   (ARF Confirmed ≈ Confirmed)
--   'not-arf'   → 'ruled-out'   (Not ARF ≈ Ruled out)
--   'uncertain' → ''            (no clean successor → not assessed)
--
-- OWNER-RUN: apply against the hosted Smart-ARF project. Run step 1
-- first to see the current distribution; step 3 verifies completeness.
-- App display already tolerates unmigrated values (lib/format.ts
-- DX_LABEL carries the legacy mappings), so timing is not critical.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Pre-flight (read-only): what's stored today?
-- select confirmed_dx, count(*) from encounters group by 1 order by 2 desc;

-- 2) Migrate the values.
update encounters set confirmed_dx = 'confirmed' where confirmed_dx = 'arf';
update encounters set confirmed_dx = 'ruled-out' where confirmed_dx = 'not-arf';
update encounters set confirmed_dx = ''           where confirmed_dx = 'uncertain';

-- 3) Verify: should return 0 rows.
-- select id, confirmed_dx from encounters
--  where confirmed_dx not in ('', 'ruled-out', 'possible', 'likely', 'confirmed');
