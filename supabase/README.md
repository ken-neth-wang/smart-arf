# Supabase data layer (QA / test-harness)

Cloud sync for `PatientRecord`, so QA can verify data flows across devices.
**Not for production** until the client-side encryption layer is added.

> See `../ROADMAP.md` Phase 3b. The encryption layer (Phase 3a) must land
> before any real patient data is synced.

## Setup (one-time, ~5 min)

1. **Create a project** at [supabase.com](https://supabase.com) (free tier, email signup).
2. **Get your keys:** Project Settings → API → copy the **Project URL** and the **anon public** key.
3. **Create `.env`** from `.env.example` (in the project root) and paste your keys:
   ```bash
   cp .env.example .env
   # edit .env: set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
   ```
4. **Create the tables:** open Supabase's **SQL Editor** → paste the contents of `supabase/schema.sql` → Run.
5. **Install the client:**
   ```bash
   npm install @supabase/supabase-js
   ```
6. **Enable cloud sync** by flipping the backend flag in `.env`:
   ```env
   EXPO_PUBLIC_DATA_BACKEND=supabase
   ```

Restart `npx expo start` after changing `.env`.

## How it works

The app keeps its existing local-first `AsyncStorage` flow as the default. Cloud
sync is **opt-in via env var** — the `RecordsContext` reads
`EXPO_PUBLIC_DATA_BACKEND` and switches between two implementations with
identical signatures:

| Mode | Backend | Used by default? |
|------|---------|:--:|
| `local` (default) | `lib/storage.ts` → AsyncStorage | ✅ |
| `supabase` | `lib/sync.ts` → your Supabase project | QA opt-in |

Both expose the same operations (`loadRecords`, `saveRecord`, `deleteRecord`,
`lookupByCode`), so the rest of the app doesn't change.

## Schema

Two tables — maps 1:1 to `lib/types.ts`:

```
patients   ← PatientRecord (top-level fields)
  └─ followups  ← FollowUp[] (nested, FK → patients.id, cascade delete)
```

JSON fields (`breakdown`, `actions`, `inputs`) are stored as `jsonb`. Everything
else is a typed column.

## Security posture (read this before real data)

The QA policies in `schema.sql` are **permissive**: anyone with the anon key
(which is in your bundle) can read/write all rows. That's intentional for
proving the flow with test data. Before any real patient data:

1. Add the client-side encryption layer (Phase 3a) so only ciphertext is synced.
2. Replace the `qa_*` RLS policies with authenticated, clinic-scoped policies.
3. Add Supabase Auth so each clinic has an identity (the `patient_code` lookup
   must be gated by an authorized clinic, not the public anon key).

See `../ROADMAP.md` Phase 3a → 3b.
