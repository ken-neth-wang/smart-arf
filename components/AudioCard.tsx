/**
 * AudioCard — Step 5 card: upload a digital auscultation (heart-sound)
 * recording, run murmur screening, store it. v0: Gemini audio. Flag only —
 * NEVER affects the Jones score (murmur/carditis is a Major criterion but the
 * AI read is unvalidated).
 *
 * Web-only file input (the app has no native build yet). Anchors each recording
 * to the current assessment's encounter (committing the draft first if needed).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  analyzeAudio,
  getAudioUrl,
  loadAudioForEncounter,
  saveAudioRecord,
  softDeleteAudio,
  uploadAudio,
} from '@/lib/audio';
import type { AudioRecord } from '@/lib/types';
import { Colors } from '@/constants/theme';

const DISCLAIMER = 'AI screening only — cannot diagnose murmurs or carditis. Clinical assessment is required.';

export function AudioCard() {
  const { activeEncounterId, activePatientId, commitLevelA } = useAssessment();
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileRef = useRef<any>(null);

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audios, setAudios] = useState<AudioRecord[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const clinicId = user?.memberships[0]?.clinicId ?? null;

  const refresh = useCallback(async (encounterId: string) => {
    try {
      const list = await loadAudioForEncounter(encounterId);
      setAudios(list);
      const mapped: Record<string, string> = {};
      await Promise.all(
        list.map(async (a) => {
          try {
            mapped[a.id] = await getAudioUrl(a.storagePath);
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
    else setAudios([]);
  }, [activeEncounterId, refresh]);

  const onUpload = useCallback(() => {
    if (busy) return;
    setError(null);
    if (!consent) return setError('Confirm patient consent before uploading.');
    if (!clinicId) return setError('No clinic assigned to your account.');
    if (Platform.OS !== 'web') return setError('Audio upload is web-only for now.');
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
        const mime = file.type || 'audio/mpeg';
        const path = await uploadAudio(file, encounterId!, mime);
        const analysis = await analyzeAudio(path);
        await saveAudioRecord({
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
        await softDeleteAudio(id);
        if (activeEncounterId) await refresh(activeEncounterId);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeEncounterId, refresh],
  );

  return (
    <Card>
      <StepBadge>Optional · AI Auscultation (trial)</StepBadge>
      <CardTitle>Auscultation Recording</CardTitle>
      <CardSubtitle>Upload a heart-sound recording for murmur screening. {DISCLAIMER}</CardSubtitle>

      {/* hidden web file input */}
      {Platform.OS === 'web' ? (
        <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={onFile} />
      ) : null}

      <View style={styles.consent}>
        <CheckboxRow
          label="I have patient consent to upload this recording"
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
          title={busy ? 'Uploading…' : 'Upload Recording'}
          disabled={!consent || busy || Platform.OS !== 'web'}
          onPress={onUpload}
        />
      </View>

      {audios.length > 0 ? (
        <View style={styles.list}>
          {audios.map((a) => (
            <View key={a.id} style={[styles.item, a.murmurDetected && styles.itemFlagged]}>
              <View style={{ flex: 1 }}>
                {Platform.OS === 'web' && urls[a.id] ? (
                  <audio controls src={urls[a.id]} style={{ width: '100%', height: 36 }} />
                ) : null}
                <Text style={styles.finding}>{a.finding}</Text>
                <Text style={[styles.meta, a.murmurDetected && styles.metaFlagged]}>
                  {a.murmurDetected ? '⚠ Murmur detected' : 'No murmur detected'} · {Math.round(a.confidence * 100)}% conf
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onDelete(a.id)}
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
  finding: { fontSize: 13.5, fontWeight: '600', color: Colors.text, marginTop: 6 },
  meta: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  metaFlagged: { color: Colors.danger, fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteX: { color: Colors.danger, fontSize: 16, fontWeight: '700' },
});
