/**
 * Encounter CSV export — orchestration + platform delivery.
 *
 * Gathers records (passed in from RecordsContext), loads the caller's photos /
 * auscultation recordings from Supabase when configured, signs batched Storage
 * URLs, builds the CSV (lib/export.ts), and hands the file to the OS:
 *   web    → Blob download
 *   native → expo-file-system cache file + expo-sharing share sheet
 *
 * Access control note: deliberately un-gated for now — anyone signed in can
 * export what RLS already lets them read. Roles/permissions come later.
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { loadAllPhotos } from '@/lib/photos';
import { loadAllAudio } from '@/lib/audio';
import { buildEncounterExportRows, toCsv, type MediaUrls } from '@/lib/export';
import type { Clinic, Encounter, Patient, AudioRecord, PhotoRecord } from '@/lib/types';

/** Signed Storage links are valid for 7 days (Supabase signed-URL maximum),
 *  after which the spreadsheet's media columns stop resolving. */
export const EXPORT_LINK_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

/** createSignedUrls is batched; chunk to keep request bodies bounded. */
const SIGN_BATCH = 100;

export interface ExportEncountersInput {
  patients: Patient[];
  encounters: Encounter[];
  clinics: Clinic[];
}

export interface ExportResult {
  fileName: string;
  rowCount: number;
  mediaLinkCount: number;
}

/** Batch-sign Storage paths → { storagePath: signedUrl }; a per-object failure
 *  drops just that link (warned), a request failure throws. */
async function signPaths(bucket: string, paths: string[], expiresInSeconds: number): Promise<MediaUrls> {
  const pathUrls: MediaUrls = {};
  for (let i = 0; i < paths.length; i += SIGN_BATCH) {
    const { data, error } = await getSupabase()
      .storage.from(bucket)
      .createSignedUrls(paths.slice(i, i + SIGN_BATCH), expiresInSeconds);
    if (error) throw error;
    for (const entry of data ?? []) {
      if (entry.error) {
        console.warn(`[export] signed URL failed for ${bucket}/${entry.path}: ${entry.error}`);
        continue;
      }
      if (entry.path && entry.signedUrl) pathUrls[entry.path] = entry.signedUrl;
    }
  }
  return pathUrls;
}

/** Re-key { storagePath: url } → { mediaRecordId: url } (the export rows look
 *  media up by record id). */
function rekeyById(records: { id: string; storagePath: string }[], pathUrls: MediaUrls): MediaUrls {
  const urls: MediaUrls = {};
  for (const r of records) {
    const url = pathUrls[r.storagePath];
    if (url) urls[r.id] = url;
  }
  return urls;
}

/**
 * Build + deliver the encounters spreadsheet. Returns export stats so the
 * caller can confirm what was included; throws on load/sign failure (caller
 * alerts the user).
 */
export async function exportEncountersToCsv(input: ExportEncountersInput): Promise<ExportResult> {
  const { patients, encounters, clinics } = input;

  let photos: PhotoRecord[] = [];
  let audio: AudioRecord[] = [];
  let photoUrls: MediaUrls = {};
  let audioUrls: MediaUrls = {};

  if (isSupabaseConfigured) {
    // Load the caller's full media (RLS-scoped), then keep only rows attached
    // to the encounters being exported.
    const encounterIds = new Set(encounters.filter((e) => !e.inactive).map((e) => e.id));
    const [allPhotos, allAudio] = await Promise.all([loadAllPhotos(), loadAllAudio()]);
    photos = allPhotos.filter((p) => p.encounterId && encounterIds.has(p.encounterId));
    audio = allAudio.filter((a) => a.encounterId && encounterIds.has(a.encounterId));
    [photoUrls, audioUrls] = await Promise.all([
      rekeyById(photos, await signPaths('photos', photos.map((p) => p.storagePath), EXPORT_LINK_EXPIRY_SECONDS)),
      rekeyById(audio, await signPaths('audio', audio.map((a) => a.storagePath), EXPORT_LINK_EXPIRY_SECONDS)),
    ]);
  }

  const rows = buildEncounterExportRows({ patients, encounters, clinics, photos, audio, photoUrls, audioUrls });
  const csv = toCsv(rows);
  const fileName = `smart-arf-encounters-${new Date().toISOString().slice(0, 10)}.csv`;
  const mediaLinkCount = Object.keys(photoUrls).length + Object.keys(audioUrls).length;

  if (Platform.OS === 'web') {
    downloadOnWeb(csv, fileName);
  } else {
    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    file.write(csv);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Export encounters',
      });
    }
  }

  return { fileName, rowCount: rows.length - 1, mediaLinkCount };
}

function downloadOnWeb(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
