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
  SecondaryButton,
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
import type { AudioRecord, AudioClassification } from '@/lib/types';
import { Colors } from '@/constants/theme';
import { AI_RETRY_MESSAGE, isAiServiceError } from '@/lib/aiErrors';
import { AiProgress } from '@/components/AiProgress';

const DISCLAIMER = 'AI screening only — cannot diagnose murmurs or carditis. Clinical assessment is required.';

function classMeta(c: AudioClassification): {
  label: string;
  itemStyle?: 'itemChd' | 'itemFlagged';
  metaStyle?: 'metaChd' | 'metaFlagged';
} {
  switch (c) {
    case 'normal':
      return { label: '✓ Normal', itemStyle: undefined, metaStyle: undefined };
    case 'chd':
      return { label: 'CHD pattern (not ARF)', itemStyle: 'itemChd', metaStyle: 'metaChd' };
    case 'abnormal':
      return { label: '⚠ Abnormal — ARF-suspect', itemStyle: 'itemFlagged', metaStyle: 'metaFlagged' };
  }
}

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
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [stage, setStage] = useState<string | null>(null);

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

  const processFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setLastFile(file); // cache so a transient failure can be retried
      setStage('Uploading recording');
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
        setStage('Analyzing audio');
        const analysis = await analyzeAudio(path);
        setStage('Saving result');
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
        setStage(null);
      }
    },
    [activeEncounterId, activePatientId, clinicId, commitLevelA, refresh],
  );

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-picking the same file
      if (file) await processFile(file);
    },
    [processFile],
  );

  const retry = useCallback(() => {
    if (lastFile && !busy) void processFile(lastFile);
  }, [lastFile, busy, processFile]);

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
        <View style={{ marginTop: 8, gap: 8 }}>
          <Alert variant="warning">{isAiServiceError(error) ? AI_RETRY_MESSAGE : error}</Alert>
          {isAiServiceError(error) && lastFile ? (
            <SecondaryButton title="Try again" disabled={busy} onPress={retry} />
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 8 }}>
        <PrimaryButton
          title="Upload Recording"
          disabled={!consent || busy || Platform.OS !== 'web'}
          onPress={onUpload}
        />
      </View>

      {busy && stage ? <AiProgress label={stage} /> : null}

      {audios.length > 0 ? (
        <View style={styles.list}>
          {audios.map((a) => {
            const m = classMeta(a.classification);
            return (
              <View key={a.id} style={[styles.item, m.itemStyle ? styles[m.itemStyle] : undefined]}>
                <View style={{ flex: 1 }}>
                  {Platform.OS === 'web' && urls[a.id] ? (
                    <audio controls src={urls[a.id]} style={{ width: '100%', height: 36 }} />
                  ) : null}
                  <Text style={styles.finding}>{a.finding}</Text>
                  <Text style={[styles.meta, m.metaStyle ? styles[m.metaStyle] : undefined]}>
                    {m.label} · {Math.round(a.confidence * 100)}% conf
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
            );
          })}
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
  itemChd: { backgroundColor: Colors.warningBg, borderColor: Colors.warning },
  metaChd: { color: Colors.warning, fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteX: { color: Colors.danger, fontSize: 16, fontWeight: '700' },
});
