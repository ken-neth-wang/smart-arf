/**
 * lib/permissions.ts — pure role/permission helpers.
 *
 * Mirrors the RLS logic in supabase/schema.sql so the client can pre-filter /
 * gate UI without a round-trip. The DATABASE RLS is the source of truth; these
 * are a convenience layer (and fully unit-tested in tests/lib/permissions.test.ts).
 *
 * Model (see docs/user-clinic-management-plan.md):
 *   - An AuthUser is approved (passed the admin gate) + has >=0 clinic memberships
 *     + may be a platformAdmin (rare cross-clinic tier: create clinics,
 *     deactivate accounts).
 *   - ADMIN is per-clinic: `isAdminAt(user, clinicId)`. An admin of clinic A has
 *     no special powers at clinic B. Platform admins count as admin everywhere.
 *   - A patient is VISIBLE if it's at one of your clinics OR was referred into
 *     one of them (admins follow the same shape — no global sight).
 *   - A patient is EDITABLE at your own clinic; admins of a clinic it was
 *     referred INTO can also edit it (receiving-clinic handover).
 *   - Soft-delete only — no hard-delete path.
 */

export type Role = 'health_worker' | 'admin';

export interface UserProfile {
  id: string;
  displayName: string;
  approved: boolean;
  /** Rare cross-clinic tier (profiles.platform_admin): create clinics, deactivate accounts. */
  platformAdmin: boolean;
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

/** Is the user a platform admin? (create clinics, deactivate accounts, see all) */
export function isPlatformAdmin(user: AuthUser | null): boolean {
  return isApproved(user) && !!user?.profile.platformAdmin;
}

/** The set of clinic ids the user belongs to (deduped). */
export function clinicsForUser(user: AuthUser | null): string[] {
  if (!user) return [];
  return [...new Set(user.memberships.map((m) => m.clinicId))];
}

/** The clinics where the user holds the admin role (deduped). */
export function adminClinicsForUser(user: AuthUser | null): string[] {
  if (!user) return [];
  return [...new Set(user.memberships.filter((m) => m.role === 'admin').map((m) => m.clinicId))];
}

/** The user's role at a specific clinic, or null if not a member there. */
export function roleForClinic(user: AuthUser | null, clinicId: string): Role | null {
  if (!user) return null;
  return user.memberships.find((m) => m.clinicId === clinicId)?.role ?? null;
}

/** Is the user an admin AT THIS clinic? (Platform admins: yes, everywhere.) */
export function isAdminAt(user: AuthUser | null, clinicId: string): boolean {
  if (isPlatformAdmin(user)) return true;
  return roleForClinic(user, clinicId) === 'admin';
}

/** Is the user an admin at ANY clinic (or platform)? Gates the Admin console. */
export function isAdminAnywhere(user: AuthUser | null): boolean {
  return isPlatformAdmin(user) || !!user?.memberships.some((m) => m.role === 'admin');
}

/** Can the user act on (create/edit) records at this clinic? */
export function canAccessClinic(user: AuthUser | null, clinicId: string): boolean {
  return isApproved(user) && clinicsForUser(user).includes(clinicId);
}

/**
 * Can the user SEE this patient? (full-history model)
 *
 * Visible if the patient is at one of the user's clinics, OR was referred to
 * one of them. Clinic admins follow the same shape (per-clinic admin ≠ global
 * sight); only platform admins see everything.
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
  if (isPlatformAdmin(user)) return true;
  const mine = clinicsForUser(user);
  if (patient.clinicId && mine.includes(patient.clinicId)) return true;
  return referralTargetClinics.some((c) => mine.includes(c));
}

/**
 * Can the user edit (incl. soft-delete/restore) this patient?
 *
 * - anyone: at their OWN clinic (full history, incl. referred-out patients)
 * - receiving-clinic ADMIN: also patients referred INTO a clinic they admin
 * - platform admin: everything
 * - plain members at the receiving clinic: read-only (referral handover)
 */
export function canEditPatient(
  user: AuthUser | null,
  patient: { clinicId: string | null | undefined },
  referralTargetClinics: string[] = [],
): boolean {
  if (!isApproved(user)) return false;
  if (isPlatformAdmin(user)) return true;
  const mine = clinicsForUser(user);
  if (patient.clinicId && mine.includes(patient.clinicId)) return true;
  const adminClinics = adminClinicsForUser(user);
  return referralTargetClinics.some((c) => adminClinics.includes(c));
}
