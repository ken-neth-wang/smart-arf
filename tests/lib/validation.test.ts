import { validatePatientFields, type ExistingPatientRef } from '@/lib/validation';

const CLINIC_A = '11111111-1111-1111-1111-111111111111';
const CLINIC_B = '22222222-2222-2222-2222-222222222222';

const valid = {
  firstName: 'Amina',
  lastName: 'Hassan',
  mrn: '00123456',
  phone1: '+249 91 234 5678',
  dateOfBirth: '2015-06-15',
  dobApproximate: false,
};

const patient = (over: Partial<ExistingPatientRef>): ExistingPatientRef => ({
  mrn: '',
  clinicId: CLINIC_A,
  inactive: false,
  ...over,
});

describe('validatePatientFields — required fields', () => {
  it('accepts a complete entry and returns the DOB unchanged', () => {
    expect(validatePatientFields(valid, [], CLINIC_A)).toEqual({
      ok: true,
      dateOfBirth: '2015-06-15',
      dobApproximate: false,
    });
  });

  it('blocks missing name / phone with a message', () => {
    const noName = validatePatientFields({ ...valid, firstName: ' ', lastName: '' }, [], CLINIC_A);
    expect(noName).toEqual({ ok: false, error: 'First and last name are required.' });

    const noPhone = validatePatientFields({ ...valid, phone1: '  ' }, [], CLINIC_A);
    expect(noPhone).toEqual({ ok: false, error: 'Primary phone is required.' });
  });

  it('blocks a user with no clinic membership (RLS would deny every insert)', () => {
    const v = validatePatientFields(valid, [], null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/not assigned to a clinic/);
  });
});

describe('validatePatientFields — DOB (Postgres 22007 class)', () => {
  it('normalizes a bare birth year to an approximate Jan-1 DOB', () => {
    expect(validatePatientFields({ ...valid, dateOfBirth: '1998' }, [], CLINIC_A)).toEqual({
      ok: true,
      dateOfBirth: '1998-01-01',
      dobApproximate: true,
    });
  });

  it('empty DOB passes as unknown', () => {
    expect(validatePatientFields({ ...valid, dateOfBirth: '' }, [], CLINIC_A)).toEqual({
      ok: true,
      dateOfBirth: null,
      dobApproximate: false,
    });
  });

  it('blocks malformed dates the server would reject', () => {
    for (const bad of ['1998-13-01', '15/06/1998', '2015-06', '98', 'not a date']) {
      const v = validatePatientFields({ ...valid, dateOfBirth: bad }, [], CLINIC_A);
      expect(v.ok).toBe(false);
    }
  });
});

describe('validatePatientFields — MRN unique index (Postgres 23505 class)', () => {
  it('blocks an MRN held by a REMOVED patient in the same clinic (soft-deleted rows keep their MRN)', () => {
    const existing = [patient({ mrn: '00123456', inactive: true })];
    const v = validatePatientFields(valid, existing, CLINIC_A);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/removed patient/);
  });

  it('allows an MRN held by an ACTIVE patient — the save path merges into it by design', () => {
    const existing = [patient({ mrn: '00123456', inactive: false })];
    expect(validatePatientFields(valid, existing, CLINIC_A).ok).toBe(true);
  });

  it('allows an MRN held in a DIFFERENT clinic (index is per-clinic)', () => {
    const existing = [patient({ mrn: '00123456', inactive: true, clinicId: CLINIC_B })];
    expect(validatePatientFields(valid, existing, CLINIC_A).ok).toBe(true);
  });

  it('trims before comparing, and an empty MRN never conflicts', () => {
    const existing = [patient({ mrn: ' 00123456 ', inactive: true })];
    expect(validatePatientFields(valid, existing, CLINIC_A).ok).toBe(false);
    expect(validatePatientFields({ ...valid, mrn: '   ' }, existing, CLINIC_A).ok).toBe(true);
  });
});
