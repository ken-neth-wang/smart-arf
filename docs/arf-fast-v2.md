# ARF-FAST assessment version 2

New assessments use `inputs.assessmentVersion: 2`. Existing unversioned records
are version 1; editing them retains the legacy questionnaire and scoring. Nothing
backfills or rewrites old records. All additional fields fit inside the existing
`encounters.inputs` JSON, so no schema migration is required by this change.

## Saved data and interpretation

`inputs.arfFast` holds separate entry screening flags, urgent acknowledgement,
automatic-positive findings, the selected joint category, measured fever,
first-degree family history, and documented prior ARF/RHD. Screening flags do not
automatically become confirmed findings. Missing new fields on legacy encounters
are not interpreted as negative answers.

The `arfFast.result` snapshot stores the method (`automatic` or `score`), Level A
label, nullable Level A score, nullable Level B subtotal, and whether combined
interpretation is pending. Numerical Level A scores range from 0 to 7; 2 or more
is ARF-FAST positive. Any automatic-positive finding bypasses the numerical score
and stores null, never zero. The Level A label is a screening result, not a
confirmed diagnosis.

Level B retains its grouped point calculation, shown separately. Version 2 never
applies legacy combined thresholds. For a combined assessment, the top-level
`score` and `level` are null, and `range` records that combined interpretation is
pending clinical review. Level A-only numerical assessments store their Level A
score in `score`; all v2 records have null `level` and an empty `actions` array.
No pending-review banner appears on Level A-only results.

CSV exports retain legacy columns and append version-2 answers, result method,
screening result, and combined status. Version-2 rows leave Total Score and Risk
Tier blank, and populate the distinct Level A / Level B Score columns. Legacy
columns which do not describe the new questions remain blank on version-2 rows.

## Flow and implementation choices

- Entry criteria: if none are checked, ask for explicit confirmation to proceed;
  do not assign a negative result or silently exclude the patient.
- Urgent-needs page (2026-10: informational only — the instrument's Step-2
  safety wording plus Next; no acknowledgement recorded, nothing blocks).
- Continue on automatic features confirms that checklist was reviewed. Any
  selected finding skips the scoring questions and opens clinician sign-off.
- Numerical scoring requires an explicit joint selection and all three yes/no
  answers. Sign-off is required before saving either pathway.
- Results retain referral, optional Level B, and manual final-diagnosis entry.
- Photo/audio controls appear after Level A is saved because their existing
  upload path requires a saved encounter. Legacy placements are unchanged.
- Existing voice autofill describes legacy fields and remains available only in
  the legacy flow. It is not used to infer the new clinical definitions.

Internal legacy step IDs 1–6 remain stable. Named screens `urgent`,
`automatic`, and `fast-score` insert FAST stages before results; results and
investigations use stage labels rather than the legacy numbering.

## Clinical review still needed

Specify combined Level A + Level B interpretation (including automatic-positive
cases) and associated recommendations. No combined diagnostic rule is assumed.
Review the entry/acknowledgement/completion choices above. No hosted Supabase
changes, deployments, or remote git operations are part of this implementation.

## Rollout

Older app builds are not forward-compatible with version-2 records: their record
views and exports assume legacy scoring. Coordinate the client update before
entering version-2 assessments on a shared backend. The new build reads both
versions; it does not make older deployed builds version-aware.

## Local verification

Run `./node_modules/.bin/tsc --noEmit` and
`./node_modules/.bin/jest --config tests/jest.config.js --runInBand tests/lib`.
The tests cover all numerical combinations, every automatic-positive trigger,
required answers, legacy restoration, separate Level B snapshots, and exports.

Verified: 321 unit tests, TypeScript, changed-file lint, and an offline web build.
An isolated mobile-width browser check covered numerical and automatic-positive
paths, separate Level B results, saved-record reload, and legacy-record editing.
