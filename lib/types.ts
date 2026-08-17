/**
 * Type definitions for SMART-ARF (patient-anchored model).
 *
 * Two core entities:
 *   - Patient   : one real human, stable across visits (the anchor)
 *   - Encounter : any clinical visit (initial assessment OR follow-up)
 *
 * The clinical vocabulary (AssessmentInputs, BreakdownRow, TierLevel, etc.) is
 * unchanged from the original port. smart-arf-app.html remains the source of
 * truth for scoring values; the patient/encounter split is a clean data-model
 * layer that the HTML's fused `PatientRecord` only approximated.
 */

export type Gender = '' | 'male' | 'female' | 'other';
export type Setting = '' | 'endemic' | 'nonendemic' | 'unknown';
export type TierLevel = 'unlikely' | 'possible' | 'likely' | 'urgent' | 'chorea' | 'incomplete' | 'confirmed';
export type EchoValue = 'suggestive' | null;
export type FacilityType = 'primary' | 'secondary';
export type FeverDuration = '' | 'none' | 'under2w' | 'over2w';

/** Raw clinical inputs — same shape as the HTML `S` object's clinical fields. */
export interface AssessmentInputs {
  fever: boolean | null;
  chorea: boolean | null;
  altCause: boolean | null;
  historyArf: boolean | null;
  choreaPositive: boolean;
  /** 0 | 2 (monoarthralgia) | 3 (polyarthralgia) | 5 (migratory polyarthritis) */
  joint: number;
  murmur: boolean;
  sob: boolean;
  edema: boolean;
  em: boolean;
  sn: boolean;
  noad: boolean;
  naBlood: boolean;
  naEcg: boolean;
  naEcho: boolean;
  wbc: boolean;
  aso: boolean;
  esr: boolean;
  antidnase: boolean;
  pr: boolean;
  echo: EchoValue;
  /** Level B — time since the fever; decides the verdict when the total score is 6. */
  feverDuration: FeverDuration;
  facilityType: FacilityType | null;
}

export function emptyInputs(): AssessmentInputs {
  return {
    fever: null,
    chorea: null,
    altCause: null,
    historyArf: null,
    choreaPositive: false,
    joint: 0,
    murmur: false,
    sob: false,
    edema: false,
    em: false,
    sn: false,
    noad: false,
    naBlood: false,
    naEcg: false,
    naEcho: false,
    wbc: false,
    aso: false,
    esr: false,
    antidnase: false,
    pr: false,
    echo: null,
    feverDuration: '',
    facilityType: null,
  };
}

export type DeleteReason =
  | 'duplicate'
  | 'wrong-patient'
  | 'test-entry'
  | 'data-entry-error'
  | 'patient-withdrew'
  | 'other';

export type ConfirmedDx = '' | 'arf' | 'not-arf' | 'uncertain';
export type BpgStatus = '' | 'started' | 'continued' | 'stopped' | 'not-given';

export interface BreakdownRow {
  label: string;
  points: number | null;
  kind?: 'item' | 'sub' | 'subtotal' | 'total' | 'na' | 'empty';
}

/* ─────────────────────────────────────────────────────────────────── *
 * Patient — the stable anchor
 * ─────────────────────────────────────────────────────────────────── */

/** The stable patient identity. Created once, reused across all visits. */
export interface Patient {
  id: string;
  referralCode: string; // ARF-XXXX-XXXX — STABLE, unique per human
  firstName: string;
  lastName: string;
  mrn: string; // unique within each clinic; cross-clinic link via referralCode; '' if unknown
  phone1: string;
  phone2: string;
  dateOfBirth: string | null; // ISO date (YYYY-MM-DD); null = unknown. When only age is known, an approximate DOB (Jan 1 of the birth year) is stored with dobApproximate = true.
  dobApproximate: boolean; // true when dateOfBirth was derived from a manually-entered age rather than an exact birth date
  gender: Gender;
  setting: Setting; // endemic/non-endemic — a patient attribute
  isTest: boolean;
  // clinic ownership — which clinic owns this record (RLS scopes on this).
  // null in local mode or for legacy data.
  clinicId?: string | null;
  // soft-delete (patient-level: removes the whole person + their encounters)
  inactive: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: DeleteReason;
  deleteNotes?: string;
  createdAt: string; // ISO — when first registered
  updatedAt: string; // ISO
}

/** Helper: compute display age from DOB (display-only, never stored as age). */
export function ageFromDateOfBirth(dob: string | null, now: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

/** Approximate a DOB (ISO YYYY-MM-DD) from an age in years, using Jan 1 of the
 *  birth year. Used when only the age is known — store with dobApproximate = true
 *  so the age displays as approximate ("~"). Round-trips through ageFromDateOfBirth. */
export function approxDobFromAge(ageYears: number, now: Date = new Date()): string {
  return `${now.getFullYear() - ageYears}-01-01`;
}

const DOB_FULL_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize Step-1 DOB entry before it can reach the database.
 *  - ''            → null (DOB unknown)
 *  - '1998'        → '1998-01-01', approximate (year only — same treatment as
 *                    a manually-entered age)
 *  - '2015-06-15'  → passthrough, exact — must be a REAL date
 *  - anything else → null (invalid; caller must block with a message)
 *
 *  Exists because Postgres rejects malformed dates with 22007 on insert — a
 *  bare year typed into the DOB field used to kill the whole patient save. */
export function normalizeDobEntry(
  raw: string,
): { dateOfBirth: string | null; dobApproximate: boolean } | null {
  const t = raw.trim();
  if (!t) return { dateOfBirth: null, dobApproximate: false };
  if (/^\d{4}$/.test(t)) {
    // The derived Jan-1 date must itself be real. JS parses '0000-01-01' as
    // 1 BC (valid), but Postgres' date type rejects year 0 — bound it explicitly.
    const derived = `${t}-01-01`;
    return Number(t) >= 1 && ageFromDateOfBirth(derived) !== null
      ? { dateOfBirth: derived, dobApproximate: true }
      : null;
  }
  if (DOB_FULL_RE.test(t) && ageFromDateOfBirth(t) !== null) {
    return { dateOfBirth: t, dobApproximate: false };
  }
  return null;
}

/** Keystroke mask for the DOB field: digits only, dashes auto-inserted at the
 *  YYYY-MM-DD positions, capped at 8 digits. A 4-digit value stays a bare
 *  year (Continue normalizes it via normalizeDobEntry); combined, non-date
 *  garbage is untypeable and impossible dates are blocked at the gate. */
export function maskDobInput(raw: string): string {
  const digits = raw.replace(/\D+/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** Display age string with a "~" prefix when the DOB was derived from a manually-
 *  entered age. Returns null when the DOB is unknown/unparseable (no age to show). */
export function formatAge(dob: string | null, approximate = false, now: Date = new Date()): string | null {
  const age = ageFromDateOfBirth(dob, now);
  if (age === null) return null;
  return (approximate ? '~' : '') + age;
}

/* ─────────────────────────────────────────────────────────────────── *
 * Encounter — any clinical visit
 * ─────────────────────────────────────────────────────────────────── */

export type EncounterType = 'initial' | 'followup';

/**
 * Any clinical visit. An 'initial' encounter is a full Jones assessment; a
 * 'followup' is a return visit that MAY include a re-score. The `type` labels
 * the clinician's intent; the nullable blocks below carry what was actually done.
 *
 *   Scoring block (inputs/score/level/...) → null when this encounter did not
 *   include a Jones assessment (pure followup with no re-score).
 *
 *   Outcome block (confirmedDx/bpgStatus/...) → empty string when not assessed.
 */
export interface Clinic {
  id: string;
  name: string;
  type: string; // 'primary' | 'secondary' | 'tertiary' (free text)
}

export interface Encounter {
  id: string;
  patientId: string; // FK → Patient.id
  type: EncounterType;

  // When this encounter happened
  date: string; // "DD Mon YYYY, HH:MM" (initial) / YYYY-MM-DD (followup)

  // ─── Scoring block ───────────────────────────────────────────────
  inputs: AssessmentInputs | null;
  score: number | null;
  level: TierLevel | null;
  resultLabel: string | null;
  range: string | null;
  breakdown: BreakdownRow[] | null;
  actions: string[] | null;
  includesLevelB: boolean;
  facilityType: FacilityType | null;

  // ─── Outcome block ───────────────────────────────────────────────
  confirmedDx: ConfirmedDx; // '' if not assessed
  finalDx: string;
  bpgStatus: BpgStatus;
  echoFindings: string;
  complications: string;
  notes: string;

  // ─── Referral (outcome of any encounter) ─────────────────────────
  referredTo: string;
  // FK → the clinic this patient is referred TO. Drives the "referrals in"
  // RLS (Clinic B sees patients referred to it). null = no clinic referral.
  referredToClinicId?: string | null;

  // ─── Responsible-clinician sign-off ───────────────────────────────
  signedBy?: string;              // typed name of the person responsible ('' / undefined = not signed)
  signedByUserId?: string | null; // auth account that performed the sign-off
  signedAt?: string | null;       // ISO timestamp of the sign-off

  createdAt: string; // ISO
  updatedAt: string; // ISO
  // soft-delete (per-visit: hides just this encounter; patient + others stay)
  inactive: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: DeleteReason;
  deleteNotes?: string;
}

/** Convenience: a patient + their encounter timeline (newest first). */
export interface PatientWithHistory {
  patient: Patient;
  encounters: Encounter[];
}

/** The lighter fields a follow-up form collects (outcome block). */
export interface FollowUpFields {
  visitDate: string;
  signedBy?: string; // typed name of the person responsible for this visit
  confirmedDx: ConfirmedDx;
  finalDx: string;
  bpgStatus: BpgStatus;
  echoFindings: string;
  complications: string;
  notes: string;
}

export interface PatientSummary {
  patient: Patient;
  latestInitial?: Encounter; // newest 'initial' encounter, if any
  encounterCount: number;
  followupCount: number;
}

/* ─────────────────────────────────────────────────────────────────── *
 * Photos — clinician-uploaded skin photos for AI triage + later review.
 * v0 uses a dummy edge function (no real model yet).
 * ─────────────────────────────────────────────────────────────────── */

/** Structured result returned by the analyze-photo edge function. */
export interface PhotoAnalysis {
  arfSuspected: boolean;
  confidence: number; // 0–1
  finding: string;
  notes: string;
  model: string;
}

/** A stored photo + its analysis, anchored to a patient/encounter + clinic. */
export interface PhotoRecord {
  id: string;
  patientId: string | null;
  encounterId: string | null;
  clinicId: string;
  storagePath: string;
  mimeType: string;
  finding: string;
  arfSuspected: boolean;
  confidence: number;
  notes: string;
  model: string;
  clinicianLabel: string | null; // ground truth, filled in later (training set)
  inactive: boolean; // soft-delete flag (hidden from the list when true)
  createdAt: string;
}

/** 3-way auscultation classification from the analyze-audio edge function. */
export type AudioClassification = 'normal' | 'chd' | 'abnormal';

/** Structured result returned by the analyze-audio edge function. */
export interface AudioAnalysis {
  classification: AudioClassification;
  confidence: number; // 0–1
  finding: string;
  notes: string;
  model: string;
}

/** A stored auscultation recording + its analysis, anchored to a patient/encounter + clinic. */
export interface AudioRecord {
  id: string;
  patientId: string | null;
  encounterId: string | null;
  clinicId: string;
  storagePath: string;
  mimeType: string;
  finding: string;
  classification: AudioClassification;
  confidence: number;
  notes: string;
  model: string;
  clinicianLabel: string | null; // ground truth (e.g. "murmur"/"normal"), filled in later → training set
  inactive: boolean; // soft-delete flag (hidden from the list when true)
  createdAt: string;
}

/**
 * Voice-extracted clinical criteria (Steps 2/3/5). Each field is OPTIONAL:
 * present only if the clinician stated it; absent = not mentioned (untouched).
 * Applies via setEntry (Step 2) + setInputs (Step 3/5). Never touches demographics.
 */
export interface VoiceAssessment {
  // Step 2 entry (tri-state)
  fever?: boolean;
  chorea?: boolean;
  altCause?: boolean;
  historyArf?: boolean;
  // Step 3 Level A
  joint?: 'none' | 'monoarthralgia' | 'polyarthralgia' | 'migratory';
  murmur?: boolean;
  sob?: boolean;
  edema?: boolean;
  em?: boolean;
  sn?: boolean;
  noad?: boolean;
  // Step 5 Level B
  facilityType?: 'primary' | 'secondary';
  wbc?: boolean;
  aso?: boolean;
  esr?: boolean;
  antidnase?: boolean;
  pr?: boolean;
  echo?: 'suggestive';
}

/* ─────────────────────────────────────────────────────────────────── *
 * Legacy compat — re-export the old fused shape ONLY for scoring.ts
 * internals and migration of in-flight wizard state. New code should use
 * Patient + Encounter directly.
 * ─────────────────────────────────────────────────────────────────── */
