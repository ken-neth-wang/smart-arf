# SMART-ARF

Clinical decision support & triage for **Acute Rheumatic Fever (ARF)** — a
React Native / Expo app with a Supabase backend.

Live web build: **https://ken-neth-wang.github.io/smart-arf/**

## What it does

- **ARF assessment wizard** — guided steps with automatic Jones-criteria
  scoring and likelihood tiers; the scoring algorithm lives in
  [`lib/scoring.ts`](lib/scoring.ts).
- **Patient records** — search, referral-code lookup, follow-up visits,
  soft-delete with reason. Cross-clinic continuity via shared referral
  codes.
- **Clinic-scoped access** — health workers see their clinic's patients plus
  referrals in; admins manage clinics, users, and approvals across all
  clinics. Sign-up is gated by an email allowlist.
- **AI triage inputs** — photo (rash), audio (murmur), and voice dictation,
  via Gemini. *Flag-only: suggestions never change the score.*
- **BPG dosing reference** — 5-step protocol.

## Running it

```bash
npm install
cp .env.example .env   # fill EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start         # add --web for the browser build
```

> `@react-native-async-storage/async-storage` must stay pinned to **2.2.0** (v3.x breaks).

## Tech

Expo SDK 54 · React Native · TypeScript · Supabase (Postgres, Auth, Storage,
Edge Functions) · Google Gemini · Jest.

## Repo layout

| Path | Contents |
|---|---|
| `app/` | expo-router screens |
| `components/` | UI components |
| `lib/` | scoring, sync, media, permissions logic |
| `state/` | React contexts (auth, records, assessment) |
| `supabase/` | `schema.sql`, `seed.sql`, edge functions |
| `tests/` | Jest unit tests — `./scripts/test` |
| `docs/` | runbooks ([backup & restore](docs/backup-restore.md)) |

## Security notes

- The web bundle is public; **RLS is the real security boundary.**
- AI features send data to Gemini (**not HIPAA-compliant**) — flag-only,
  review-then-apply, no patient identifiers in dictation.
- Real PHI on-device is gated on Phase 3a (PIN lock, encryption-at-rest) —
  see [TODOs.md](TODOs.md).

## Deploying

Push a tag (`git tag v0.4 && git push origin v0.4`) → Actions deploys the web
build to GitHub Pages. Native builds use `eas build` / `eas submit`.
