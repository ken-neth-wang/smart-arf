# SMART-ARF — TODOs

> Single living tracker: what's shipped vs. what's pending. Process one item at a time.
> 🟢 = clear to implement · 🔴 = needs a decision / wording / data before coding.

## ✅ Shipped

**Clinical core**
- Assessment wizard (Steps 1–6), ARF scoring (Level A/B, tiers, chorea auto-+5).
- Patient records, search, referral-code lookup, follow-ups, soft-delete + reason taxonomy.
- BPG protocol reference.

**Clinical-review fixes (A1, B1, B2, B3, C1-green, C2-green, D4, E1, E2, F1)**
- Level A/B shown separately; Level B > 6 → "Positive ARF (Level B confirmed)"; removed "group" tag (markers show "+3"); facility-type field; single "Suggestive of RHD" echo; murmur/SOB/edema inline warning; removed print/copy slip; reorganized record + assessment headers; BPG link from referral; 15-min post-BPG observation.

**Backend, auth & roles**
- Supabase cloud sync (clinic-scoped RLS, cross-device full-history referral scope).
- Email/password auth; allowlist pre-approval; admin console (clinics, users, approvals, deactivation, deleted-visit restore).
- Roles `health_worker` / `admin`; super-admin read+update via `is_admin()` RLS; soft-delete only (no hard-delete path).
- Per-clinic MRN uniqueness (no cross-clinic merge); cross-clinic link via `referral_code`.

**AI triage (Gemini, flag-only)**
- 📷 Photo skin-rash triage — Gemini 3.5 Flash + Gemma fallback.
- 🎧 Audio auscultation murmur flag.
- 🎙 Voice-dictation form-fill (review-then-apply).
- Edge functions: `analyze-photo`, `analyze-audio`, `transcribe-assessment`.

---

## 🔴 Needs a decision (ask clinical team)
- **A3 — Fever duration** — capture 24–72h. Sub-question vs inline wording? Extend `fever` (bool) → `{ present, durationHours? }` + update `lib/scoring.ts`.
- **B2 — confirm `> 6`** threshold for "Level B confirmed" before real use.
- **C1 — facility-type scoring impact** — currently record-only; should Primary/Secondary change interpretation?
- **C2-red — RHD echo wording** — "suggestive of RHD" → definite vs borderline per WHF criteria?
- **F2 — confirm 15-min** post-BPG observation window.
- **G4 — data-export design** — format (CSV/XLSX/FHIR), scope/fields (PHI), who runs it, server-side job.

## 🟡 Open app issues
- **Null-clinic patients** — `clinic_id IS NULL` patients exist. Decide: enforce clinic on creation (block) vs. go clinic-optional.
- **`upsertPatient` swallows cloud errors** — patient added to local state *before* cloud save; errors only `console.error`. Surface to the UI.
- **Stale memberships** — memberships added via SQL don't refresh the app's `user.memberships` until re-login.
- **`deletedBy: 'local'`** on soft-delete — could capture `auth.uid()` for meaningful audit.
- **Storage bytes not clinic-scoped** — photo/audio bytes rely on unguessable UUID paths, not RLS isolation. Harden before real PHI.

## 🗺 Roadmap / next phases
- **Phase 3a — security** *(gates real-data deployment)*: PIN lock, encryption-at-rest, backup/export. Required before storing real MRNs/phones on a device.
- **Native builds** — `eas build` / `eas submit` for iOS/Android (web is live).
- **In-browser mic for voice** — direct MediaRecorder capture on mobile (file-upload is the current fallback).
- **MedGemma swap** — try MedGemma (vision-capable, medical-trained) as alternative photo primary; pair with a labeled erythema-marginatum dataset (the `clinician_label` field is the training path).
- **National health ID** — if a deployment country has one, add it as the cross-clinic match key (MRN stays clinic-local).
- **`researcher` role** — deferred (currently `health_worker` / `admin` only).
- **OAuth** — Google sign-in (email/password is live).
