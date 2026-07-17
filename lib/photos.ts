/**
 * Photo upload + dummy analysis (v0).
 *
 * Flow: upload image to private Storage → invoke the analyze-photo edge
 * function (dummy, random) → save a `photos` row. Real Gemini wiring is a
 * separate step (the edge function is the only place that changes).
 *
 * Requires Supabase to be configured (see lib/supabase.ts).
 */
import { getSupabase } from '@/lib/supabase';
import type { PhotoAnalysis, PhotoRecord } from '@/lib/types';

interface PhotoRow {
  id: string;
  patient_id: string | null;
  encounter_id: string | null;
  clinic_id: string;
  storage_path: string;
  mime_type: string;
  finding: string;
  arf_suspected: boolean;
  confidence: number;
  notes: string;
  model: string;
  clinician_label: string | null;
  inactive: boolean;
  created_at: string;
}

function rowToPhoto(r: PhotoRow): PhotoRecord {
  return {
    id: r.id,
    patientId: r.patient_id,
    encounterId: r.encounter_id,
    clinicId: r.clinic_id,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    finding: r.finding,
    arfSuspected: r.arf_suspected,
    confidence: r.confidence,
    notes: r.notes,
    model: r.model,
    clinicianLabel: r.clinician_label,
    inactive: r.inactive,
    createdAt: r.created_at,
  };
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/** Upload an image blob to the private `photos` bucket. Returns the storage path. */
export async function uploadPhoto(
  file: Blob,
  encounterId: string,
  mimeType: string,
): Promise<string> {
  const path = `photos/${encounterId}/${crypto.randomUUID()}.${extFromMime(mimeType)}`;
  const { error } = await getSupabase()
    .storage.from('photos')
    .upload(path, file, { contentType: mimeType || 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** Call the analyze-photo edge function (Gemini). */
export async function analyzePhoto(storagePath: string): Promise<PhotoAnalysis> {
  const { data, error } = await getSupabase().functions.invoke('analyze-photo', {
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
  return data as PhotoAnalysis;
}

/** Persist a photo + its analysis. Returns the stored row. */
export async function savePhotoRecord(input: {
  patientId: string | null;
  encounterId: string;
  clinicId: string;
  storagePath: string;
  mimeType: string;
  analysis: PhotoAnalysis;
}): Promise<PhotoRecord> {
  const row = {
    id: 'photo-' + Date.now(),
    patient_id: input.patientId,
    encounter_id: input.encounterId,
    clinic_id: input.clinicId,
    storage_path: input.storagePath,
    mime_type: input.mimeType,
    finding: input.analysis.finding,
    arf_suspected: input.analysis.arfSuspected,
    confidence: input.analysis.confidence,
    notes: input.analysis.notes,
    model: input.analysis.model,
  };
  const { data, error } = await getSupabase()
    .from('photos')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToPhoto(data as PhotoRow);
}

/** Load all photos for an encounter (most-recent first). */
export async function loadPhotosForEncounter(encounterId: string): Promise<PhotoRecord[]> {
  const { data, error } = await getSupabase()
    .from('photos')
    .select('*')
    .eq('encounter_id', encounterId)
    .eq('inactive', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as PhotoRow[]) ?? []).map(rowToPhoto);
}

/** Soft-delete a photo (hide it from the list; recoverable via SQL). */
export async function softDeletePhoto(id: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('photos')
    .update({ inactive: true })
    .eq('id', id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Could not delete photo (not found or no permission).');
  }
}

/** Get a short-lived signed URL for displaying a stored photo. */
export async function getPhotoUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from('photos')
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl ?? '';
}
