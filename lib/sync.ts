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
  FacilityType,
  Patient,
  TierLevel,
  Clinic,
} from './types';
import type { ClinicMembership, UserProfile } from './permissions';
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
  clinic_id: string | null;
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
  facility_type: FacilityType | null;
  confirmed_dx: Encounter['confirmedDx'];
  final_dx: string;
  bpg_status: Encounter['bpgStatus'];
  echo_findings: string;
  complications: string;
  notes: string;
  referred_to: string;
  referred_to_clinic_id: string | null;
  created_at: string;
  updated_at: string;
  inactive: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: Patient['deleteReason'] | null;
  delete_notes: string | null;
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
    clinicId: p.clinic_id ?? null,
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
    clinic_id: p.clinicId ?? null,
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
    facilityType: e.facility_type,
    confirmedDx: e.confirmed_dx,
    finalDx: e.final_dx,
    bpgStatus: e.bpg_status,
    echoFindings: e.echo_findings,
    complications: e.complications,
    notes: e.notes,
    referredTo: e.referred_to,
    referredToClinicId: e.referred_to_clinic_id ?? null,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
    inactive: e.inactive,
    deletedAt: e.deleted_at ?? undefined,
    deletedBy: e.deleted_by ?? undefined,
    deleteReason: e.delete_reason ?? undefined,
    deleteNotes: e.delete_notes ?? undefined,
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
    facility_type: e.facilityType,
    confirmed_dx: e.confirmedDx,
    final_dx: e.finalDx,
    bpg_status: e.bpgStatus,
    echo_findings: e.echoFindings,
    complications: e.complications,
    notes: e.notes,
    referred_to: e.referredTo,
    referred_to_clinic_id: e.referredToClinicId ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    inactive: e.inactive,
    deleted_at: e.deletedAt ?? null,
    deleted_by: e.deletedBy ?? null,
    delete_reason: e.deleteReason ?? null,
    delete_notes: e.deleteNotes ?? null,
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

/** Upsert a single patient. Throws if RLS denies (0 rows persisted). */
export async function savePatientCloud(patient: Patient): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await getSupabase().from('patients').upsert(patientToRow(patient)).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Permission denied — record not saved (RLS). Check clinic assignment / schema.');
}

/** Upsert a single encounter. Throws if RLS denies (0 rows persisted). */
export async function saveEncounterCloud(encounter: Encounter): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { data, error } = await getSupabase().from('encounters').upsert(encounterToRow(encounter)).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Permission denied — record not saved (RLS). Check clinic assignment / schema.');
}

// ─────────────────────────────────────────────────────────────
// Profile + membership mappers (auth)
// ─────────────────────────────────────────────────────────────

export interface ProfileRow {
  id: string;
  display_name: string;
  approved: boolean;
  created_at: string;
}

export interface MembershipRow {
  id: string;
  user_id: string;
  clinic_id: string;
  role: 'health_worker' | 'admin';
  created_at: string;
}

export function rowToProfile(r: ProfileRow): UserProfile {
  return { id: r.id, displayName: r.display_name, approved: r.approved };
}

export function rowToMembership(r: MembershipRow): ClinicMembership {
  return { userId: r.user_id, clinicId: r.clinic_id, role: r.role };
}

/** Load a user's profile (returns null if not found / cloud disabled). */
export async function loadProfileCloud(userId: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as ProfileRow) : null;
}

/** Load a user's clinic memberships. */
export async function loadMembershipsCloud(userId: string): Promise<ClinicMembership[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from('clinic_memberships')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return ((data as MembershipRow[]) ?? []).map(rowToMembership);
}

// ─────────────────────────────────────────────────────────────
// Clinic mapper + loader (for the referral picker)
// ─────────────────────────────────────────────────────────────

export interface ClinicRow {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export function rowToClinic(r: ClinicRow): Clinic {
  return { id: r.id, name: r.name, type: r.type };
}

/** Load all clinics (RLS: any approved user can read). */
export async function loadClinicsCloud(): Promise<Clinic[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase().from('clinics').select('*').order('name');
  if (error) throw error;
  return ((data as ClinicRow[]) ?? []).map(rowToClinic);
}
