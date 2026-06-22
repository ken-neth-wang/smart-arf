# SMART-ARF — Product Spec

> Source of truth: `smart-arf-app.html`.

## The app

A single-page app with a fixed bottom tab bar (always visible):

- **🏠 Home** — start a new assessment, look up a patient by referral code, see recent assessments.
- **＋ Assess** — the assessment questionnaire (6 steps). The core of the app.
- **💉 BPG** — static Benzathine Penicillin G protocol reference (info only, no data entry).
- **📋 Records** — searchable list of all assessments on this device; tap to open a record's detail.
- **⚙️ Settings** — clinic details + sync server (boilerplate; not wired up yet).

## Assessment flow

A multi-step questionnaire: **Patient → Entry Criteria → Level A → Level A Result → Level B → Final Result.** Each step is a form (toggles, radios, checkboxes). The result screens show a score, a risk tier, recommended actions, and a referral code (`ARF-XXXX-XXXX`).

- Record is **auto-saved to the device at the Level A Result step**; Level B and later edits update that same record.
- Tapping another tab mid-assessment warns before leaving.
- Records can be edited, given a follow-up visit, or soft-deleted (with a reason).
- **Chorea positive** overrides the tier — forces "start BPG + refer urgently" regardless of score.

Everything is **device-local only** (offline-first). Cloud sync is planned for later. Device cap: 200 records.

## Out of scope (for now)

PIN / password auth · encryption-at-rest · admin MFA · device revocation & reset · live server sync & server-side lookup · background idle-lock · printed referral slip.
