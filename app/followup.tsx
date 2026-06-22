/**
 * Follow-Up Visit form — mirrors `#followupScreen` in smart-arf-app.html.
 * Saves the follow-up to the matching local record (by patient code).
 * Source of truth: smart-arf-app.html.
 */
import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, SelectField, StepBadge, TextField, type SelectOption } from '@/components/ui/primitives';
import { useRecords } from '@/state/RecordsContext';
import { Colors } from '@/constants/theme';
import type { BpgStatus, ConfirmedDx, FollowUp } from '@/lib/types';

const DX_OPTS: SelectOption[] = [
  { label: 'ARF Confirmed', value: 'arf' },
  { label: 'Not ARF — Alternative Diagnosis', value: 'not-arf' },
  { label: 'Uncertain / Pending Further Evaluation', value: 'uncertain' },
];
const BPG_OPTS: SelectOption[] = [
  { label: 'Started at this visit', value: 'started' },
  { label: 'Continued from earlier', value: 'continued' },
  { label: 'Stopped — not indicated', value: 'stopped' },
  { label: 'Not given', value: 'not-given' },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FollowupScreen() {
  const { code, name } = useLocalSearchParams<{ code: string; name: string }>();
  const router = useRouter();
  const { addFollowup, getByCode } = useRecords();

  const [visitDate, setVisitDate] = useState(todayISO());
  const [confirmedDx, setConfirmedDx] = useState<ConfirmedDx>('');
  const [finalDx, setFinalDx] = useState('');
  const [bpgStatus, setBpgStatus] = useState<BpgStatus>('');
  const [echoFindings, setEchoFindings] = useState('');
  const [complications, setComplications] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!visitDate) return setErr('Visit date is required.');
    const followup: FollowUp = {
      id: 'fu-' + Date.now(),
      visitDate,
      confirmedDx,
      finalDx,
      bpgStatus,
      echoFindings,
      complications,
      notes,
      createdAt: new Date().toISOString(),
    };
    await addFollowup(code, followup);
    const rec = getByCode(code);
    if (rec) router.replace({ pathname: '/record', params: { id: rec.id } });
    else router.back();
  };

  return (
    <Card style={styles.wrap}>
      <StepBadge>Follow-Up Visit</StepBadge>
      <CardTitle>Record Follow-Up</CardTitle>
      <CardSubtitle>
        Patient: <Text style={styles.bold}>{name}</Text> · <Text style={styles.code}>{code}</Text>
      </CardSubtitle>

      <TextField label="Visit Date" value={visitDate} onChangeText={setVisitDate} placeholder="2026-06-22" />

      <SelectField label="Confirmed Diagnosis at This Visit" value={confirmedDx} options={DX_OPTS} onChange={(v) => setConfirmedDx(v as ConfirmedDx)} />

      <TextField label={<>Final Diagnosis <Text style={styles.suffix}>(if not ARF)</Text></>} value={finalDx} onChangeText={setFinalDx} placeholder="e.g. Reactive arthritis, JIA, viral infection" />

      <SelectField label="BPG (Benzathine Penicillin G) Status" value={bpgStatus} options={BPG_OPTS} onChange={(v) => setBpgStatus(v as BpgStatus)} />

      <TextField label={<>Echo Findings <Text style={styles.suffix}>(optional)</Text></>} value={echoFindings} onChangeText={setEchoFindings} placeholder="e.g. Mild mitral regurgitation" />

      <TextField label={<>Complications <Text style={styles.suffix}>(optional)</Text></>} value={complications} onChangeText={setComplications} placeholder="e.g. Heart failure, recurrent ARF" />

      <TextField label={<>Notes <Text style={styles.suffix}>(optional)</Text></>} value={notes} onChangeText={setNotes} placeholder="Additional observations" />

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <PrimaryButton title="Submit Follow-Up" onPress={submit} />
      <SecondaryButton title="Cancel" onPress={() => router.back()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: 560, width: '100%', alignSelf: 'center', marginTop: 14 },
  bold: { fontWeight: '800' },
  code: { fontFamily: 'Courier', fontWeight: '700' },
  err: { color: Colors.danger, fontSize: 13, marginBottom: 10 },
  suffix: { fontWeight: '400', fontSize: 11, color: Colors.textSecondary },
});
