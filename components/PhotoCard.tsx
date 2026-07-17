/**
 * PhotoCard — Step 5 card: upload a skin photo, run the (dummy) analysis,
 * store it. v0: dummy edge function. Flag only — NEVER affects the Jones score.
 *
 * Web-only file input (the app has no native build yet). Anchors each photo to
 * the current assessment's encounter (committing the draft first if needed).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Alert,
  Card,
  CardSubtitle,
  CardTitle,
  CheckboxRow,
  PrimaryButton,
  StepBadge,
} from '@/components/ui/primitives';
import { useAssessment } from '@/state/AssessmentContext';
import { useAuth } from '@/state/AuthContext';
import {
  analyzePhoto,
  getPhotoUrl,
  loadPhotosForEncounter,
  savePhotoRecord,
  softDeletePhoto,
  uploadPhoto,
} from '@/lib/photos';
import type { PhotoRecord } from '@/lib/types';
import { Colors } from '@/constants/theme';

const DISCLAIMER = 'AI screening only — cannot diagnose or rule out ARF. Clinical assessment is required.';

export function PhotoCard() {
  const { activeEncounterId, activePatientId, commitLevelA } = useAssessment();
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileRef = useRef<any>(null);

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const clinicId = user?.memberships[0]?.clinicId ?? null;

  const refresh = useCallback(async (encounterId: string) => {
    try {
      const list = await loadPhotosForEncounter(encounterId);
      setPhotos(list);
      const mapped: Record<string, string> = {};
      await Promise.all(
        list.map(async (p) => {
          try {
            mapped[p.id] = await getPhotoUrl(p.storagePath);
          } catch {
            /* ignore single-url failure */
          }
        }),
      );
      setUrls(mapped);
    } catch {
      /* ignore load errors (e.g. nothing stored yet) */
    }
  }, []);

  useEffect(() => {
    if (activeEncounterId) void refresh(activeEncounterId);
    else setPhotos([]);
  }, [activeEncounterId, refresh]);

  const onUpload = useCallback(() => {
    if (busy) return;
    setError(null);
    if (!consent) return setError('Confirm patient consent before uploading.');
    if (!clinicId) return setError('No clinic assigned to your account.');
    if (Platform.OS !== 'web') return setError('Photo upload is web-only for now.');
    fileRef.current?.click();
  }, [busy, consent, clinicId]);

  const onFile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (e: any) => {
      const file: File | undefined = e?.target?.files?.[0];
      if (e?.target) e.target.value = ''; // allow re-picking the same file
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        // Ensure a patient + encounter exist (commit the draft if needed).
        let encounterId = activeEncounterId;
        let patientId: string | null = activePatientId;
        if (!encounterId) {
          const ids = await commitLevelA();
          encounterId = ids.encounterId;
          patientId = ids.patientId;
        }
        // Upload → analyze → save.
        const mime = file.type || 'image/jpeg';
        const path = await uploadPhoto(file, encounterId!, mime);
        const analysis = await analyzePhoto(path);
        await savePhotoRecord({
          patientId,
          encounterId: encounterId!,
          clinicId: clinicId!,
          storagePath: path,
          mimeType: mime,
          analysis,
        });
        await refresh(encounterId!);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [activeEncounterId, activePatientId, clinicId, commitLevelA, refresh],
  );

  const onDelete = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await softDeletePhoto(id);
        if (activeEncounterId) await refresh(activeEncounterId);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeEncounterId, refresh],
  );

  return (
    <Card>
      <StepBadge>Optional · AI Skin Photo (trial)</StepBadge>
      <CardTitle>Skin Photo</CardTitle>
      <CardSubtitle>Upload a photo for AI screening. {DISCLAIMER}</CardSubtitle>

      {/* hidden web file input */}
      {Platform.OS === 'web' ? (
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      ) : null}

      <View style={styles.consent}>
        <CheckboxRow
          label="I have patient consent to upload this photo"
          checked={consent}
          onToggle={() => setConsent((c) => !c)}
        />
      </View>

      {error ? (
        <View style={{ marginTop: 8 }}>
          <Alert variant="warning">{error}</Alert>
        </View>
      ) : null}

      <View style={{ marginTop: 8 }}>
        <PrimaryButton
          title={busy ? 'Uploading…' : 'Upload Photo'}
          disabled={!consent || busy || Platform.OS !== 'web'}
          onPress={onUpload}
        />
      </View>

      {photos.length > 0 ? (
        <View style={styles.list}>
          {photos.map((p) => (
            <View key={p.id} style={[styles.item, p.arfSuspected && styles.itemFlagged]}>
              {urls[p.id] ? (
                <Image source={{ uri: urls[p.id] }} style={styles.thumb} resizeMode="cover" />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.finding}>{p.finding}</Text>
                <Text style={[styles.meta, p.arfSuspected && styles.metaFlagged]}>
                  {p.arfSuspected ? '⚠ ARF pattern flagged' : 'No ARF pattern'} · {Math.round(p.confidence * 100)}% conf
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onDelete(p.id)}
                style={styles.deleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.deleteX}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 10 }}>
        <Alert variant="warning">{DISCLAIMER}</Alert>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  consent: { marginTop: 4, marginBottom: 4 },
  list: { marginTop: 12, gap: 10 },
  item: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemFlagged: { backgroundColor: Colors.dangerBg, borderColor: Colors.danger },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: Colors.grayLight },
  finding: { fontSize: 13.5, fontWeight: '600', color: Colors.text },
  meta: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  metaFlagged: { color: Colors.danger, fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteX: { color: Colors.danger, fontSize: 16, fontWeight: '700' },
});
