/**
 * Unit tests for the cloud sync data mappers (lib/sync.ts).
 *
 * Tests the camelCase (TypeScript) <-> snake_case (Postgres) conversion WITHOUT
 * a running database. Round-trip + spot-check tests catch the silent corruption
 * bugs (typo'd field names, null/undefined asymmetry) that TypeScript won't.
 */
import { emptyInputs, type Encounter, type Patient } from '@/lib/types';
import {
  encounterToRow,
  patientToRow,
  rowToClinic,
  rowToEncounter,
  rowToMembership,
  rowToPatient,
  rowToProfile,
  type ClinicRow,
  type EncounterRow,
  type MembershipRow,
  type PatientRow,
  type ProfileRow,
} from '@/lib/sync';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function mkPatient(over: Partial<Patient> = {}): Patient {
  return {
    id: 'pat-1',
    referralCode: 'ARF-ABCD-EFGH',
    firstName: 'Test',
    lastName: 'Patient',
    mrn: 'MRN123',
    phone1: '+249912345678',
    phone2: '+249987654321',
    dateOfBirth: '2015-06-15',
    gender: 'male',
    setting: 'endemic',
    isTest: false,
    inactive: false,
    clinicId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    ...over,
  };
}

function mkEncounter(over: Partial<Encounter> = {}): Encounter {
  return {
    id: 'enc-1',
    patientId: 'pat-1',
    type: 'initial',
    date: '22 Jun 2026, 14:30',
    inputs: emptyInputs(),
    score: 14,
    level: 'likely',
    resultLabel: 'ARF Likely',
    range: 'Score 10–14',
    breakdown: [{ label: 'Heart Murmur', points: 5 }],
    actions: ['ARF is likely — act promptly'],
    includesLevelB: true,
    facilityType: null,
    confirmedDx: '',
    finalDx: '',
    bpgStatus: '',
    echoFindings: '',
    complications: '',
    notes: '',
    referredTo: 'Khartoum Pediatric Hospital',
    referredToClinicId: null,
    createdAt: '2026-06-22T14:30:00.000Z',
    updatedAt: '2026-06-22T14:30:00.000Z',
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * patientToRow / rowToPatient
 * ------------------------------------------------------------------ */
describe('patientToRow (Patient → PatientRow)', () => {
  it('converts every field to snake_case', () => {
    expect(patientToRow(mkPatient())).toMatchObject({
      id: 'pat-1',
      referral_code: 'ARF-ABCD-EFGH',
      first_name: 'Test',
      last_name: 'Patient',
      mrn: 'MRN123',
      date_of_birth: '2015-06-15',
      is_test: false,
    });
  });

  it('normalizes undefined soft-delete fields → null', () => {
    const row = patientToRow(mkPatient());
    expect(row.deleted_at).toBeNull();
    expect(row.deleted_by).toBeNull();
    expect(row.delete_reason).toBeNull();
    expect(row.delete_notes).toBeNull();
  });

  it('maps soft-delete fields when populated', () => {
    const row = patientToRow(
      mkPatient({
        inactive: true,
        deletedAt: '2026-07-02T00:00:00.000Z',
        deletedBy: 'nurse-a',
        deleteReason: 'duplicate',
        deleteNotes: 'already entered',
      }),
    );
    expect(row.inactive).toBe(true);
    expect(row.deleted_at).toBe('2026-07-02T00:00:00.000Z');
    expect(row.deleted_by).toBe('nurse-a');
    expect(row.delete_reason).toBe('duplicate');
    expect(row.delete_notes).toBe('already entered');
  });

  it('handles null date_of_birth (unknown DOB)', () => {
    expect(patientToRow(mkPatient({ dateOfBirth: null })).date_of_birth).toBeNull();
  });
});

describe('rowToPatient (PatientRow → Patient)', () => {
  function mkRow(over: Partial<PatientRow> = {}): PatientRow {
    return {
      id: 'pat-1',
      referral_code: 'ARF-ABCD-EFGH',
      first_name: 'Test',
      last_name: 'Patient',
      mrn: 'MRN123',
      phone1: '+249912345678',
      phone2: '',
      date_of_birth: '2015-06-15',
      gender: 'male',
      setting: 'endemic',
      is_test: false,
      inactive: false,
      clinic_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-07-01T10:00:00.000Z',
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      delete_notes: null,
      ...over,
    };
  }

  it('converts to camelCase', () => {
    expect(rowToPatient(mkRow())).toMatchObject({
      id: 'pat-1',
      referralCode: 'ARF-ABCD-EFGH',
      firstName: 'Test',
      lastName: 'Patient',
      dateOfBirth: '2015-06-15',
    });
  });

  it('normalizes null soft-delete → undefined', () => {
    const p = rowToPatient(mkRow());
    expect(p.deletedAt).toBeUndefined();
    expect(p.deleteReason).toBeUndefined();
  });
});

describe('patient round-trip', () => {
  it('preserves a fully-populated patient', () => {
    const original = mkPatient({
      inactive: true,
      deletedAt: '2026-07-02T00:00:00.000Z',
      deletedBy: 'nurse-a',
      deleteReason: 'duplicate',
      deleteNotes: 'x',
    });
    expect(rowToPatient(patientToRow(original))).toEqual(original);
  });

  it('preserves a minimal patient (empty strings, null DOB)', () => {
    const original = mkPatient({
      firstName: '', lastName: '', mrn: '', phone1: '', phone2: '',
      dateOfBirth: null, gender: '', setting: '',
    });
    expect(rowToPatient(patientToRow(original))).toEqual(original);
  });
});

/* ------------------------------------------------------------------ *
 * encounterToRow / rowToEncounter
 * ------------------------------------------------------------------ */
describe('encounterToRow / rowToEncounter', () => {
  it('converts Encounter → EncounterRow with snake_case', () => {
    const row = encounterToRow(mkEncounter());
    expect(row).toMatchObject({
      id: 'enc-1',
      patient_id: 'pat-1',
      type: 'initial',
      includes_level_b: true,
      result_label: 'ARF Likely',
      referred_to: 'Khartoum Pediatric Hospital',
    });
  });

  it('handles a pure followup (scoring block null)', () => {
    const followup = mkEncounter({
      type: 'followup',
      date: '2026-07-01',
      inputs: null, score: null, level: null, resultLabel: null, range: null,
      breakdown: null, actions: null, includesLevelB: false,
      confirmedDx: 'arf', bpgStatus: 'started', echoFindings: 'Mild MR',
    });
    const row = encounterToRow(followup);
    expect(row.inputs).toBeNull();
    expect(row.score).toBeNull();
    expect(row.confirmed_dx).toBe('arf');
    expect(row.bpg_status).toBe('started');
  });

  it('round-trips an initial encounter', () => {
    const original = mkEncounter();
    expect(rowToEncounter(encounterToRow(original))).toEqual(original);
  });

  it('round-trips a followup encounter (nullable scoring block)', () => {
    const original = mkEncounter({
      type: 'followup', date: '2026-07-01',
      inputs: null, score: null, level: null, resultLabel: null,
      range: null, breakdown: null, actions: null,
      confirmedDx: 'not-arf', finalDx: 'Reactive arthritis', bpgStatus: 'stopped',
    });
    expect(rowToEncounter(encounterToRow(original))).toEqual(original);
  });

  it('round-trips facilityType (primary, secondary, null)', () => {
    for (const ft of ['primary', 'secondary', null] as const) {
      const original = mkEncounter({ facilityType: ft });
      const back = rowToEncounter(encounterToRow(original));
      expect(back.facilityType).toBe(ft);
    }
  });
});

/* ------------------------------------------------------------------ *
 * field-name regression guards
 * ------------------------------------------------------------------ */
describe('field-name regression guards', () => {
  it('every snake_case patient field exists', () => {
    const keys = Object.keys(patientToRow(mkPatient())).sort();
    const expected = [
      'id', 'referral_code', 'first_name', 'last_name', 'mrn', 'phone1', 'phone2',
      'date_of_birth', 'gender', 'setting', 'is_test', 'inactive',
      'clinic_id',
      'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'delete_reason', 'delete_notes',
    ].sort();
    expect(keys).toEqual(expected);
  });

  it('every snake_case encounter field exists', () => {
    const keys = Object.keys(encounterToRow(mkEncounter())).sort();
    const expected = [
      'id', 'patient_id', 'type', 'date', 'inputs', 'score', 'level',
      'result_label', 'range', 'breakdown', 'actions', 'includes_level_b',
      'facility_type',
      'confirmed_dx', 'final_dx', 'bpg_status', 'echo_findings',
      'complications', 'notes', 'referred_to', 'referred_to_clinic_id', 'created_at', 'updated_at',
    ].sort();
    expect(keys).toEqual(expected);
  });

  it('the high-risk typo fields round-trip exactly', () => {
    const e = mkEncounter({
      includesLevelB: true,
      resultLabel: 'CUSTOM',
      referredTo: 'CUSTOM REF',
      confirmedDx: 'arf',
    });
    const back = rowToEncounter(encounterToRow(e));
    expect(back.includesLevelB).toBe(true);
    expect(back.resultLabel).toBe('CUSTOM');
    expect(back.referredTo).toBe('CUSTOM REF');
    expect(back.confirmedDx).toBe('arf');
  });
});

/* ------------------------------------------------------------------ *
 * Auth mappers — profile, membership, clinic
 * ------------------------------------------------------------------ */
describe('rowToProfile', () => {
  it('maps snake_case → camelCase', () => {
    const row: ProfileRow = { id: 'u1', display_name: 'Dr. Amina', approved: true, created_at: '2026-01-01T00:00:00.000Z' };
    expect(rowToProfile(row)).toEqual({ id: 'u1', displayName: 'Dr. Amina', approved: true });
  });
  it('preserves approved=false (pending gate)', () => {
    const row: ProfileRow = { id: 'u2', display_name: 'New', approved: false, created_at: '2026-01-01T00:00:00.000Z' };
    expect(rowToProfile(row).approved).toBe(false);
  });
});

describe('rowToMembership', () => {
  it('maps a health_worker membership', () => {
    const row: MembershipRow = { id: 'm1', user_id: 'u1', clinic_id: 'c1', role: 'health_worker', created_at: '2026-01-01T00:00:00.000Z' };
    expect(rowToMembership(row)).toEqual({ userId: 'u1', clinicId: 'c1', role: 'health_worker' });
  });
  it('maps an admin membership', () => {
    const row: MembershipRow = { id: 'm2', user_id: 'u1', clinic_id: 'c2', role: 'admin', created_at: '2026-01-01T00:00:00.000Z' };
    expect(rowToMembership(row)).toEqual({ userId: 'u1', clinicId: 'c2', role: 'admin' });
  });
});

describe('rowToClinic', () => {
  it('maps a clinic row', () => {
    const row: ClinicRow = { id: 'c1', name: 'Test Clinic', type: 'primary', created_at: '2026-01-01T00:00:00.000Z' };
    expect(rowToClinic(row)).toEqual({ id: 'c1', name: 'Test Clinic', type: 'primary' });
  });
});

describe('encounter referral clinic id round-trip', () => {
  it('referredToClinicId survives patientToRow-free encounter round-trip', () => {
    // Verifies the new referral FK flows through the encounter mapper.
    const e = mkEncounter({ referredTo: 'City Hospital', referredToClinicId: 'clinic-b' });
    const back = rowToEncounter(encounterToRow(e));
    expect(back.referredToClinicId).toBe('clinic-b');
    expect(back.referredTo).toBe('City Hospital');
  });
  it('null referredToClinicId round-trips (no referral)', () => {
    const e = mkEncounter({ referredTo: '', referredToClinicId: null });
    expect(rowToEncounter(encounterToRow(e)).referredToClinicId).toBeNull();
  });
});
