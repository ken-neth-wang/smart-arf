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
export type EchoValue = 'suggestive' | 'not-suggestive' | null;

/** Raw clinical inputs — same shape as the HTML `S` object's clinical fields. */
export interface AssessmentInputs {
  fever: boolean | null;
  chorea: boolean | null;
  altCause: boolean | null;
  choreaPositive: boolean;
  /** 0 | 2 (monoarthralgia) | 3 (polyarthralgia) | 5 (migratory polyarthritis) */
  joint: number;
  murmur: boolean;
  sob: boolean;
  edema: boolean;
  chestpain: boolean;
  walking: boolean;
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
}

export function emptyInputs(): AssessmentInputs {
  return {
    fever: null,
    chorea: null,
    altCause: null,
    choreaPositive: false,
    joint: 0,
    murmur: false,
    sob: false,
    edema: false,
    chestpain: false,
    walking: false,
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
  mrn: string; // unique within deployment (single-country scope); '' if unknown
  phone1: string;
  phone2: string;
  dateOfBirth: string | null; // ISO date (YYYY-MM-DD); null = age unknown
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

  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Convenience: a patient + their encounter timeline (newest first). */
export interface PatientWithHistory {
  patient: Patient;
  encounters: Encounter[];
}

/** The lighter fields a follow-up form collects (outcome block). */
export interface FollowUpFields {
  visitDate: string;
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
 * Legacy compat — re-export the old fused shape ONLY for scoring.ts
 * internals and migration of in-flight wizard state. New code should use
 * Patient + Encounter directly.
 * ─────────────────────────────────────────────────────────────────── */
