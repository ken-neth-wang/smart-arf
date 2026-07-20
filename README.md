# SMART-ARF

Clinical decision support & triage for **Acute Rheumatic Fever (ARF)** — a
React Native / Expo app with a Supabase backend. Originally ported from a
reference web prototype; **the app code is now the source of truth** (the
clinical scoring values live in `lib/scoring.ts`).

Live web build: **https://ken-neth-wang.github.io/smart-arf/**

## What's implemented

**Clinical core**
- Assessment wizard (Steps 1–6) with the ARF scoring algorithm (Level A max 23,
  Level B max 16; tiers Unlikely / Possible / Likely / Highly Likely; Level B > 6
  → "Positive ARF (Level B confirmed)"; chorea auto-+5).
- Patient records, search, referral-code lookup (`ARF-XXXX-XXXX`), follow-up
  visits, soft-delete with reason taxonomy.
- BPG protocol 5-step dosing reference.

**Backend, auth & roles**
- Supabase: email/password auth, session persistence, cloud sync.
- Clinic-scoped Row-Level Security (own clinic + referrals-in); soft-delete only
  (no hard-delete path).
- Roles `health_worker` / `admin`; admins get super-admin read+update across **all**
  clinics via `is_admin()` RLS.
- Allowlist pre-approval (`allowed_emails`); admin console (clinics, users,
  pending approvals, deactivation, deleted-visit restore).
- Per-clinic MRN uniqueness; cross-clinic patient linking via `referral_code`.

**AI triage inputs** (Supabase Edge Functions → Gemini; **flag-only — never affect the Jones score**)
- 📷 **Photo** — skin-rash upload → Gemini 3.5 Flash vision (Gemma fallback) → suspicion flag.
- 🎧 **Audio** — auscultation recording → murmur flag.
- 🎙 **Voice-dictation** — dictate findings → auto-check criteria across Steps 2/3/5 (review-then-apply).

## Tech stack
- Expo SDK 54, React Native, expo-router, TypeScript.
- Supabase (Postgres + Auth + Storage + Edge Functions / Deno).
- Google Gemini API (`gemini-3.5-flash`) for vision / audio / voice.
- Jest for pure-logic unit tests.

## Get started
```bash
npm install
cp .env.example .env      # fill EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```
Open in Expo Go (iOS/Android), a simulator, or the web (`npx expo start --web`).

> Requires Expo SDK 54. `@react-native-async-storage/async-storage` is pinned to **2.2.0** (v3.x is incompatible).

## Project layout
```
app/        expo-router screens — (tabs): home, assess, bpg, records, settings
components/ UI primitives, results, WizardHeader, PhotoCard, AudioCard, VoiceFillCard
lib/        scoring.ts (algorithm), types.ts, sync.ts, photos.ts, audio.ts, voice.ts, permissions.ts
state/      RecordsContext, AssessmentContext, AuthContext
supabase/   schema.sql, seed.sql, functions/{analyze-photo,analyze-audio,transcribe-assessment}
tests/      Jest unit tests (pure logic)
```

## Data model
Two anchors: **Patient** (one human, stable `referral_code`, per-clinic `mrn`) and
**Encounter** (`type: 'initial' | 'followup'`, clinic-scoped, carries scores +
criteria). Photos and audio attach to an encounter. All tables carry `clinic_id`
for RLS; soft-delete only (`inactive`, `deleted_at`). Cross-clinic continuity is
via the shared `referral_code`, **not** MRN.

Tables: `clinics, profiles, clinic_memberships, allowed_emails, patients,
encounters, photos, audio`. Canonical SQL: `supabase/schema.sql` (full reset) +
`supabase/seed.sql` (dev bootstrap).

## Roles & access
- **`health_worker`** — sees own clinic's patients + those referred *to* their clinic.
- **`admin`** — same, **plus** super-admin read+update across all clinics (`is_admin()` RLS bypass); manages clinics/users/allowlist via the admin console.
- Memberships are many-to-many (`clinic_memberships`) so a worker can float between clinics.
- Sign-up is gated by the allowlist; matching emails auto-approve.

## Web deploy (GitHub Pages)
Auto-deploys when you push a tag:
```bash
git tag v0.4 && git push origin v0.4
```
Watch **Actions → "Deploy Web"**; live in ~1–2 min. One-time repo setup:
Settings → Pages → branch `gh-pages` / root. `app.json` sets
`web.baseUrl = "/smart-arf/"` (use `"/"` for a custom domain). Native iOS/Android
use `eas build` / `eas submit` (separate).

## Testing
Pure logic is unit-tested; the React component layer is manual/integration only.
```bash
./scripts/test        # runs Jest (config in tests/jest.config.js)
```

## Security notes
- The web bundle is public (anon key is baked into the JS); **RLS is the real security boundary.**
- AI features send data to the Gemini API (**not HIPAA-compliant**) — flag-only, review-then-apply, dictate findings only (no patient identifiers).
- **Phase 3a** (PIN lock, encryption-at-rest, backup/export) gates storing real PHI on a device.

See [TODOs.md](./TODOs.md) for what's shipped vs. pending.
