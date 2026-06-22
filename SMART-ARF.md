# SMART-ARF — Application Documentation

> ## ⚠️ Single Source of Truth
>
> **`smart-arf-app.html` is the TRUE and AUTHORITATIVE source of documentation for this application.**
>
> The HTML file is a complete, working, single-file PWA that implements the entire
> SMART-ARF application (HTML + CSS + vanilla JavaScript, ~3,800 lines). Every behavior,
> every screen, every scoring rule, every color, every data field, and every workflow in
> this app is **defined by and must trace back to** `smart-arf-app.html`.
>
> The React Native / Expo build described below is a **port** of that HTML app. If there is
> **any** discrepancy between this document, the Expo code, and `smart-arf-app.html`, the
> **HTML file wins, always.** Treat it as the specification.
>
> **Source file:** [`smart-arf-app.html`](./smart-arf-app.html)

---

## What SMART-ARF is

**SMART-ARF** (Version 6) is a **Clinical Decision Support & Triage tool for Acute
Rheumatic Fever (ARF)**, designed for frontline healthcare workers in RHD-endemic
settings. It walks a clinician through a structured assessment of a child/adolescent,
scores the findings against a Jones-criteria-derived rubric, and produces a triage result
(Unlikely → Possible → Likely → Highly Likely) with recommended actions and a shareable
referral code.

- **Target population:** children & adolescents (input allows age 1–25; clinical focus 3–18).
- **Design goal:** offline-first, secure-at-rest, usable on low-end phones.

---

## How to read the source of truth

Open `smart-arf-app.html` in two ways:

1. **As an app** — open it directly in a browser to see and click through every screen.
2. **As a spec** — read the source. It is organized in clear sections:

| Section in HTML | What it contains |
|---|---|
| `<style>` (top) | Full design system: CSS variables (colors, radius, shadow), every component style. This is the **visual spec**. |
| `AUTHENTICATION SCREENS` | Boot, Set Password, Set PIN, Unlock PIN, Unlock Password, Device Revoked, Reset Device. |
| `LANDING PAGE` + modals | Home, Settings, MFA enrollment, record view, soft-delete. |
| `STEP 1 … STEP 6` | The assessment flow: Patient → Entry Criteria → Level A → Level A Result → Level B → Final Result. |
| `BPG / RECORDS / LOOKUP / FOLLOW-UP` screens | Supporting screens. |
| `<script>` (bottom) | **All logic**: state machine, scoring functions, crypto, sync, auth, storage. |

---

## High-level map (derived from the HTML — defer to it for exact values)

### Screens
Auth: Boot · Set Password · Set PIN · Unlock PIN · Unlock Password · Device Revoked · Reset Device.
App: Landing · Settings · MFA Enroll · Record View · Soft-Delete.
Assessment: Step 1 Patient → Step 2 Entry Criteria → Step 3 Level A → Step 4 Level A Result → Step 5 Level B → Step 6 Final Result.
Other: BPG Protocol · Records (search) · Lookup · Lookup Result · Follow-Up Form.
Navigation: fixed bottom nav — Home · Assess · BPG · Records · Settings.

### Scoring (authoritative logic lives in `calcLevelA()` / `calcLevelB()` / `getInterp()`)

- **Level A (max 23):** Joint (0/2/3/5) + Murmur (5) + Erythema marginatum (5) + Subcutaneous nodules (5) + No alternative diagnosis (3) + Chorea* (5).
- **Level B (max 16):** Inflammation markers any-of WBC/ASO/ESR (3) + Anti-DNase B (5) + Prolonged PR (3) + Echo suggestive of RHD (5).
- **Total** = Level A + Level B.
- **Chorea** is set at Step 2 and auto-adds +5; banner persists across Steps 3–6.

| Score | Tier | Label |
|---|---|---|
| 0–5 | `unlikely` | ARF Unlikely |
| 6–9 | `possible` | ARF Possible |
| 10–14 | `likely` | ARF Likely |
| ≥15 | `urgent` | ARF Highly Likely |

> ⚠️ The "Setting" field (endemic / non-endemic / unknown) is **captured but does not affect
> scoring** in the source — it is documentation-only. See the HTML to confirm.

### Data model
Patient record, follow-up visit, and settings object shapes are all defined inline in the
HTML's `<script>`. Refer to the HTML for the exact field names, types, and the `inputs`
snapshot used to re-open an assessment for editing.

### Security model (defined in the HTML `<script>`)
Two-tier credentials: a **password** (PBKDF2-derived master key, AES-GCM at rest) and a
**6-digit daily PIN** (wraps the master key). Includes sentinel verification, failed-attempt
lockout (5→5 min, 10→30 min), idle/background re-lock, sensitive re-auth window, admin TOTP
MFA, device revocation, and device-reset. **All of this is specified in the HTML** and must be
ported faithfully if security parity is required.

### Sync model (defined in the HTML `<script>`)
Local-first encrypted storage; best-effort sync to a SMART-ARF server via Bearer-API-key
endpoints (`/api/ping`, `/api/sync`, `/api/lookup/:code`, `/api/followup`, `/api/soft-delete`,
`/admin/mfa/*`). Offline behavior: queue follow-ups, fall back to local lookup. Exact request/
response shapes are visible in the HTML's network functions.

### Patient / referral code
`ARF-XXXX-XXXX`, generated from a 31-character unambiguous alphabet (no `0 O 1 I L`). See
`generatePatientCode()` in the HTML.

### BPG protocol
5-step static reference (verify indication/allergy → prepare weight-based dose → deep IM
Z-track → observe 30 min → schedule 3–4 weekly follow-up). See the `bpgScreen` markup.

### Design system
All colors, radii, shadows, and tap-target sizes are CSS variables at the top of the HTML
`<style>` block (e.g. `--primary: #1a5fa8`, `--radius: 14px`, `--tap: 52px`). Use them as the
theming source.

---

## Relationship to the Expo build

The directory this document lives in also contains an **Expo / React Native** port of the app.
That port is a **re-implementation**; `smart-arf-app.html` remains the specification. When
porting or changing behavior:

1. Read the relevant section of `smart-arf-app.html` first.
2. Mirror its labels, options, point values, thresholds, colors, and flow **exactly**.
3. If the HTML is genuinely ambiguous or appears to have a bug, treat the HTML's actual
   runtime behavior (open it in a browser) as definitive.

---

*This document is a navigation aid. The app is `smart-arf-app.html`.*
