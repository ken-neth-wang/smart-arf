/**
 * Record detail — combines `viewRecord()` modal content (L2383) and the
 * lookup-result screen's follow-up section (L2701) from smart-arf-app.html.
 * Shows the full result, breakdown, actions, follow-up history, and the
 * edit / add-follow-up / remove controls. Source of truth: smart-arf-app.html.
 */
import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert as RNAlert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, SelectField, StepBadge, type SelectOption } from '@/components/ui/primitives';
import { ScoreBreakdown } from '@/components/ui/results';
import { useRecords } from '@/state/RecordsContext';
import { useAssessment } from '@/state/AssessmentContext';
import { Colors, tierColor } from '@/constants/theme';
import { fullName } from '@/lib/format';
import type { BpgStatus, ConfirmedDx, DeleteReason } from '@/lib/types';

// Soft-delete reason taxonomy — mirrors softDeleteModal options (HTML L927–934).
const REASON_OPTS: SelectOption[] = [
  { label: 'Duplicate entry', value: 'duplicate' },
  { label: 'Wrong patient / data entered for wrong person', value: 'wrong-patient' },
  { label: 'Test / training entry', value: 'test-entry' },
  { label: 'Significant data entry error (cannot be edited)', value: 'data-entry-error' },
  { label: 'Patient withdrew consent', value: 'patient-withdrew' },
  { label: 'Other', value: 'other' },
];

// Follow-up display labels — mirror renderLookupResult() (HTML L2746–2747).
const DX_LABEL: Record<ConfirmedDx, string> = {
  '': '—',
  arf: 'ARF Confirmed',
  'not-arf': 'Not ARF',
  uncertain: 'Uncertain',
};
const BPG_LABEL: Record<BpgStatus, string> = {
  '': '—',
  started: 'Started',
  continued: 'Continued',
  stopped: 'Stopped',
  'not-given': 'Not given',
};

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
  // Mirrors HTML viewRecord() meta (L2390–2396): UNMASKED values shown in detail.
  const meta = [
    record.patientCode ? `Code: ${record.patientCode}` : '',
    record.mrn ? `MRN: ${record.mrn}` : '',
    record.age ? `Age: ${record.age}y` : '',
    record.gender,
    record.setting,
  ].filter(Boolean);
  if (record.phone1) meta.push(`📞 ${record.phone1}`);
  if (record.phone2) meta.push(`📞 (alt) ${record.phone2}`);
  if (record.referredTo) meta.push(`→ ${record.referredTo}`);
  const metaLine = meta.join(' · ');
  const color = tierColor[record.level] ?? Colors.gray;

  const confirmDelete = async () => {
    await softDelete(record.id, reason as DeleteReason);
    setDelOpen(false);
    router.back();
  };

  // Mirrors HTML deleteAndClose() (L2532–2548): test entries skip the reason
  // dialog and are soft-deleted immediately with reason 'test-entry'.
  const handleRemove = () => {
    if (record.isTest) {
      RNAlert.alert(
        'Remove this test/training entry from your device?',
        '',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: async () => { await softDelete(record.id, 'test-entry'); router.back(); } },
        ],
        { cancelable: true },
      );
    } else {
      setDelOpen(true);
    }
  };

  // Follow-up section heading mirrors renderLookupResult() (HTML L2750):
  // "Follow-Ups (N)" when present, hidden entirely when none.
  const followupHeading = `Follow-Ups${record.followups.length ? ` (${record.followups.length})` : ''}`;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>Patient Record</StepBadge>
        <CardTitle>{name}{record.isTest ? '  (test)' : ''}</CardTitle>
        <CardSubtitle>{metaLine}</CardSubtitle>
        {/* Date — HTML viewRecord() L2398. MVP is local-only so no sync status. */}
        <Text style={styles.dateSync}>📅 {record.date || 'Unknown date'}</Text>

        {/* Result summary — HTML viewRecord() L2402–2406: tier-tinted box. */}
        <View style={[styles.scoreBox, { backgroundColor: color + '1A', borderColor: color }]}>
          <Text style={[styles.scoreNum, { color }]}>{record.score}</Text>
          <Text style={[styles.scoreLabel, { color }]}>{record.resultLabel || '—'}</Text>
          <Text style={[styles.scoreRange, { color }]}>{record.range || ''}</Text>
        </View>
      </Card>

      {/* Score Breakdown — BEFORE actions (HTML viewRecord() order L2408–2417). */}
      <ScoreBreakdown title="Score Breakdown" rows={breakdownRows} />

      {/* Recommended Actions — HTML viewRecord() L2419–2427. */}
      {record.actions.length > 0 ? (
        <Card>
          <Text style={styles.actionHeading}>Recommended Actions</Text>
          {record.actions.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <Text style={{ color: Colors.primary, fontWeight: '800' }}>•</Text>
              <Text style={styles.actionText}>{a}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Follow-Ups — HTML lookup-result followup-card format (L2748–2762). */}
      <Card>
        <CardTitle>{followupHeading}</CardTitle>
        {record.followups.length === 0 ? (
          <Text style={styles.empty}>No follow-up visits recorded.</Text>
        ) : (
          record.followups.map((f) => (
            <View key={f.id} style={styles.followup}>
              <View style={styles.fcHeader}>
                <Text style={styles.fcDate}>{f.visitDate || '—'}</Text>
              </View>
              <View style={styles.fcBody}>
                <Text style={styles.fcRow}><Text style={styles.fcKey}>Diagnosis: </Text>{DX_LABEL[f.confirmedDx]}{f.finalDx ? ` — ${f.finalDx}` : ''}</Text>
                <Text style={styles.fcRow}><Text style={styles.fcKey}>BPG: </Text>{BPG_LABEL[f.bpgStatus]}</Text>
                {f.echoFindings ? <Text style={styles.fcRow}><Text style={styles.fcKey}>Echo: </Text>{f.echoFindings}</Text> : null}
                {f.complications ? <Text style={styles.fcRow}><Text style={styles.fcKey}>Complications: </Text>{f.complications}</Text> : null}
                {f.notes ? <Text style={styles.fcRow}><Text style={styles.fcKey}>Notes: </Text>{f.notes}</Text> : null}
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Controls — HTML viewRecord() buttons (L2429–2432) + lookup-result's
          add-follow-up entry point. */}
      <PrimaryButton title="＋ Add Follow-Up Visit" onPress={() => router.push({ pathname: '/followup', params: { code: record.patientCode, name } })} />
      <PrimaryButton title="✏ Edit / Add to Assessment" color={Colors.primaryDark} onPress={() => { loadRecordForEdit(record); router.navigate('/(tabs)/assess'); }} />
      <SecondaryButton title={record.isTest ? 'Remove test entry' : 'Remove record'} onPress={handleRemove} />

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
  dateSync: { fontSize: 12, color: Colors.textSecondary, marginBottom: 14 },
  scoreBox: { borderWidth: 2, borderRadius: 12, padding: 18, alignItems: 'center' },
  scoreNum: { fontSize: 44, fontWeight: '900', lineHeight: 48 },
  scoreLabel: { fontSize: 17, fontWeight: '800' },
  scoreRange: { fontSize: 12.5, marginTop: 2 },
  actionHeading: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.textSecondary, marginBottom: 10 },
  actionText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 19 },
  empty: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 19 },
  followup: { backgroundColor: Colors.grayLight, borderRadius: 8, padding: 12, marginBottom: 10 },
  fcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  fcDate: { fontSize: 13, fontWeight: '800', color: Colors.text },
  fcBody: { gap: 4 },
  fcRow: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  fcKey: { fontWeight: '700', color: Colors.textSecondary },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden' },
  modalHeader: { backgroundColor: Colors.danger, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalText: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: 14 },
});
