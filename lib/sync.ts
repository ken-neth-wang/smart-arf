/**
 * Cloud sync layer for Patient + Encounter (QA / test-harness).
 *
 * Maps the lib/types.ts Patient/Encounter <-> the Supabase tables defined in
 * supabase/schema.sql. Mirrors the loadData/saveData signatures of
 * lib/storage.ts so RecordsContext can swap backends.
 *
 * NOT for production until the encryption layer is added (Phase 3a/3b).
 */
import type {
  AssessmentInputs,
  BreakdownRow,
  Encounter,
  EncounterType,
  Patient,
  TierLevel,
} from './types';
import { getSupabase, isSupabaseConfigured } from './supabase';

// ─────────────────────────────────────────────────────────────
// snake_case <-> camelCase row types
// ─────────────────────────────────────────────────────────────

export interface PatientRow {
  id: string;
  referral_code: string;
  first_name: string;
  last_name: string;
  mrn: string;
  phone1: string;
  phone2: string;
  date_of_birth: string | null;
  gender: Patient['gender'];
  setting: Patient['setting'];
  is_test: boolean;
  inactive: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: Patient['deleteReason'] | null;
  delete_notes: string | null;
}

export interface EncounterRow {
  id: string;
  patient_id: string;
  type: EncounterType;
  date: string;
  inputs: AssessmentInputs | null;
  score: number | null;
  level: TierLevel | null;
  result_label: string | null;
  range: string | null;
  breakdown: BreakdownRow[] | null;
  actions: string[] | null;
  includes_level_b: boolean;
  confirmed_dx: Encounter['confirmedDx'];
  final_dx: string;
  bpg_status: Encounter['bpgStatus'];
  echo_findings: string;
  complications: string;
  notes: string;
  referred_to: string;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Patient mappers
// ─────────────────────────────────────────────────────────────

export function rowToPatient(p: PatientRow): Patient {
  return {
    id: p.id,
    referralCode: p.referral_code,
    firstName: p.first_name,
    lastName: p.last_name,
    mrn: p.mrn,
    phone1: p.phone1,
    phone2: p.phone2,
    dateOfBirth: p.date_of_birth,
    gender: p.gender,
    setting: p.setting,
    isTest: p.is_test,
    inactive: p.inactive,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    deletedAt: p.deleted_at ?? undefined,
    deletedBy: p.deleted_by ?? undefined,
    deleteReason: p.delete_reason ?? undefined,
    deleteNotes: p.delete_notes ?? undefined,
  };
}

export function patientToRow(p: Patient): PatientRow {
  return {
    id: p.id,
    referral_code: p.referralCode,
    first_name: p.firstName,
    last_name: p.lastName,
    mrn: p.mrn,
    phone1: p.phone1,
    phone2: p.phone2,
    date_of_birth: p.dateOfBirth,
    gender: p.gender,
    setting: p.setting,
    is_test: p.isTest,
    inactive: p.inactive,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt ?? null,
    deleted_by: p.deletedBy ?? null,
    delete_reason: p.deleteReason ?? null,
    delete_notes: p.deleteNotes ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Encounter mappers
// ─────────────────────────────────────────────────────────────

export function rowToEncounter(e: EncounterRow): Encounter {
  return {
    id: e.id,
    patientId: e.patient_id,
    type: e.type,
    date: e.date,
    inputs: e.inputs,
    score: e.score,
    level: e.level,
    resultLabel: e.result_label,
    range: e.range,
    breakdown: e.breakdown,
    actions: e.actions,
    includesLevelB: e.includes_level_b,
    confirmedDx: e.confirmed_dx,
    finalDx: e.final_dx,
    bpgStatus: e.bpg_status,
    echoFindings: e.echo_findings,
    complications: e.complications,
    notes: e.notes,
    referredTo: e.referred_to,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

export function encounterToRow(e: Encounter): EncounterRow {
  return {
    id: e.id,
    patient_id: e.patientId,
    type: e.type,
    date: e.date,
    inputs: e.inputs,
    score: e.score,
    level: e.level,
    result_label: e.resultLabel,
    range: e.range,
    breakdown: e.breakdown,
    actions: e.actions,
    includes_level_b: e.includesLevelB,
    confirmed_dx: e.confirmedDx,
    final_dx: e.finalDx,
    bpg_status: e.bpgStatus,
    echo_findings: e.echoFindings,
    complications: e.complications,
    notes: e.notes,
    referred_to: e.referredTo,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────
// Public API — mirrors lib/storage.ts signatures
// ─────────────────────────────────────────────────────────────

interface CloudData {
  patients: Patient[];
  encounters: Encounter[];
}

/** Load all patients + encounters. */
export async function loadDataCloud(): Promise<CloudData> {
  if (!isSupabaseConfigured) return { patients: [], encounters: [] };
  const [pRes, eRes] = await Promise.all([
    getSupabase().from('patients').select('*'),
    getSupabase().from('encounters').select('*'),
  ]);
  if (pRes.error) throw pRes.error;
  if (eRes.error) throw eRes.error;
  return {
    patients: ((pRes.data as PatientRow[]) ?? []).map(rowToPatient),
    encounters: ((eRes.data as EncounterRow[]) ?? []).map(rowToEncounter),
  };
}

/** Upsert a single patient. */
export async function savePatientCloud(patient: Patient): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase().from('patients').upsert(patientToRow(patient));
  if (error) throw error;
}

/** Upsert a single encounter. */
export async function saveEncounterCloud(encounter: Encounter): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase().from('encounters').upsert(encounterToRow(encounter));
  if (error) throw error;
}

/** Hard-delete a patient + (via cascade) their encounters. */
export async function deletePatientCloud(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase().from('patients').delete().eq('id', id);
  if (error) throw error;
}

/** Hard-delete a single encounter. */
export async function deleteEncounterCloud(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase().from('encounters').delete().eq('id', id);
  if (error) throw error;
}

/** Look up a single patient by referral code. Mirrors the HTML /api/lookup/:code. */
export async function lookupByCodeCloud(code: string): Promise<Patient | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getSupabase()
    .from('patients')
    .select('*')
    .eq('referral_code', code.toUpperCase().replace(/\s+/g, ''))
    .maybeSingle();
  if (error) throw error;
  return data ? rowToPatient(data as PatientRow) : null;
}
