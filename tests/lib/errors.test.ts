import { describeSaveError } from '@/lib/errors';

describe('describeSaveError', () => {
  it('renders supabase PostgREST plain-object errors (the "[object Object]" bug)', () => {
    const err = { message: 'duplicate key value violates unique constraint "patients_mrn_clinic_unique"', code: '23505', details: 'Key (clinic_id, mrn)=(c1, 00123456) already exists.', hint: null };
    const out = describeSaveError(err);
    expect(out).toMatch(/MRN already belongs/i);
    expect(out).not.toMatch(/object Object/);
  });

  it('maps the MRN unique race to restore/retry guidance', () => {
    const err = { message: 'duplicate key value violates unique constraint "patients_mrn_clinic_unique"', code: '23505' };
    expect(describeSaveError(err)).toMatch(/Refresh your patient list/);
  });

  it('maps referral-code collisions to the regenerate hint', () => {
    const err = { message: 'duplicate key value violates unique constraint "patients_referral_code_key"', code: '23505' };
    expect(describeSaveError(err)).toMatch(/press Save again/i);
  });

  it('maps RLS denials to the session guidance', () => {
    expect(describeSaveError({ message: 'new row violates row-level security policy for table "patients"', code: '42501' })).toMatch(/Sign out and sign back in/);
  });

  it('maps the malformed-date rejection', () => {
    expect(describeSaveError({ message: 'invalid input syntax for type date: "1998"', code: '22007' })).toMatch(/date of birth/i);
  });

  it('keeps the technical message for unmapped PostgREST errors', () => {
    expect(describeSaveError({ message: 'relation "foo" does not exist', code: '42P01' })).toBe('relation "foo" does not exist (code 42P01)');
  });

  it('passes through Error instances, and maps network failures to guidance', () => {
    expect(describeSaveError(new Error('boom'))).toBe('boom');
    expect(describeSaveError(new TypeError('Failed to fetch'))).toMatch(/Network problem/);
  });

  it('handles strings, null-ish payloads, and message-less objects without exploding', () => {
    expect(describeSaveError('plain string')).toBe('plain string');
    expect(describeSaveError({ nope: 1 })).toMatch(/nope/);
    expect(describeSaveError(42)).toBe('42');
  });
});
