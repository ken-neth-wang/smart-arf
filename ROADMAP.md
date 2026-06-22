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

## What's deliberately not here

- **AI / voice / murmur detection** — real potential, but it belongs *after* Phase 3a. AI on top of an unencrypted, un-backed-up store amplifies the risk. When it comes, it should *assist capture*, not *diagnose* — the validated score stays authoritative. That keeps you in decision-support, not SaMD territory.
