# ARF-FAST assessment version 3 (instrument v3.1) + Part B

New assessments use `inputs.assessmentVersion: 3`. Saved records keep their own
version: unversioned rows are version 1 (legacy Jones), `2` is ARF-FAST v2 with
Level B subtotals, `3` is this path. Nothing backfills or rescores old records —
`scripts/rescore-encounters.ts` now refuses any row with a stored version.

Sources: *ARF-FAST revised v3.1* (DOCX) for the screening and action record;
*case report form master* (PDF) B1–B2 for Part A freeze semantics, the
investigation form, and the final study reference classification.

## Screening (Part A)

- **Intended use is context, not a gate.** Age 3–18 and an endemic or
  moderate/high-risk setting display as information; the app never blocks on
  them. The Step-1 setting picker uses the existing `patient.setting` values.
- **Alternative-explanation rule** (entry, automatic features, scoring): only an
  established cause that clearly and sufficiently explains *that finding*
  excludes it. Uncertain → keep the finding. A concurrent illness never excludes
  the patient. Shown as reminder text; the clinician applies it.
- **Automatic positives are structured**, not one checkbox each:
  - Chorea qualifies only with preserved awareness. Episodes with loss of
    awareness do not qualify and flag urgent neurological assessment.
  - Murmur: any diastolic or apical pansystolic; a previously documented
    innocent murmur alone does not fulfill.
  - Cardiac pattern needs significant breathlessness PLUS orthopnea OR edema OR
    marked activity reduction. Breathlessness alone never qualifies.
  - Characteristic rash or nodules; objective migratory polyarthritis (≥2 joints).
- **Scoring unchanged**: joints 0/1/2/3/4, measured fever ≥38 °C +1,
  first-degree family history +1, previous definite ARF/established RHD +1.
  Family history and previous ARF/RHD are tri-state — **unknown scores 0** and
  is never converted to "No". Total 0–7; ≥2 positive.
- Arthralgia options say "without objective arthritis" (painful restriction can
  be arthritis without visible swelling).
- **Two outputs only**: positive — suspected ARF, or negative — treatment/referral
  threshold not met. An unfinished form is a workflow state, never a third
  classification. Automatic positives bypass scoring ("numerical scoring not
  required" — no step-number references).
- **No Level B on this path**: no lab points, no combined score, no WBC, no
  fever-duration tie-breaker, no "combined interpretation pending" banner.

## Lock and amendments

Part A freezes on first save (`inputs.screeningOriginal` holds the first-ever
answers). Editing a saved v3 screening requires "Amend answers" with a reason;
the save appends `inputs.screeningAmendments` entries (who, when, field,
before → after, reason) and re-derives the score. Exports carry both the
original answers (via the amendment trail) and the corrected values. A failed
save changes nothing; retry reuses the same patient/encounter ids.

## Action record (`inputs.careRecord`)

BPG given / not given / contraindicated, referred, other action, action
date-time, provider, facility. `actionAt` and `recordedAt` stamp on first save
and are never refreshed by later saves (including Part B) unless explicitly
edited — see `mergeCareRecord` in `lib/arfFast31.ts`. The "Referred" checkbox
and the destination-clinic picker write the same encounter referral fields
(`referredTo` / `referredToClinicId`), so they cannot disagree. Provider and
facility default to the screening sign-off and the patient's clinic.

## Part B (`inputs.partB`)

Completed later by the treating team, from the wizard (Step 5 for v3) or the
record screen. Records only — no points, no diagnosis inference.

- ESR (mm/h), CRP (mg/L or mg/dL), ASO and anti-DNase B (value, unit, upper
  reference limit, paired-rise), throat culture and rapid GAS antigen
  (positive/negative/not done), ECG (status, PR ms, prolonged-for-age —
  clinician's call; the app holds no age cutoff table), Doppler echo
  (not done/normal/abnormal; pathological MR and AR each yes/no/uncertain;
  other findings), other investigations free text.
- Every test keeps **not done**, **negative/normal**, **uncertain** (valves),
  and **unanswered** distinct. Validation flags contradictions and numeric
  formats only; unanswered fields are allowed at save.
- Repeat-test rule shown on the form: highest ESR/CRP and antibody values, any
  positive microbiology, ECG/echo findings used for the final diagnosis,
  paired-sample rise captured even though the printed table lacks a box.

### B2 final study reference classification

Definite/probable ARF, ARF excluded, or **Unable to classify** — one category
covering both incomplete assessments and completed-but-uncertain ones; a main
reason is required either way. Diagnostic basis (five Jones pathways) and
episode (first/recurrent/uncertain) are visible when definite/probable is
chosen (visibility ≠ mandatory). The classification is the treating team's and
is independent of the ARF-FAST/SMART-ARF result; the follow-up visit vocabulary
(ruled out / possible / likely / confirmed) is a different, later question and
is never equated with it.

## Study ID and storage

The optional Study ID is typed once in Step 1 and stored in
`inputs.studyId` (shown on screening, Part B, record screen, exports, next to
the referral code). All v3 additions live inside `encounters.inputs` JSONB —
no schema migration, cloud sync passes them through unchanged.

## Version display

Record rows and the patient list label v3 as "ARF-FAST v3.1" and never show a
Level B or combined line. Mixed-version exports append the v3 block (Study ID,
cardiac sub-findings, raw tri-states, care record, amendments, all Part B
fields); v1/v2 rows leave it blank, and v3 rows leave the Level B block blank.

## Verification

`npx tsc --noEmit`, `npx tsc --noEmit -p tests/tsconfig.json`, and
`npx jest --config tests/jest.config.js --runInBand tests/lib` (451 tests).
`scripts/rescore-encounters.ts --selftest` proves the version guard.
