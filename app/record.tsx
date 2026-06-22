/**
 * Record detail — combines `viewRecord()` modal content and the lookup-result
 * screen from smart-arf-app.html. Shows the full result, breakdown, referral,
 * follow-up history, and actions (edit / add follow-up / remove).
 * Source of truth: smart-arf-app.html.
 */
import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, SelectField, StepBadge, type SelectOption } from '@/components/ui/primitives';
import { PatientCodeCard, ScoreBreakdown } from '@/components/ui/results';
import { useRecords } from '@/state/RecordsContext';
import { useAssessment } from '@/state/AssessmentContext';
import { Colors, tierColor } from '@/constants/theme';
import { fullName, maskMRN, maskPhone } from '@/lib/format';
import type { DeleteReason } from '@/lib/types';

const REASON_OPTS: SelectOption[] = [
  { label: 'Duplicate entry', value: 'duplicate' },
  { label: 'Wrong patient / wrong person', value: 'wrong-patient' },
  { label: 'Test / training entry', value: 'test-entry' },
  { label: 'Significant data entry error', value: 'data-entry-error' },
  { label: 'Patient withdrew consent', value: 'patient-withdrew' },
  { label: 'Other', value: 'other' },
];

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, softDelete } = useRecords();
  const { loadRecordForEdit } = useAssessment();
  const record = getById(id);

  const [delOpen, setDelOpen] = useState(false);
  const [reason, setReason] = useState<string>('');

  const breakdownRows = useMemo(() => {
    if (!record) return [];
    return [...record.breakdown, { label: 'Total', points: record.score, kind: 'total' as const }];
  }, [record]);

  if (!record) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Record not found.</Text>
        <SecondaryButton title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const name = fullName(record.firstName, record.lastName);
  const meta = [
    record.patientCode,
    record.mrn ? `MRN ${maskMRN(record.mrn)}` : '',
    record.age ? `${record.age}y` : '',
    record.gender,
    record.phone1 ? `📞 ${maskPhone(record.phone1)}` : '',
    record.date,
  ].filter(Boolean).join(' · ');
  const color = tierColor[record.level] ?? Colors.gray;

  const confirmDelete = async () => {
    if (!reason) return;
    await softDelete(record.id, reason as DeleteReason);
    setDelOpen(false);
    router.back();
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>Patient Record</StepBadge>
        <CardTitle>{name}{record.isTest ? '  (test)' : ''}</CardTitle>
        <CardSubtitle>{meta}</CardSubtitle>

        <View style={[styles.scoreBox, { backgroundColor: color + '1A', borderColor: color }]}>
          <Text style={[styles.scoreNum, { color }]}>{record.score}</Text>
          <Text style={[styles.scoreLabel, { color }]}>{record.resultLabel}</Text>
          <Text style={[styles.scoreRange, { color }]}>{record.range}{record.includesLevelB ? '  · includes Level B' : '  · Level A only'}</Text>
        </View>

        {record.referredTo ? (
          <View style={styles.referral}>
            <Text style={styles.refLabel}>Referred to</Text>
            <Text style={styles.refVal}>{record.referredTo}</Text>
          </View>
        ) : null}
      </Card>

      {record.actions.length > 0 ? (
        <Card>
          <Text style={styles.actionHeading}>Recommended Actions</Text>
          {record.actions.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <Text style={{ color: color, fontWeight: '800' }}>•</Text>
              <Text style={styles.actionText}>{a}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <PatientCodeCard code={record.patientCode} />

      <ScoreBreakdown title="Score Breakdown" rows={breakdownRows} />

      <Card>
        <CardTitle>Follow-Up History</CardTitle>
        {record.followups.length === 0 ? (
          <Text style={styles.empty}>No follow-up visits recorded.</Text>
        ) : (
          record.followups.map((f) => (
            <View key={f.id} style={styles.followup}>
              <Text style={styles.fuDate}>{f.visitDate}{f.confirmedDx === 'arf' ? '  · ARF Confirmed' : f.confirmedDx === 'not-arf' ? '  · Not ARF' : f.confirmedDx === 'uncertain' ? '  · Uncertain' : ''}</Text>
              {f.finalDx ? <Text style={styles.fuLine}>Diagnosis: {f.finalDx}</Text> : null}
              {f.bpgStatus ? <Text style={styles.fuLine}>BPG: {f.bpgStatus}</Text> : null}
              {f.echoFindings ? <Text style={styles.fuLine}>Echo: {f.echoFindings}</Text> : null}
              {f.complications ? <Text style={styles.fuLine}>Complications: {f.complications}</Text> : null}
              {f.notes ? <Text style={styles.fuLine}>Notes: {f.notes}</Text> : null}
            </View>
          ))
        )}
      </Card>

      <PrimaryButton title="＋ Add Follow-Up Visit" onPress={() => router.push({ pathname: '/followup', params: { code: record.patientCode, name } })} />
      <PrimaryButton title="✏ Edit / Add to Assessment" color={Colors.primaryDark} onPress={() => { loadRecordForEdit(record); router.navigate('/(tabs)/assess'); }} />
      <SecondaryButton title={record.isTest ? 'Remove test entry' : 'Remove record'} onPress={() => setDelOpen(true)} />

      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => setDelOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove Patient Record</Text>
              <Pressable hitSlop={12} onPress={() => setDelOpen(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <View style={{ padding: 18 }}>
              <Text style={styles.modalText}>This record will be removed from this device. It is retained for audit purposes.</Text>
              <SelectField label="Reason for removal" value={reason} options={REASON_OPTS} onChange={setReason} />
              <PrimaryButton title="Remove Record" color={Colors.danger} onPress={confirmDelete} />
              <SecondaryButton title="Cancel" onPress={() => setDelOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  missingText: { fontSize: 16, color: Colors.textSecondary, marginBottom: 16 },
  scoreBox: { borderWidth: 2, borderRadius: 12, padding: 18, alignItems: 'center' },
  scoreNum: { fontSize: 44, fontWeight: '900', lineHeight: 48 },
  scoreLabel: { fontSize: 17, fontWeight: '800' },
  scoreRange: { fontSize: 12.5, marginTop: 2 },
  referral: { backgroundColor: Colors.primaryLight, borderLeftWidth: 4, borderLeftColor: Colors.primary, borderRadius: 8, padding: 12, marginTop: 14 },
  refLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.primaryDark, marginBottom: 3 },
  refVal: { fontSize: 14.5, color: Colors.text, fontWeight: '700' },
  actionHeading: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.textSecondary, marginBottom: 10 },
  actionText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 19 },
  empty: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 19 },
  followup: { backgroundColor: Colors.primaryLight, borderLeftWidth: 4, borderLeftColor: Colors.primary, borderRadius: 8, padding: 12, marginBottom: 10 },
  fuDate: { fontSize: 13, fontWeight: '800', color: Colors.primaryDark, marginBottom: 4 },
  fuLine: { fontSize: 13, color: Colors.text, marginBottom: 3, lineHeight: 18 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden' },
  modalHeader: { backgroundColor: Colors.danger, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalText: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: 14 },
});
