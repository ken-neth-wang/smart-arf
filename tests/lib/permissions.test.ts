/**
 * Unit tests for lib/permissions.ts — clinic-scoped admin model.
 * Mirrors the RLS behavior verified in tests/integration/rls.test.ts:
 *   - admin is per-clinic (an admin of A has no powers at B)
 *   - platform admin is the rare global tier
 *   - visibility = own clinics ∪ referred-into; edit = own clinic ∪ referred-into-admin
 */
import type { AuthUser, ClinicMembership } from '@/lib/permissions';
import {
  adminClinicsForUser,
  canAccessClinic,
  canEditPatient,
  canSeePatient,
  clinicsForUser,
  isAdminAnywhere,
  isAdminAt,
  isApproved,
  isPlatformAdmin,
  roleForClinic,
} from '@/lib/permissions';

const CLINIC_A = 'clinic-a';
const CLINIC_B = 'clinic-b';
const CLINIC_C = 'clinic-c';

function user(
  memberships: ClinicMembership[],
  approved = true,
  platformAdmin = false,
): AuthUser {
  return { profile: { id: 'u1', displayName: 'Test', approved, platformAdmin }, memberships };
}
const hw = (clinicId: string): ClinicMembership => ({ userId: 'u1', clinicId, role: 'health_worker' });
const admin = (clinicId: string): ClinicMembership => ({ userId: 'u1', clinicId, role: 'admin' });

/* ── isApproved ────────────────────────────────────────────── */
describe('isApproved', () => {
  it('true for an approved user', () => expect(isApproved(user([]))).toBe(true));
  it('false for an unapproved user', () => expect(isApproved(user([], false))).toBe(false));
  it('false for null', () => expect(isApproved(null)).toBe(false));
});

/* ── isPlatformAdmin ───────────────────────────────────────── */
describe('isPlatformAdmin', () => {
  it('true only when the flag is set AND approved', () => {
    expect(isPlatformAdmin(user([], true, true))).toBe(true);
    expect(isPlatformAdmin(user([], true, false))).toBe(false);
    expect(isPlatformAdmin(user([], false, true))).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });
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

/* ── adminClinicsForUser ───────────────────────────────────── */
describe('adminClinicsForUser', () => {
  it('returns only clinics where role is admin', () => {
    expect(adminClinicsForUser(user([hw(CLINIC_A), admin(CLINIC_B)]))).toEqual([CLINIC_B]);
  });
  it('empty when only health_worker', () => {
    expect(adminClinicsForUser(user([hw(CLINIC_A)]))).toEqual([]);
  });
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

/* ── isAdminAt (per-clinic) ────────────────────────────────── */
describe('isAdminAt', () => {
  it('true at clinics where the user holds the admin role', () => {
    const u = user([hw(CLINIC_A), admin(CLINIC_B)]);
    expect(isAdminAt(u, CLINIC_B)).toBe(true);
    expect(isAdminAt(u, CLINIC_A)).toBe(false);
    expect(isAdminAt(u, CLINIC_C)).toBe(false);
  });
  it('platform admins are admin everywhere', () => {
    const u = user([hw(CLINIC_A)], true, true);
    expect(isAdminAt(u, CLINIC_A)).toBe(true);
    expect(isAdminAt(u, CLINIC_C)).toBe(true);
  });
  it('false for null', () => expect(isAdminAt(null, CLINIC_A)).toBe(false));
});

/* ── isAdminAnywhere (Admin console gate) ──────────────────── */
describe('isAdminAnywhere', () => {
  it('true if admin anywhere', () => expect(isAdminAnywhere(user([hw(CLINIC_A), admin(CLINIC_B)]))).toBe(true));
  it('false if only health_worker', () => expect(isAdminAnywhere(user([hw(CLINIC_A)]))).toBe(false));
  it('true for platform admin with no memberships', () => expect(isAdminAnywhere(user([], true, true))).toBe(true));
});

/* ── canAccessClinic ───────────────────────────────────────── */
describe('canAccessClinic', () => {
  it('member + approved', () => {
    expect(canAccessClinic(user([hw(CLINIC_A)]), CLINIC_A)).toBe(true);
  });
  it('not a member', () => {
    expect(canAccessClinic(user([hw(CLINIC_A)]), CLINIC_B)).toBe(false);
  });
  it('unapproved members are denied', () => {
    expect(canAccessClinic(user([hw(CLINIC_A)], false), CLINIC_A)).toBe(false);
  });
});

/* ── canSeePatient (visibility = own ∪ referred-into) ──────── */
describe('canSeePatient (clinic-scoped visibility)', () => {
  it('sees patients at own clinics', () => {
    expect(canSeePatient(user([hw(CLINIC_A)]), { clinicId: CLINIC_A }, [])).toBe(true);
  });
  it('sees patients referred into own clinics', () => {
    expect(canSeePatient(user([hw(CLINIC_B)]), { clinicId: CLINIC_A }, [CLINIC_B])).toBe(true);
  });
  it('clinic admin is NOT global: admin of B does not see clinic A patients', () => {
    expect(canSeePatient(user([admin(CLINIC_B)]), { clinicId: CLINIC_A }, [])).toBe(false);
  });
  it('admin sees own clinic + referred-in like any member', () => {
    const u = user([admin(CLINIC_B)]);
    expect(canSeePatient(u, { clinicId: CLINIC_B }, [])).toBe(true);
    expect(canSeePatient(u, { clinicId: CLINIC_A }, [CLINIC_B])).toBe(true);
  });
  it('platform admin sees everything', () => {
    expect(canSeePatient(user([], true, true), { clinicId: CLINIC_C }, [])).toBe(true);
  });
  it('unapproved sees nothing', () => {
    expect(canSeePatient(user([hw(CLINIC_A)], false), { clinicId: CLINIC_A }, [])).toBe(false);
  });
});

/* ── canEditPatient (own clinic ∪ referred-into-admin) ─────── */
describe('canEditPatient', () => {
  it('member edits at own clinic (incl. referred-out — full history)', () => {
    const u = user([hw(CLINIC_A)]);
    expect(canEditPatient(u, { clinicId: CLINIC_A }, [CLINIC_B])).toBe(true);
  });
  it('referred-in is read-only for plain members of the receiving clinic', () => {
    expect(canEditPatient(user([hw(CLINIC_B)]), { clinicId: CLINIC_A }, [CLINIC_B])).toBe(false);
  });
  it('referred-in is editable by the ADMIN of the receiving clinic', () => {
    expect(canEditPatient(user([admin(CLINIC_B)]), { clinicId: CLINIC_A }, [CLINIC_B])).toBe(true);
  });
  it('admin of an unrelated clinic cannot edit', () => {
    expect(canEditPatient(user([admin(CLINIC_C)]), { clinicId: CLINIC_A }, [CLINIC_B])).toBe(false);
  });
  it('platform admin edits everything', () => {
    expect(canEditPatient(user([], true, true), { clinicId: CLINIC_C }, [])).toBe(true);
  });
  it('unapproved edits nothing', () => {
    expect(canEditPatient(user([hw(CLINIC_A)], false), { clinicId: CLINIC_A })).toBe(false);
  });
});
