# SMART-ARF (Expo)

Clinical Decision Support & Triage for **Acute Rheumatic Fever (ARF)** — a React
Native / Expo port of the reference web app.

> **The single source of truth for this application is
> [`smart-arf-app.html`](./smart-arf-app.html).** See
> [`SMART-ARF.md`](./SMART-ARF.md) for the full documentation and the
> HTML‑is‑authoritative policy. Any discrepancy between this code and the HTML
> should be resolved in favour of the HTML.

## What's implemented (this build)

This is the **Clinical core (MVP)** scope:

- **Assessment wizard (Steps 1–6)** with the exact ARF scoring algorithm
  (Level A max 23, Level B max 16, tiers Unlikely / Possible / Likely / Highly
  Likely) and chorea auto‑+5 behaviour — ported verbatim from the HTML.
- **Home / landing** with patient history.
- **Records** — searchable list of all assessments.
- **Patient record detail** — result, score breakdown, referral, follow‑up
  history, edit, and soft‑delete with reason taxonomy.
- **Lookup** by referral code (`ARF-XXXX-XXXX`, local device search).
- **Follow‑up visit** form.
- **BPG protocol** 5‑step reference.
- Local persistence via `AsyncStorage`.

Out of scope for this MVP (present in the source HTML, require a backend):
encryption‑at‑rest, PIN/password auth, admin MFA, and server sync. See
[`SMART-ARF.md`](./SMART-ARF.md).

## Get started

```bash
npm install
npx expo start
```

Open in **Expo Go** (iOS / Android) or a simulator/emulator. Web is also
supported (`npx expo start --web`).

> Requires Expo SDK 54. `@react-native-async-storage/async-storage` is pinned to
> **2.2.0** (v3.x is incompatible with SDK 54).

## Project layout

```
app/                     expo-router screens
  (tabs)/                bottom-tab screens: index(home), assess, bpg, records, settings
  lookup.tsx, record.tsx, followup.tsx   top-level routes
components/              UI primitives, result components, WizardHeader, PatientCard
lib/                     scoring.ts (algorithm), types.ts, format.ts, storage.ts
state/                   RecordsContext, AssessmentContext
constants/theme.ts       palette (mirrors HTML CSS variables)
smart-arf-app.html       ★ the source of truth
SMART-ARF.md             documentation / source-of-truth policy
```
