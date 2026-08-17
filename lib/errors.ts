/**
 * lib/errors.ts — turn save/UI failures into human-readable, actionable text.
 *
 * Why: supabase-js returns PostgREST errors as PLAIN OBJECTS
 * ({ message, code, details, hint }), not Error instances — so the app-wide
 * `err instanceof Error ? err.message : String(err)` pattern rendered
 * "[object Object]" in every failure alert. This module narrows properly
 * (no casts to any) and maps the known Postgres/RLS/network failures to
 * guidance the user can act on.
 */

/** Human phrasing for the failures this app can actually produce. */
export function describeSaveError(err: unknown): string {
  if (err instanceof Error) {
    if (/Failed to fetch|Network request failed|NetworkError|Load failed/i.test(err.message)) {
      return 'Network problem — the request never reached the server. Check the connection, then try again.';
    }
    return err.message;
  }
  if (typeof err === 'string' && err.trim()) return err;

  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    const message = typeof e.message === 'string' ? e.message : '';
    const code = typeof e.code === 'string' ? e.code : '';
    const text = `${message} ${JSON.stringify(e.details ?? '')} ${JSON.stringify(e.hint ?? '')}`;

    if (code === '23505' || /duplicate key|unique constraint/i.test(text)) {
      if (/patients_mrn_clinic_unique/i.test(text)) {
        return 'That MRN already belongs to a patient at this clinic (duplicate key). Refresh your patient list and try again — if that patient was removed, restore it from Records or use a different MRN.';
      }
      if (/patients_referral_code_key|referral_code/i.test(text)) {
        return 'Rare referral-code collision — press Save again and a fresh code will be generated.';
      }
      return 'Duplicate record (unique constraint) — refresh the list and try again.';
    }
    if (code === '42501' || /row-level security|permission denied/i.test(text)) {
      return 'Permission denied — your account or clinic assignment may have changed. Sign out and sign back in, then try again.';
    }
    if (code === '23503' || /violates foreign key/i.test(text)) {
      return 'A related record is missing (foreign key) — refresh the list and try again.';
    }
    if (code === '22007' || code === '22008' || /invalid input syntax for (type )?date/i.test(text)) {
      return 'The server rejected a date field — check the date of birth format (full date or 4-digit year).';
    }
    if (message) return code ? `${message} (code ${code})` : message;
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') return json;
    } catch {
      // non-serializable — fall through
    }
  }
  return String(err);
}
