/**
 * PhotoCard — Step 5 card: capture or upload a skin photo, run the (dummy)
 * analysis, store it. v0: dummy edge function. Flag only — NEVER affects the
 * Jones score. Anchors each photo to the current assessment's encounter
 * (committing the draft first if needed).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Card,
  CardSubtitle,
  CardTitle,
  CheckboxRow,
  PrimaryButton,
  SecondaryButton,
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
import { AI_RETRY_MESSAGE, isAiServiceError } from '@/lib/aiErrors';
import { AiProgress } from '@/components/AiProgress';

const DISCLAIMER = 'AI screening only — cannot diagnose or rule out ARF. Clinical assessment is required.';

export function PhotoCard() {
  const { activeEncounterId, activePatientId, commitLevelA } = useAssessment();
  const { user } = useAuth();

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lastAsset, setLastAsset] = useState<{ blob: Blob; mime: string } | null>(null);
  const [stage, setStage] = useState<string | null>(null);

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

  const processFile = useCallback(
    async (blob: Blob, mime: string) => {
      setBusy(true);
      setError(null);
      setLastAsset({ blob, mime }); // cache so a transient failure can be retried
      setStage('Uploading photo');
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
        const path = await uploadPhoto(blob, encounterId!, mime);
        setStage('Analyzing image');
        const analysis = await analyzePhoto(path);
        setStage('Saving result');
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
        setStage(null);
      }
    },
    [activeEncounterId, activePatientId, clinicId, commitLevelA, refresh],
  );

  const handleAsset = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      const mime = asset.mimeType || 'image/jpeg';
      // base64 → data-URL → blob is reliable across web + native; fall back to
      // fetching the asset uri when base64 isn't present.
      const blob = asset.base64
        ? await (await fetch(`data:${mime};base64,${asset.base64}`)).blob()
        : await (await fetch(asset.uri)).blob();
      await processFile(blob, mime);
    },
    [processFile],
  );

  const pickFromLibrary = useCallback(async () => {
    if (busy) return;
    setError(null);
    if (!consent) return setError('Confirm patient consent before adding a photo.');
    if (!clinicId) return setError('No clinic assigned to your account.');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('Photo library access was denied.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    await handleAsset(result.assets[0]);
  }, [busy, consent, clinicId, handleAsset]);

  const takePhoto = useCallback(async () => {
    if (busy) return;
    setError(null);
    if (!consent) return setError('Confirm patient consent before capturing a photo.');
    if (!clinicId) return setError('No clinic assigned to your account.');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Camera access was denied.');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;
    await handleAsset(result.assets[0]);
  }, [busy, consent, clinicId, handleAsset]);

  const retry = useCallback(() => {
    if (lastAsset && !busy) void processFile(lastAsset.blob, lastAsset.mime);
  }, [lastAsset, busy, processFile]);

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
      <CardSubtitle>Capture or upload a photo for AI screening. {DISCLAIMER}</CardSubtitle>

      <View style={styles.consent}>
        <CheckboxRow
          label="I have patient consent to upload this photo"
          checked={consent}
          onToggle={() => setConsent((c) => !c)}
        />
      </View>

      {error ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <Alert variant="warning">{isAiServiceError(error) ? AI_RETRY_MESSAGE : error}</Alert>
          {isAiServiceError(error) && lastAsset ? (
            <SecondaryButton title="Try again" disabled={busy} onPress={retry} />
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 8, gap: 8 }}>
        <PrimaryButton title="Upload from library" disabled={!consent || busy} onPress={pickFromLibrary} />
        <SecondaryButton title="Take photo" disabled={!consent || busy} onPress={takePhoto} />
      </View>

      {busy && stage ? <AiProgress label={stage} /> : null}

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
