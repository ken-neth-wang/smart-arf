/**
 * Voice → form fill (v0).
 *
 * Flow: record/upload audio (web) → base64 → invoke the transcribe-assessment
 * edge function (Gemini audio → structured JSON) → review → apply only the
 * criteria the clinician stated.
 *
 * Clinical criteria only (no demographics → less identifiable PHI to Gemini).
 * Audio is transient — never stored.
 */
import { getSupabase } from '@/lib/supabase';
import type { AssessmentInputs, VoiceAssessment } from '@/lib/types';

/** Maps the spoken joint-severity token to the scoring value (0|2|3|5). */
export const JOINT_FROM_VOICE: Record<NonNullable<VoiceAssessment['joint']>, number> = {
  none: 0,
  monoarthralgia: 2,
  polyarthralgia: 3,
  migratory: 5,
};

/** Read a Blob/File as a base64 string (data-url prefix stripped). Web only. */
export function audioBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Could not read audio file.'));
    reader.readAsDataURL(blob);
  });
}

/** Call the transcribe-assessment edge function (Gemini). */
export async function transcribeAssessment(
  audioB64: string,
  mimeType: string,
): Promise<VoiceAssessment> {
  const { data, error } = await getSupabase().functions.invoke('transcribe-assessment', {
    body: { audioB64, mimeType },
  });
  if (error) {
    // The Supabase client surfaces a generic "non-2xx" message; pull the real
    // reason out of the function's JSON response body so the UI can show it.
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === 'function') {
        const txt = await ctx.text();
        try {
          const body = JSON.parse(txt);
          if (body && typeof body.error === 'string') detail = body.error;
        } catch {
          if (txt) detail = txt;
        }
      }
    } catch {
      /* keep generic */
    }
    throw new Error(detail);
  }
  return (data ?? {}) as VoiceAssessment;
}

/** Apply only the criteria the clinician stated (absent = untouched). */
export function applyVoiceAssessment(
  v: VoiceAssessment,
  setInputs: (patch: Partial<AssessmentInputs>) => void,
  setEntry: (field: 'fever' | 'chorea' | 'altCause', value: boolean) => void,
): void {
  if (v.fever !== undefined) setEntry('fever', v.fever);
  if (v.chorea !== undefined) setEntry('chorea', v.chorea);
  if (v.altCause !== undefined) setEntry('altCause', v.altCause);

  const patch: Partial<AssessmentInputs> = {};
  if (v.joint !== undefined) patch.joint = JOINT_FROM_VOICE[v.joint] ?? 0;
  if (v.murmur !== undefined) patch.murmur = v.murmur;
  if (v.sob !== undefined) patch.sob = v.sob;
  if (v.edema !== undefined) patch.edema = v.edema;
  if (v.em !== undefined) patch.em = v.em;
  if (v.sn !== undefined) patch.sn = v.sn;
  if (v.noad !== undefined) patch.noad = v.noad;
  if (v.facilityType !== undefined) patch.facilityType = v.facilityType;
  if (v.wbc !== undefined) patch.wbc = v.wbc;
  if (v.aso !== undefined) patch.aso = v.aso;
  if (v.esr !== undefined) patch.esr = v.esr;
  if (v.antidnase !== undefined) patch.antidnase = v.antidnase;
  if (v.pr !== undefined) patch.pr = v.pr;
  if (v.echo !== undefined) patch.echo = v.echo;
  if (Object.keys(patch).length) setInputs(patch);
}
