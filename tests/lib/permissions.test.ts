/**
 * Unit tests for lib/permissions.ts.
 *
 * These mirror the RLS policies in supabase/schema.sql. If you change the
 * permission rules, update BOTH this file and the SQL policies to match.
 */
import type { AuthUser, ClinicMembership } from '@/lib/permissions';
import {
  canAccessClinic,
  canEditPatient,
  canSeePatient,
  clinicsForUser,
  isAdmin,
  isApproved,
  roleForClinic,
} from '@/lib/permissions';

const CLINIC_A = 'clinic-a';
const CLINIC_B = 'clinic-b';
const CLINIC_C = 'clinic-c';

function user(memberships: ClinicMembership[], approved = true): AuthUser {
  return { profile: { id: 'u1', displayName: 'Test', approved }, memberships };
}
const hw = (clinicId: string): ClinicMembership => ({ userId: 'u1', clinicId, role: 'health_worker' });
const admin = (clinicId: string): ClinicMembership => ({ userId: 'u1', clinicId, role: 'admin' });

/* ── isApproved ────────────────────────────────────────────── */
describe('isApproved', () => {
  it('true for an approved user', () => expect(isApproved(user([]))).toBe(true));
  it('false for an unapproved user', () => expect(isApproved(user([], false))).toBe(false));
  it('false for null', () => expect(isApproved(null)).toBe(false));
});

/* ── clinicsForUser ────────────────────────────────────────── */
describe('clinicsForUser', () => {
  it('returns the clinic ids', () => {
    expect(clinicsForUser(user([hw(CLINIC_A), admin(CLINIC_B)]))).toEqual([CLINIC_A, CLINIC_B]);
  });
  it('dedupes clinics with multiple memberships', () => {
    expect(clinicsForUser(user([hw(CLINIC_A), admin(CLINIC_A)]))).toEqual([CLINIC_A]);
  });
  it('empty for null', () => expect(clinicsForUser(null)).toEqual([]));
});

/* ── roleForClinic ─────────────────────────────────────────── */
describe('roleForClinic', () => {
  it('returns the role at that clinic', () => {
    expect(roleForClinic(user([hw(CLINIC_A), admin(CLINIC_B)]), CLINIC_B)).toBe('admin');
  });
  it('null when not a member of that clinic', () => {
    expect(roleForClinic(user([hw(CLINIC_A)]), CLINIC_B)).toBeNull();
  });
  it('null for null user', () => expect(roleForClinic(null, CLINIC_A)).toBeNull());
});

/* ── isAdmin ───────────────────────────────────────────────── */
describe('isAdmin', () => {
  it('true if admin anywhere', () => expect(isAdmin(user([hw(CLINIC_A), admin(CLINIC_B)]))).toBe(true));
  it('false if only health_worker', () => expect(isAdmin(user([hw(CLINIC_A)]))).toBe(false));
  it('false for null', () => expect(isAdmin(null)).toBe(false));
});

/* ── canAccessClinic ───────────────────────────────────────── */
describe('canAccessClinic', () => {
  it('true at own clinic when approved', () => {
    expect(canAccessClinic(user([hw(CLINIC_A)]), CLINIC_A)).toBe(true);
  });
  it('false at a clinic you do not belong to', () => {
    expect(canAccessClinic(user([hw(CLINIC_A)]), CLINIC_B)).toBe(false);
  });
  it('false when unapproved (even at your own clinic)', () => {
    expect(canAccessClinic(user([hw(CLINIC_A)], false), CLINIC_A)).toBe(false);
  });
});

/* ── canSeePatient (full history) ──────────────────────────── */
describe('canSeePatient (full-history referral model)', () => {
  it('sees a patient at its own clinic', () => {
    expect(canSeePatient(user([hw(CLINIC_A)]), { clinicId: CLINIC_A }, [])).toBe(true);
  });
  it('sees a referred-in patient (referred to my clinic)', () => {
    // Patient lives at Clinic A, but was referred to Clinic B → B can see it.
    expect(canSeePatient(user([hw(CLINIC_B)]), { clinicId: CLINIC_A }, [CLINIC_B])).toBe(true);
  });
  it('does NOT see a patient at an unrelated clinic with no referral', () => {
    expect(canSeePatient(user([hw(CLINIC_A)]), { clinicId: CLINIC_B }, [])).toBe(false);
  });
  it('admin sees a patient at ANY clinic (super-admin read)', () => {
    // Admin at Clinic B, patient at unrelated Clinic C, no referral → still visible.
    expect(canSeePatient(user([admin(CLINIC_B)]), { clinicId: CLINIC_C }, [])).toBe(true);
  });
  it('does NOT see a patient referred only to a third clinic', () => {
    expect(canSeePatient(user([hw(CLINIC_A)]), { clinicId: CLINIC_B }, [CLINIC_C])).toBe(false);
  });
  it('sees the patient if it was referred to one of several of my clinics', () => {
    expect(canSeePatient(user([hw(CLINIC_A), admin(CLINIC_B)]), { clinicId: CLINIC_C }, [CLINIC_B])).toBe(true);
  });
  it('blocked when unapproved', () => {
    expect(canSeePatient(user([hw(CLINIC_A)], false), { clinicId: CLINIC_A }, [])).toBe(false);
  });
  it('null user sees nothing', () => {
    expect(canSeePatient(null, { clinicId: CLINIC_A }, [])).toBe(false);
  });
});

/* ── canEditPatient ────────────────────────────────────────── */
describe('canEditPatient (own clinic only)', () => {
  it('can edit a patient at its own clinic', () => {
    expect(canEditPatient(user([hw(CLINIC_A)]), { clinicId: CLINIC_A })).toBe(true);
  });
  it('cannot edit a referred-in patient (only the originating clinic edits)', () => {
    // Patient at Clinic A, referred to B → B can SEE it but cannot EDIT it.
    expect(canEditPatient(user([hw(CLINIC_B)]), { clinicId: CLINIC_A })).toBe(false);
  });
  it('admin can edit at ANY clinic (super-admin)', () => {
    expect(canEditPatient(user([admin(CLINIC_B)]), { clinicId: CLINIC_A })).toBe(true);
    expect(canEditPatient(user([admin(CLINIC_B)]), { clinicId: CLINIC_C })).toBe(true);
  });
  it('cannot edit a patient at an unrelated clinic', () => {
    expect(canEditPatient(user([hw(CLINIC_A)]), { clinicId: CLINIC_B })).toBe(false);
  });
  it('cannot edit when unapproved', () => {
    expect(canEditPatient(user([hw(CLINIC_A)], false), { clinicId: CLINIC_A })).toBe(false);
  });
  it('null user', () => expect(canEditPatient(null, { clinicId: CLINIC_A })).toBe(false));
});
