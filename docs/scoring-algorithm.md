# SMART-ARF Scoring & Verdict Specification

**Status: active.** The executable source of truth is `lib/scoring.ts`, pinned
by `tests/lib/scoring.test.ts` — this document is the human-readable spec those
implement. When rules change, change all three together.

Rule decisions below marked **[2026-08]** come from clinical-team feedback
(August 2026); see [Change log](#change-log) for what they replaced and why.

---

## 1. Criteria and points

### Level A — clinical assessment (max 23; 28 with chorea)

| Criterion | Points | Notes |
|---|---|---|
| Joint finding | 0 / 1 / 3 / 5 | None / Monoarthralgia / Polyarthralgia / Migratory Polyarthritis (`JOINT_DEFS`) |
| Heart murmur | +5 | SOB / Edema are severity descriptors only — **0 points** |
| Erythema marginatum | +5 | |
| Subcutaneous nodules | +5 | |
| No obvious alternative diagnosis (NOAD) | +3 | |
| Chorea confirmed (major criterion) | +5 | Set automatically when "chorea present" = Yes |

Context-only inputs — collected, exported, **0 points**: fever, chorea
reported, obvious alternative cause, history of ARF.

### Level B — investigations (max 16)

| Criterion | Points | Notes |
|---|---|---|
| WBC raised **or** ESR/CRP raised | +3 | One shared award — both ticked still totals 3 |
| ASO raised **or** Anti-DNase B raised | +5 | One shared award — both ticked still totals 5 |
| Prolonged PR | +3 | |
| Echo suggestive | +5 | |

- Blood/ECG/Echo "N/A" flags mark a section unavailable — **0 points**.
- Fever duration — **0 points**; decides the verdict when the total is exactly 6.

**Maximum total: 39 (44 with chorea).**

## 2. Verdicts

**There are no overrides.** The score ladder is absolute
**[2026-08]**. (Historically a Level B > 6 confirmation and a
history-of-ARF + fever auto-confirm bypassed the ladder; both retired —
see change log.)

### Level A preview — Steps 3–4, and persisted on Level-A-only saves

| Level A score | Verdict | Level |
|---|---|---|
| < 6 | ARF ruled out | `unlikely` |
| ≥ 6 | ARF Possible | `possible` |

No "Likely" tier at Level A **[2026-08]** — that judgment waits for Level B.

### Final verdict — after Level B; persisted on the encounter

| Total score | Verdict | Level |
|---|---|---|
| < 6 | ARF ruled out | `unlikely` |
| = 6, fever < 2 weeks ago or none | ARF ruled out | `unlikely` |
| = 6, fever ≥ 2 weeks ago or unknown | ARF Possible | `possible` |
| 7–9 | ARF Likely | `likely` |
| ≥ 10 | ARF Confirmed | `confirmed` |

Fever duration "unknown" keeps score 6 at Possible deliberately — no verdict
is shown prematurely in live previews before the question is answered.

## 3. Recommended actions (first line per tier)

Full lists live in the `ACTIONS_*` constants in `lib/scoring.ts` and are
shared between the preview and final paths so wording cannot drift.

| Tier | First action line |
|---|---|
| Ruled out (< 6) | "ARF ruled out — score below 6" |
| Ruled out (score 6, recent fever) | "ARF ruled out — fever was less than 2 weeks ago (or no fever)" |
| Possible | "ARF is possible — do not dismiss" |
| Likely | "ARF is likely — act promptly" |
| Confirmed | "ARF confirmed (score ≥ 10) — initiate management protocol" |

## 4. Advisory banners (inform only — never verdicts) [2026-08]

- **Chorea present** (Steps 3–6): flags a major Jones criterion (+5 to the
  score); management defers to the scored result.
- **Known history of ARF + current fever** (Steps 3–6): flags possible
  recurrence; management defers to the scored result.

Neither banner claims a diagnosis or bypasses the score.

## 5. Data storage

| Field | Contents |
|---|---|
| `encounters.inputs` (jsonb) | Every raw criterion answer — the re-derivable source |
| `encounters.score` (int) | Total at save time (Level A alone for Level-A-only saves) |
| `encounters.result_label` / `level` / `range` / `actions` | Verdict, computed at save time and frozen |
| `encounters.breakdown` (jsonb) | Itemized points (labels + subtotals) |
| `encounters.confirmed_dx` | Clinician's final diagnosis: `''` / `ruled-out` / `possible` / `likely` / `confirmed` **[2026-08]** |

- Verdict fields are **not** recomputed on read — historical rows keep the
  wording of their day. `scripts/rescore-encounters.ts` (owner-run, dry-run
  by default) re-derives them with current rules.
- Legacy `confirmed_dx` values (`arf`, `not-arf`, `uncertain`) map onto the
  new labels for display (`DX_LABEL`); the owner-run migration
  `supabase/migrations/20260819_confirmed_dx_4_options.sql` rewrites them.
- CSV export includes `Level A Score` / `Level B Score` / `Total Score`
  columns; subtotals are recomputed from the stored inputs (Level B blank
  when the encounter never included Level B).

## 6. Tests

`tests/lib/scoring.test.ts` pins: point math per criterion, shared-award
grouping, tier boundaries (0/5/6/7/9/10), the score-6 fever rule, Level A
preview verdicts, both override retirements (including the reported
"score 5 + fever + history showed Positive" case), per-tier actions, and
breakdown shapes. `tests/lib/export.test.ts` pins the score columns and
legacy `confirmed_dx` rendering.

Not covered: banner/component rendering (no component-test infrastructure)
and RLS behavior (`tests/integration`, requires a local Supabase stack).

## Change log

| Date | Change | Replaced |
|---|---|---|
| 2026-08 | Level A preview: <6 ruled out, ≥6 possible, no Likely tier | Combined-tier wording at Level A ("Unlikely" ≤5, "Possible" 6–7, "Likely" ≥8) |
| 2026-08 | Final ladder: <6 ruled out · 6 fever-gated · 7–9 likely · ≥10 confirmed | "Unlikely" ≤5, "Possible" 6–7, "Likely" ≥8 (no confirmed tier) |
| 2026-08 | Retired: Level B > 6 confirms alone | Strong labs now confirm only via total ≥ 10 |
| 2026-08 | Retired: history-of-ARF + fever auto-confirm | Fever + history contributes context only (advisory banner) |
| 2026-08 | Banners reworded to advisory | "ARF Positive … regardless of total score" wording |
| 2026-08 | `confirmed_dx` 4-option graded set | `arf` / `not-arf` / `uncertain` |
