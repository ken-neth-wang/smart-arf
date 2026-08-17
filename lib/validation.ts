/**
 * lib/validation.ts — Step-1 patient validation as a PURE function.
 *
 * Principle: any input the SERVER would reject must be caught HERE, at entry
 * — never at save. The DOB bug (a bare birth year sent as date_of_birth,
 * Postgres 22007, save silently dropped by the pre-2026-08-15 client) is the
 * archetype; this module centralizes every rule of that class so it is unit-
 * tested rather than embedded in component code.
 *
 * Server constraints mirrored (supabase/schema.sql):
 *   - patients.date_of_birth is a `date`       → malformed strings = 22007
 *   - patients_mrn_clinic_unique (clinic_id, mrn) where mrn <> ''
 *     covers SOFT-DELETED rows too             → re-used MRN of a removed
 *                                                 patient = 23505 on insert
 *   - patients_insert RLS requires clinic_id ∈ my_clinics()
 *                                                → no membership = guaranteed
 *                                                 denial (42501)
 *
 * NOT blocked here (by design):
 *   - an ACTIVE same-clinic MRN duplicate — the save path merges the wizard
 *     entry into the existing patient (RecordsContext MRN dedup).
 *   - referral_code collisions — ~1 in 31^8 per save; retry regenerates.
 */
import { normalizeDobEntry } from './types';

/** Structural slice of the wizard's patient fields (AssessmentContext.PatientFields). */
export interface PatientFieldsInput {
  firstName: string;
  lastName: string;
  mrn: string;
  phone1: string;
  dateOfBirth: string | null;
  dobApproximate: boolean;
}

/** Minimal shape of a loaded patient needed for conflict checks. */
export interface ExistingPatientRef {
  mrn: string;
  clinicId?: string | null;
  inactive: boolean;
}

export type PatientValidation =
  | { ok: true; dateOfBirth: string | null; dobApproximate: boolean }
  | { ok: false; error: string };

export function validatePatientFields(
  fields: PatientFieldsInput,
  existingPatients: ExistingPatientRef[],
  userClinicId: string | null,
): PatientValidation {
  if (!userClinicId) {
    return {
      ok: false,
      error: 'Your account is not assigned to a clinic yet — records cannot be saved. Ask your admin to assign you to a clinic.',
    };
  }
  if (!fields.firstName.trim() || !fields.lastName.trim()) {
    return { ok: false, error: 'First and last name are required.' };
  }
  if (!fields.phone1.trim()) {
    return { ok: false, error: 'Primary phone is required.' };
  }
  const dob = normalizeDobEntry(fields.dateOfBirth ?? '');
  if (!dob) {
    return { ok: false, error: 'Date of birth must be YYYY-MM-DD, a 4-digit birth year, or left blank.' };
  }
  const mrn = fields.mrn.trim();
  if (mrn) {
    // Only INACTIVE holders block: the insert would violate the per-clinic
    // unique index (soft-deleted rows keep their MRN). Active holders are
    // merged into by the save path instead.
    const clash = existingPatients.find(
      (p) =>
        p.inactive &&
        p.mrn.trim() === mrn &&
        (p.clinicId ?? null) === (userClinicId ?? null),
    );
    if (clash) {
      return {
        ok: false,
        error: `MRN ${mrn} already belongs to a removed patient at this clinic. Restore that patient from Records, or use a different MRN.`,
      };
    }
  }
  return { ok: true, dateOfBirth: dob.dateOfBirth, dobApproximate: dob.dobApproximate };
}
