/**
 * Type definitions for SMART-ARF.
 * Field names mirror the data model in smart-arf-app.html (the `S` object,
 * PatientRecord, FollowUp). smart-arf-app.html is the source of truth.
 */

export type Gender = '' | 'male' | 'female' | 'other';
export type Setting = '' | 'endemic' | 'nonendemic' | 'unknown';
export type TierLevel = 'unlikely' | 'possible' | 'likely' | 'urgent' | 'chorea' | 'incomplete';
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

export interface FollowUp {
  id: string;
  visitDate: string; // YYYY-MM-DD
  confirmedDx: ConfirmedDx;
  finalDx: string;
  bpgStatus: BpgStatus;
  echoFindings: string;
  complications: string;
  notes: string;
  createdAt: string; // ISO
}

export interface BreakdownRow {
  label: string;
  points: number | null;
  kind?: 'item' | 'sub' | 'subtotal' | 'total' | 'na' | 'empty';
}

/** A saved patient assessment record. Mirrors the object saved in HTML saveRecord(). */
export interface PatientRecord {
  id: string;
  patientCode: string;
  date: string; // "DD Mon YYYY, HH:MM"
  firstName: string;
  lastName: string;
  mrn: string;
  phone1: string;
  phone2: string;
  age: number | null;
  gender: Gender;
  setting: Setting;
  isTest: boolean;
  inactive: boolean;
  score: number;
  level: TierLevel;
  resultLabel: string;
  range: string;
  breakdown: BreakdownRow[];
  actions: string[]; // plain text
  referredTo: string;
  followups: FollowUp[];
  inputs: AssessmentInputs;
  includesLevelB: boolean;
  updatedAt?: string;
  // soft-delete metadata
  deletedReason?: DeleteReason;
  deletedAt?: string;
  deletedNotes?: string;
}
