# SMART-ARF — Product Spec

> Source of truth: `smart-arf-app.html`.

## 1. The app

SMART-ARF is a single-page app with a fixed **bottom tab bar that is always visible**:

| Tab | Name         | What it is                                                                           |
| --- | ------------ | ------------------------------------------------------------------------------------ |
| 🏠  | **Home**     | Landing — start a new assessment, look up a patient by code, see recent assessments. |
| ＋  | **Assess**   | The assessment flow (Step 1 → 6). The core of the app — see **§2**.                  |
| 💉  | **BPG**      | **Info only** — static Benzathine Penicillin G protocol reference.                   |
| 📋  | **Records**  | All patient records on this device + a search box (name, MRN, or code).              |
| ⚙️  | **Settings** | Clinic details + sync server (boilerplate for now).                                  |

### 🏠 Home

- **＋ New Patient Assessment** (primary) → starts Step 1.
- **🔍 Look Up Patient by Code** → enter `ARF-XXXX-XXXX` to open a record.
- **Recent Assessments (N)** — recent patient cards (tier-colored). Empty state: "No assessments yet."

### 💉 BPG (info)

Static 5-step BPG administration protocol — verify indication → weight-based dose → deep IM Z-track → observe 30 min → schedule 3–4 weekly follow-up. Reference only, no data entry.

### 📋 Records

Searchable list of every assessment saved on this device. Search covers name, MRN, and referral code. Tapping a record opens its **detail** view: patient meta (unmasked), date, score result box, score breakdown, recommended actions, follow-up history, and edit / add-follow-up / remove.

### ⚙️ Settings

> Configure your clinic details and sync server. These settings are saved on this device.

- **Clinic / Site Name** — e.g. _Kordofan District Clinic_
- **Clinic API Key** _(provided by your data coordinator)_
- **Sync Server URL** — `https://your-server.com` — the address of the SMART-ARF sync server.
- **Test Connection** · **Save Settings**
- **Device Info** — Device ID, e.g. `dev-szi0ekx9-mqpq5n0w`

> Server sync is not wired up yet — these fields are boilerplate. Cloud sync comes later.

---

## 2. Assessment (the core)

Tapping **Assess** (or **New Patient Assessment** from Home) starts a fresh assessment and walks the clinician through a fixed flow:

```
Step 1          Step 2           Step 3         Step 4              Step 5        Step 6
Patient   →   Entry Criteria  →  Level A   →   Level A Result   →   Level B   →   Final Result
                                     │               │
                                     └───────────────┴── record auto-saved to device here
```

- **Step 1 — Patient:** name, MRN, phones, age (1–25), gender, setting (endemic / non-endemic / unknown — **captured, not scored**), test-entry toggle.
- **Step 2 — Entry Criteria:** fever? · chorea? · obvious cause for fever? Chorea = Yes sets `choreaPositive` (auto +5 later).
- **Step 3 — Level A:** signs & symptoms checklist (joint, carditis, skin, alt-diagnosis) with a live Level A score tally.
- **Step 4 — Level A Result:** result card + recommended actions + referral code. **Record is saved here.** Optionally continue to Level B.
- **Step 5 — Level B:** enhanced findings (blood tests, ECG, echo) with per-section Not-Available toggles.
- **Step 6 — Final Result:** combined score, full breakdown, referral code. → Start New.

Progress bar = `(step − 1) / 4`. Tapping another tab mid-assessment warns: _"Your in-progress assessment will be saved if you have reached the scoring screen."_ Editing a record from its detail rehydrates the assessment at Step 3 on the **same record id**.

### Scoring

**Level A — max 23**

| Category                    | Item                                                             | Points        |
| --------------------------- | ---------------------------------------------------------------- | ------------- |
| Joint (radio, highest wins) | None / Monoarthralgia / Polyarthralgia / Migratory Polyarthritis | 0 / 2 / 3 / 5 |
| Carditis                    | Heart murmur                                                     | 5             |
|                             | SOB / edema / chest pain / can't walk _(severity only)_          | 0             |
| Skin                        | Erythema marginatum                                              | 5             |
|                             | Subcutaneous nodules                                             | 5             |
| Alt. diagnosis              | No obvious alternative diagnosis                                 | 3             |
| Chorea                      | set at Step 2                                                    | 5             |

**Level B — max 16**

| Category | Item                                          | Points |
| -------- | --------------------------------------------- | ------ |
| Blood    | Inflammation markers (any of WBC / ASO / ESR) | 3      |
|          | Anti-DNase B positive                         | 5      |
| ECG      | Prolonged PR interval                         | 3      |
| Echo     | Suggestive of RHD / Not suggestive (radio)    | 5 / 0  |

**Total = Level A + Level B.** Toggling NA on a Level B section unchecks its items and renders "Not Available" (no points).

| Score | Tier     | Label             |
| ----- | -------- | ----------------- |
| 0–5   | unlikely | ARF Unlikely      |
| 6–9   | possible | ARF Possible      |
| 10–14 | likely   | ARF Likely        |
| ≥15   | urgent   | ARF Highly Likely |

Each tier carries its own **recommended actions** list (e.g. ≥15 → start BPG now, urgent referral, initiate long-term prophylaxis). **Chorea positive overrides the tier:** a banner persists across Steps 3–6 and forces "start BPG + refer urgently regardless of total score."

**Referral code:** `ARF-XXXX-XXXX`, from a 31-char unambiguous alphabet (no `0 O 1 I L`).

### How records are saved

- The record is **auto-saved to the device the first time you reach the Level A Result (Step 4)** — i.e. when you tap _View Result & Recommendations_. It is created **once** per assessment; Level B and later edits update the same record, they don't make a new one.
- At that moment the referral code is generated and the record is written to local storage with a timestamp.
- **For now everything is device-local only** (offline-first). **Cloud sync** (push/pull to a SMART-ARF server) is planned for later — the Settings tab already holds the clinic / API-key / sync-server fields as boilerplate.
- Device cap: **200 records** (oldest dropped beyond that).
- Removing a record is a **soft-delete** with a reason (duplicate, wrong patient, test entry, error, withdrew consent, other).

---

## 3. Out of scope (for now)

PIN / password auth · encryption-at-rest · admin MFA · device revocation & reset · live server sync & server-side lookup · background idle-lock · printed referral slip.
