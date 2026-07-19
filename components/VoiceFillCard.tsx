/**
 * VoiceFillCard — Step 3: dictate clinical findings to auto-check criteria.
 *
 * v0: web-only. Mic (MediaRecorder) or file upload → transcribe-assessment edge
 * fn (Gemini audio → structured JSON) → review panel → Apply. Clinical criteria
 * only (no demographics). Audio is transient (never stored).
 *
 * Dictate findings only — no patient names/identifiers (PHI to a non-HIPAA API).
 */
import React, { useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Alert,
  Card,
  CardSubtitle,
  CardTitle,
  PrimaryButton,
  SecondaryButton,
  StepBadge,
} from '@/components/ui/primitives';
import { useAssessment } from '@/state/AssessmentContext';
import {
  applyVoiceAssessment,
  audioBlobToBase64,
  transcribeAssessment,
} from '@/lib/voice';
import type { VoiceAssessment } from '@/lib/types';
import { Colors } from '@/constants/theme';

const PRIVACY = 'Dictate clinical findings only — no patient names, DOB, or identifiers.';

const JOINT_DISPLAY: Record<NonNullable<VoiceAssessment['joint']>, string> = {
  none: 'None',
  monoarthralgia: 'Monoarthralgia',
  polyarthralgia: 'Polyarthralgia',
  migratory: 'Migratory polyarthritis',
};

interface FieldMeta {
  key: keyof VoiceAssessment;
  group: string;
  label: string;
  render: (value: boolean | string) => { text: string; flagged: boolean };
}

const FIELDS: FieldMeta[] = [
  { key: 'fever', group: 'Entry', label: 'Fever', render: (v) => ({ text: v ? 'Present' : 'Absent', flagged: v === true }) },
  { key: 'chorea', group: 'Entry', label: 'Chorea', render: (v) => ({ text: v ? 'Present' : 'Absent', flagged: v === true }) },
  { key: 'altCause', group: 'Entry', label: 'Obvious alt. cause for fever', render: (v) => ({ text: v ? 'Yes' : 'No', flagged: false }) },
  { key: 'joint', group: 'Level A', label: 'Joint involvement', render: (v) => ({ text: JOINT_DISPLAY[v as NonNullable<VoiceAssessment['joint']>] ?? String(v), flagged: v === 'migratory' }) },
  { key: 'murmur', group: 'Level A', label: 'Heart murmur', render: (v) => ({ text: v ? 'Present' : 'Absent', flagged: v === true }) },
  { key: 'sob', group: 'Level A', label: 'Shortness of breath', render: (v) => ({ text: v ? 'Present' : 'Absent', flagged: v === true }) },
  { key: 'edema', group: 'Level A', label: 'Edema', render: (v) => ({ text: v ? 'Present' : 'Absent', flagged: v === true }) },
  { key: 'em', group: 'Level A', label: 'Erythema marginatum', render: (v) => ({ text: v ? 'Present' : 'Absent', flagged: v === true }) },
  { key: 'sn', group: 'Level A', label: 'Subcutaneous nodules', render: (v) => ({ text: v ? 'Present' : 'Absent', flagged: v === true }) },
  { key: 'noad', group: 'Level A', label: 'No obvious alt. diagnosis', render: (v) => ({ text: v ? 'Yes' : 'No', flagged: false }) },
  { key: 'facilityType', group: 'Level B', label: 'Facility type', render: (v) => ({ text: String(v), flagged: false }) },
  { key: 'wbc', group: 'Level B', label: 'Elevated WBC', render: (v) => ({ text: v ? 'Yes' : 'No', flagged: v === true }) },
  { key: 'aso', group: 'Level B', label: 'Elevated ASO', render: (v) => ({ text: v ? 'Yes' : 'No', flagged: v === true }) },
  { key: 'esr', group: 'Level B', label: 'Elevated ESR/CRP', render: (v) => ({ text: v ? 'Yes' : 'No', flagged: v === true }) },
  { key: 'antidnase', group: 'Level B', label: 'Anti-DNase B positive', render: (v) => ({ text: v ? 'Yes' : 'No', flagged: v === true }) },
  { key: 'pr', group: 'Level B', label: 'Prolonged PR', render: (v) => ({ text: v ? 'Yes' : 'No', flagged: v === true }) },
  { key: 'echo', group: 'Level B', label: 'Echo suggestive of RHD', render: () => ({ text: 'Suggestive', flagged: true }) },
];

export function VoiceFillCard() {
  const { setInputs, setEntry } = useAssessment();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceAssessment | null>(null);

  const processBlob = useCallback(async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const b64 = await audioBlobToBase64(blob);
      const mime = blob.type || 'audio/webm';
      const parsed = await transcribeAssessment(b64, mime);
      setResult(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    if (Platform.OS !== 'web' || !navigator.mediaDevices) {
      setError('Voice recording is web-only for now.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        void processBlob(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      setError('Could not access microphone: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [processBlob]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (e.target) e.target.value = '';
      if (!file) return;
      await processBlob(file);
    },
    [processBlob],
  );

  const onApply = useCallback(() => {
    if (!result) return;
    applyVoiceAssessment(result, setInputs, setEntry);
    setResult(null);
  }, [result, setInputs, setEntry]);

  const onDiscard = useCallback(() => setResult(null), []);

  const rows = result
    ? FIELDS.filter((f) => result[f.key] !== undefined).map((f) => ({
        key: f.key,
        group: f.group,
        label: f.label,
        ...f.render(result[f.key] as boolean | string),
      }))
    : [];

  return (
    <Card>
      <StepBadge>Optional · Voice Fill (trial)</StepBadge>
      <CardTitle>Dictate Findings</CardTitle>
      <CardSubtitle>Speak the clinical findings to auto-check criteria across the assessment. {PRIVACY}</CardSubtitle>

      {error ? (
        <View style={{ marginTop: 8 }}>
          <Alert variant="warning">{error}</Alert>
        </View>
      ) : null}

      <View style={{ marginTop: 8, gap: 8 }}>
        <PrimaryButton
          title={recording ? '⏹ Stop & Transcribe' : busy ? 'Transcribing…' : '🎙 Record'}
          disabled={busy}
          onPress={recording ? stopRecording : startRecording}
        />
        <SecondaryButton
          title="Upload audio file"
          disabled={busy || recording || Platform.OS !== 'web'}
          onPress={() => fileRef.current?.click()}
        />
      </View>

      {Platform.OS === 'web' ? (
        <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={onFile} />
      ) : null}

      {result ? (
        <View style={styles.review}>
          <Text style={styles.reviewTitle}>
            {rows.length ? `Extracted ${rows.length} field(s) — review then apply` : 'No criteria detected in the recording.'}
          </Text>
          {rows.length > 0 ? (
            <View style={{ marginTop: 6, gap: 5 }}>
              {rows.map((r) => (
                <View key={r.key} style={styles.row}>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <Text style={[styles.rowValue, r.flagged ? styles.flagged : null]}>{r.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {rows.length > 0 ? (
            <View style={{ marginTop: 8, gap: 8 }}>
              <PrimaryButton title="Apply to form" onPress={onApply} />
              <SecondaryButton title="Discard" onPress={onDiscard} />
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              <SecondaryButton title="Clear" onPress={onDiscard} />
            </View>
          )}
        </View>
      ) : null}

      <View style={{ marginTop: 10 }}>
        <Alert variant="warning">AI transcription can mishear — always verify the checked boxes. {PRIVACY}</Alert>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  review: { marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: Colors.grayLight },
  reviewTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  flagged: { color: Colors.danger },
});
