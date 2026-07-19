/**
 * Audio upload + murmur screening (v0).
 *
 * Flow: upload auscultation recording to private Storage → invoke the
 * analyze-audio edge function (Gemini audio) → save an `audio` row.
 *
 * Flag only — never affects the Jones score (murmur/carditis is a Major
 * criterion, but the AI read is unvalidated).
 *
 * Requires Supabase to be configured (see lib/supabase.ts).
 */
import { getSupabase } from '@/lib/supabase';
import type { AudioAnalysis, AudioRecord } from '@/lib/types';

interface AudioRow {
  id: string;
  patient_id: string | null;
  encounter_id: string | null;
  clinic_id: string;
  storage_path: string;
  mime_type: string;
  finding: string;
  murmur_detected: boolean;
  confidence: number;
  notes: string;
  model: string;
  clinician_label: string | null;
  inactive: boolean;
  created_at: string;
}

function rowToAudio(r: AudioRow): AudioRecord {
  return {
    id: r.id,
    patientId: r.patient_id,
    encounterId: r.encounter_id,
    clinicId: r.clinic_id,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    finding: r.finding,
    murmurDetected: r.murmur_detected,
    confidence: r.confidence,
    notes: r.notes,
    model: r.model,
    clinicianLabel: r.clinician_label,
    inactive: r.inactive,
    createdAt: r.created_at,
  };
}

function extFromMime(mime: string): string {
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aiff')) return 'aiff';
  return 'wav';
}

/** Upload an audio blob to the private `audio` bucket. Returns the storage path. */
export async function uploadAudio(
  file: Blob,
  encounterId: string,
  mimeType: string,
): Promise<string> {
  const path = `audio/${encounterId}/${crypto.randomUUID()}.${extFromMime(mimeType)}`;
  const { error } = await getSupabase()
    .storage.from('audio')
    .upload(path, file, { contentType: mimeType || 'audio/mpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** Call the analyze-audio edge function (Gemini). */
export async function analyzeAudio(storagePath: string): Promise<AudioAnalysis> {
  const { data, error } = await getSupabase().functions.invoke('analyze-audio', {
    body: { storagePath },
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
  return data as AudioAnalysis;
}

/** Persist a recording + its analysis. Returns the stored row. */
export async function saveAudioRecord(input: {
  patientId: string | null;
  encounterId: string;
  clinicId: string;
  storagePath: string;
  mimeType: string;
  analysis: AudioAnalysis;
}): Promise<AudioRecord> {
  const row = {
    id: 'audio-' + Date.now(),
    patient_id: input.patientId,
    encounter_id: input.encounterId,
    clinic_id: input.clinicId,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    finding: input.analysis.finding,
    murmur_detected: input.analysis.murmurDetected,
    confidence: input.analysis.confidence,
    notes: input.analysis.notes,
    model: input.analysis.model,
  };
  const { data, error } = await getSupabase()
    .from('audio')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToAudio(data as AudioRow);
}

/** Load all recordings for an encounter (most-recent first). */
export async function loadAudioForEncounter(encounterId: string): Promise<AudioRecord[]> {
  const { data, error } = await getSupabase()
    .from('audio')
    .select('*')
    .eq('encounter_id', encounterId)
    .eq('inactive', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as AudioRow[]) ?? []).map(rowToAudio);
}

/** Soft-delete a recording (hide it from the list; recoverable via SQL). */
export async function softDeleteAudio(id: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('audio')
    .update({ inactive: true })
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Could not delete recording (not found or no permission).');
  }
}

/** Get a short-lived signed URL for playing a stored recording. */
export async function getAudioUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from('audio')
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl ?? '';
}
