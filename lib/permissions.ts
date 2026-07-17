/**
 * lib/permissions.ts — pure role/permission helpers.
 *
 * Mirrors the RLS logic in supabase/schema.sql so the client can pre-filter /
 * gate UI without a round-trip. The DATABASE RLS is the source of truth; these
 * are a convenience layer (and fully unit-tested in tests/lib/permissions.test.ts).
 *
 * Model recap (see docs/roles.md):
 *   - An AuthUser is approved (passed the admin gate) + has >=0 clinic memberships.
 *   - A patient is VISIBLE if it's at one of your clinics OR was referred in to one.
 *   - A patient is EDITABLE only at your own clinic (not a referred-in one).
 *   - Soft-delete only — no hard-delete path.
 */

export type Role = 'health_worker' | 'admin';

export interface UserProfile {
  id: string;
  displayName: string;
  approved: boolean;
}

export interface ClinicMembership {
  userId: string;
  clinicId: string;
  role: Role;
}

/** The authenticated user's resolved identity (profile + clinic memberships). */
export interface AuthUser {
  profile: UserProfile;
  memberships: ClinicMembership[];
}

/** Null-safe: has the user passed the admin approval gate? */
export function isApproved(user: AuthUser | null): boolean {
  return !!user?.profile.approved;
}

/** The set of clinic ids the user belongs to (deduped). */
export function clinicsForUser(user: AuthUser | null): string[] {
  if (!user) return [];
  return [...new Set(user.memberships.map((m) => m.clinicId))];
}

/** The user's role at a specific clinic, or null if not a member there. */
export function roleForClinic(user: AuthUser | null, clinicId: string): Role | null {
  if (!user) return null;
  return user.memberships.find((m) => m.clinicId === clinicId)?.role ?? null;
}

/** Is the user an admin at *any* clinic? */
export function isAdmin(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.memberships.some((m) => m.role === 'admin');
}

/** Can the user act on (create/edit) records at this clinic? */
export function canAccessClinic(user: AuthUser | null, clinicId: string): boolean {
  return isApproved(user) && clinicsForUser(user).includes(clinicId);
}

/**
 * Can the user SEE this patient? (full-history model)
 *
 * Visible if the patient is at one of the user's clinics, OR was referred to
 * one of them.
 *
 * @param referralTargetClinics the clinics this patient's encounters were
 *   referred TO — the caller derives this from loaded encounters.
 */
export function canSeePatient(
  user: AuthUser | null,
  patient: { clinicId: string | null | undefined },
  referralTargetClinics: string[],
): boolean {
  if (!isApproved(user)) return false;
  if (isAdmin(user)) return true; // admins can see all clinics
  const mine = clinicsForUser(user);
  if (patient.clinicId && mine.includes(patient.clinicId)) return true;
  return referralTargetClinics.some((c) => mine.includes(c));
}

/**
 * Can the user edit (incl. soft-delete) this patient?
 * Only at their OWN clinic — never a referred-in patient.
 */
export function canEditPatient(
  user: AuthUser | null,
  patient: { clinicId: string | null | undefined },
): boolean {
  if (!isApproved(user)) return false;
  if (isAdmin(user)) return true; // admins can edit/soft-delete/restore at any clinic
  const mine = clinicsForUser(user);
  return !!patient.clinicId && mine.includes(patient.clinicId);
}
