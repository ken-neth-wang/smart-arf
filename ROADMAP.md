# SMART-ARF — Roadmap

> Three phases, in order. Each phase is a shippable milestone.

---

## Phase 1 — Simplify

**Goal:** Every screen passes the "does a busy nurse need this?" test.

- Audit each screen; cut anything that isn't essential to the assessment flow.
- Shorten labels, remove redundant text, collapse sections that repeat info.
- Decide on placeholder content (e.g. BPG "[Photo to be added]") — either fill it or remove it.
- One decision: keep the clinical-safety disclaimer on BPG, or match HTML exactly.
- Trim the verbose Settings scope text once it's no longer a prototype.

**Done when:** a first-time clinician can complete an assessment without reading any text twice.

---

## Phase 2 — Ship

**Goal:** The app is installable/shareable — first on web, then on mobile.

Deploy targets are **independent**; each can ship when ready.

### 2a — Web ✅ *infra done; pending first deploy*
- **GitHub Actions workflow** (`.github/workflows/deploy-web.yml`) builds `expo export -p web` and pushes `dist/` to a `gh-pages` branch.
- **Trigger:** push a `v*` tag (e.g. `git tag v0.1 && git push origin v0.1`), or run manually from the Actions tab.
- **`app.json` `baseUrl: "/smart-arf/"`** is set so assets resolve at the subpath.
- **Live URL:** `https://ken-neth-wang.github.io/smart-arf/`
- **Still pending (one-time):** GitHub Settings → Pages → Source = `gh-pages` branch. Then tag `v0.1`.
- **Limitation:** GitHub Pages is always public — no privacy option. Don't tag until you want it visible. (Custom domain ~$10/yr later if you want a cleaner URL.)

### 2b — Mobile (Android first, iOS later)
- **`eas.json`** is configured with `preview` (installable `.apk`, no store), `production` (store-ready), and `development` profiles.
- **Android APK — no account, no cost:** `npx eas build -p android --profile preview` → shareable download link. Teammates install directly.
- **Google Play — $25 once:** internal-testing track, no review, up to 100 testers. Needs a Google service-account key.
- **iOS — $99/yr:** TestFlight + App Store. Unavoidable fee for any iOS install. **Likely skip** — ship web + Android first; iOS only if a pilot demands it.
- **`expo-updates`** → push OTA fixes (bug-fix-class changes) without re-reviewing the app.

**Done when:** a clinician opens the web URL or installs the Android build on their own phone, with no help from you.

---

## Phase 3 — Data

**Goal:** Patient data is durable, private, and useful beyond one phone.

Split into two steps — the second only matters once the first is solid.

### 3a — Protect & persist (the deployment blocker)
This is what's currently deferred but specified in the HTML. It's plumbing, not invention:
- **PIN lock** + re-lock on idle (HTML specifies it fully).
- **Encryption at rest** (AES-GCM via PBKDF2 key — HTML specifies it).
- **Backup / export** so a lost phone doesn't lose records.
- **Fix the 200-record silent-drop** — at minimum, warn before dropping.
- **Fix mid-assessment data loss** (the nav-guard gap).

*Why first:* you can't ethically store real MRNs + phones on a phone that has no lock and no backup.

### 3b — Connect & aggregate (the long-term value)
- **Backend: Supabase (chosen).** Postgres + auto-generated REST (mirrors the HTML's `/api/sync`, `/api/lookup/:code`, `/api/followup`), native row-level security (non-negotiable for health data), no hard daily caps, self-hostable if a regulator later demands data residency. Firebase now supports Postgres too (SQL Connect), but lacks native RLS — Supabase stays the pick for clinical data.
- **Frontend hosting stays where it is** (GitHub Pages / Netlify). Supabase is the *data layer*, not a host — the two are independent and don't require migration.
- **Cross-device sync** so one patient's history follows them between clinics.
- **Outcome tracking** — you already capture follow-up visits; surface trends per patient.
- **Population dashboards** — ARF is a population disease; clinic/district-level data is the public-health payoff.

**Done when:** a referral written at Clinic A is readable at Clinic B, and a district can see its ARF trends.

---

## Phase 4 — Sense

**Goal:** Optional audio input that can *raise* suspicion, never *clear* it.

Gated behind Phase 3a — no AI on top of an unencrypted, un-backed-up store.

- **Murmur detection via phone mic or cheap stethoscope attachment.**
- **Framed as a triage flag, not a diagnosis.** Auscultation has ~40% sensitivity and ~5% PPV for RHD specifically — it misses most real cases, and most "positives" are innocent murmurs common in children. The validated Jones score stays authoritative; audio can only *add* weight, never remove it.
- **Start from an existing open-source model** — PhysioNet 2022 Challenge solutions (CirCor dataset) or HuggingFace `heart-sound-classification` checkpoints. Do not train from scratch in-house.
- **Expect a domain gap.** Every open dataset (CirCor, PhysioNet 2016/2022) is digital-stethoscope audio, not phone-mic. Plan to collect a small phone-mic set and fine-tune, or accept lower accuracy and say so in the UI.
- **Honest UI framing:** "Audio screening cannot rule out RHD — echo is required for diagnosis."

**Done when:** an audio flag, combined with the clinical score, moves a borderline patient from "watch" to "refer for echo" — and never the reverse.

---

## What stays out of scope

- **Autonomous diagnosis.** The app never decides on its own; it surfaces a validated score and supports a clinician's judgement. That keeps it in decision-support territory, not SaMD (Software as a Medical Device).
- **Murmur → "this is RHD."** A murmur flag is one weak input among several. It never produces an RHD verdict.
