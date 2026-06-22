import { emptyInputs, type AssessmentInputs } from '@/lib/types';

/**
 * Build an AssessmentInputs fixture from the documented defaults, overriding
 * only the fields passed in `patch`. Mirrors the global `S` object in
 * smart-arf-app.html after a fresh reset.
 */
export function buildInputs(patch: Partial<AssessmentInputs> = {}): AssessmentInputs {
  return { ...emptyInputs(), ...patch };
}
