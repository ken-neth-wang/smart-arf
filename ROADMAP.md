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

**Goal:** Installable app on a real device, from the App Store and Google Play.

- **EAS Build** (Expo's cloud build) → standalone `.apk`/`.aab` (Android) and `.ipa` (iOS). No eject required — Expo SDK 54 stays managed.
- **Accounts:** Apple Developer ($99/yr) + Google Play Developer ($25 once). Both take days to approve.
- **`expo-updates`** → push fixes over-the-air without re-reviewing the app. Bug fixes go out instantly; new screens/features still go through store review.
- **App metadata:** name, icon, screenshots, privacy URL, support contact. The stores require these.
- **Internal TestFlight (iOS) + internal testing track (Android)** → distribute to your pilot clinicians before public launch.

**Done when:** a clinician installs it from a store link, on their own phone, with no help from you.

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
- **Server sync** so a referral code actually reaches the receiving clinic. (HTML specifies the API: `/api/sync`, `/api/lookup/:code`, `/api/followup`.)
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
