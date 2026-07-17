/**
 * Record detail — a patient + their encounter timeline (initial assessments +
 * follow-ups). Replaces the old fused-record view.
 */
import React, { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert as RNAlert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, SelectField, StepBadge, type SelectOption } from '@/components/ui/primitives';
import { ScoreBreakdown } from '@/components/ui/results';
import { useRecords } from '@/state/RecordsContext';
import { useAssessment } from '@/state/AssessmentContext';
import { useAuth } from '@/state/AuthContext';
import { canEditPatient } from '@/lib/permissions';
import { Colors, tierColor } from '@/constants/theme';
import { fullName, maskMRN, maskPhone } from '@/lib/format';
import { ageFromDateOfBirth, type BpgStatus, type ConfirmedDx, type DeleteReason, type Encounter } from '@/lib/types';

const REASON_OPTS: SelectOption[] = [
  { label: 'Duplicate entry', value: 'duplicate' },
  { label: 'Wrong patient / data entered for wrong person', value: 'wrong-patient' },
  { label: 'Test / training entry', value: 'test-entry' },
  { label: 'Significant data entry error (cannot be edited)', value: 'data-entry-error' },
  { label: 'Patient withdrew consent', value: 'patient-withdrew' },
  { label: 'Other', value: 'other' },
];

const DX_LABEL: Record<ConfirmedDx, string> = { '': '—', arf: 'ARF Confirmed', 'not-arf': 'Not ARF', uncertain: 'Uncertain' };
const BPG_LABEL: Record<BpgStatus, string> = { '': '—', started: 'Started', continued: 'Continued', stopped: 'Stopped', 'not-given': 'Not given' };
const TYPE_LABEL: Record<Encounter['type'], string> = { initial: 'Assessment', followup: 'Follow-Up' };

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getPatientWithHistory, softDelete, softDeleteEncounter } = useRecords();
  const { loadRecordForEdit } = useAssessment();
  const { user } = useAuth();
  const history = id ? getPatientWithHistory(id) : undefined;

  const [delOpen, setDelOpen] = useState(false);
  const [reason, setReason] = useState<string>('');
  const [encDelId, setEncDelId] = useState<string | null>(null);

  const initialEncounter = useMemo(
    () => history?.encounters.find((e) => e.type === 'initial'),
    [history],
  );

  if (!history) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Patient not found.</Text>
        <SecondaryButton title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const { patient, encounters } = history;
  const name = fullName(patient.firstName, patient.lastName);
  const age = ageFromDateOfBirth(patient.dateOfBirth);
  const line2 = [
    patient.gender,
    age ? `Age: ${age}y` : '',
    patient.mrn ? `MRN: ${patient.mrn}` : '',
    patient.phone1 ? `📞 ${patient.phone1}` : '',
    patient.phone2 ? `📞 (alt) ${patient.phone2}` : '',
  ].filter(Boolean).join(' · ');

  const score = initialEncounter?.score ?? null;
  const level = initialEncounter?.level ?? null;
  const color = (level && tierColor[level]) ?? Colors.gray;
  const breakdownRows = initialEncounter?.breakdown
    ? [...initialEncounter.breakdown, { label: 'Total', points: initialEncounter.score ?? 0, kind: 'total' as const }]
    : [];

  const confirmDelete = async () => {
    await softDelete(patient.id, reason as DeleteReason);
    setDelOpen(false);
    router.back();
  };

  const confirmEncounterDelete = async () => {
    if (encDelId) {
      await softDeleteEncounter(encDelId, reason as DeleteReason);
    }
    setEncDelId(null);
  };

  const handleRemove = () => {
    const doRemove = async (r: DeleteReason) => { await softDelete(patient.id, r); router.back(); };
    if (patient.isTest) {
      const run = () => doRemove('test-entry');
      if (Platform.OS === 'web') {
        if (window.confirm('Remove this test/training entry from your device?')) run();
        return;
      }
      RNAlert.alert('Remove this test/training entry from your device?', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: run },
      ], { cancelable: true });
    } else {
      setDelOpen(true);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>Patient Record</StepBadge>
        <CardTitle>{name}{patient.isTest ? '  (test)' : ''}</CardTitle>
        <CardSubtitle>{line2}</CardSubtitle>
        {patient.referralCode ? (
          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary, marginTop: 2 }}>Referral Code: {patient.referralCode}</Text>
        ) : null}
        <Text style={styles.dateSync}>Registered {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : '—'}</Text>

        {score != null && initialEncounter ? (
          <View style={[styles.scoreBox, { backgroundColor: color + '1A', borderColor: color }]}>
            <Text style={[styles.scoreNum, { color }]}>{score}</Text>
            <Text style={[styles.scoreLabel, { color }]}>{initialEncounter.resultLabel || '—'}</Text>
            <Text style={[styles.scoreRange, { color }]}>{initialEncounter.range || ''}</Text>
          </View>
        ) : (
          <Text style={styles.empty}>No scored assessment on record.</Text>
        )}
      </Card>

      {breakdownRows.length > 0 ? (
        <ScoreBreakdown title="Latest Score Breakdown" rows={breakdownRows} />
      ) : null}

      {initialEncounter && initialEncounter.actions && initialEncounter.actions.length > 0 ? (
        <Card>
          <Text style={styles.actionHeading}>Recommended Actions</Text>
          {initialEncounter.actions.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <Text style={{ color: Colors.primary, fontWeight: '800' }}>•</Text>
              <Text style={styles.actionText}>{a}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <CardTitle>Encounters{encounters.length ? ` (${encounters.length})` : ''}</CardTitle>
        {encounters.length === 0 ? (
          <Text style={styles.empty}>No encounters recorded.</Text>
        ) : (
          encounters.map((e) => (
            <View key={e.id} style={styles.encounter}>
              <View style={styles.encHeader}>
                <Text style={[styles.encType, e.type === 'initial' && { color: Colors.primary }]}>{TYPE_LABEL[e.type]}</Text>
                <Text style={styles.encDate}>{e.date || '—'}</Text>
              </View>
              <View style={styles.encBody}>
                {e.type === 'initial' && e.score != null ? (
                  <Text style={styles.encRow}><Text style={styles.encKey}>Score: </Text>{e.score} · {e.resultLabel || '—'}</Text>
                ) : null}
                {e.confirmedDx ? <Text style={styles.encRow}><Text style={styles.encKey}>Diagnosis: </Text>{DX_LABEL[e.confirmedDx]}{e.finalDx ? ` — ${e.finalDx}` : ''}</Text> : null}
                {e.bpgStatus ? <Text style={styles.encRow}><Text style={styles.encKey}>BPG: </Text>{BPG_LABEL[e.bpgStatus]}</Text> : null}
                {e.echoFindings ? <Text style={styles.encRow}><Text style={styles.encKey}>Echo: </Text>{e.echoFindings}</Text> : null}
                {e.complications ? <Text style={styles.encRow}><Text style={styles.encKey}>Complications: </Text>{e.complications}</Text> : null}
                {e.referredTo ? <Text style={styles.encRow}><Text style={styles.encKey}>Referred to: </Text>{e.referredTo}</Text> : null}
                {e.notes ? <Text style={styles.encRow}><Text style={styles.encKey}>Notes: </Text>{e.notes}</Text> : null}
              </View>
              {canEditPatient(user, { clinicId: patient.clinicId ?? null }) ? (
                <Pressable hitSlop={6} onPress={() => { setReason(''); setEncDelId(e.id); }} style={styles.encRemoveBtn}>
                  <Text style={styles.encRemoveText}>Remove this visit</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </Card>

      <PrimaryButton
        title="＋ Add Follow-Up Visit"
        onPress={() => router.push({ pathname: '/followup', params: { id: patient.id, code: patient.referralCode, name } })}
      />
      {initialEncounter ? (
        <PrimaryButton
          title="✏ Edit / Add to Assessment"
          color={Colors.primaryDark}
          onPress={() => { loadRecordForEdit(patient, initialEncounter); router.navigate('/(tabs)/assess'); }}
        />
      ) : null}
      <SecondaryButton title="💊 View BPG Protocol" onPress={() => router.push('/(tabs)/bpg')} />
      <SecondaryButton title={patient.isTest ? 'Remove test entry' : 'Remove patient'} onPress={handleRemove} />

      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => setDelOpen(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove Patient</Text>
              <Pressable hitSlop={12} onPress={() => setDelOpen(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <View style={{ padding: 18 }}>
              <Text style={styles.modalText}>This patient and all their encounters will be removed from this device. Retained for audit purposes.</Text>
              <SelectField label="Reason for removal" value={reason} options={REASON_OPTS} onChange={setReason} />
              <PrimaryButton title="Remove Patient" color={Colors.danger} onPress={confirmDelete} />
              <SecondaryButton title="Cancel" onPress={() => setDelOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={encDelId !== null} transparent animationType="fade" onRequestClose={() => setEncDelId(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Remove Visit</Text>
              <Pressable hitSlop={12} onPress={() => setEncDelId(null)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <View style={{ padding: 18 }}>
              <Text style={styles.modalText}>This visit will be removed from view. The patient and their other encounters remain. Retained for audit purposes.</Text>
              <SelectField label="Reason for removal" value={reason} options={REASON_OPTS} onChange={setReason} />
              <PrimaryButton title="Remove Visit" color={Colors.danger} onPress={confirmEncounterDelete} />
              <SecondaryButton title="Cancel" onPress={() => setEncDelId(null)} />
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
  encounter: { backgroundColor: Colors.grayLight, borderRadius: 8, padding: 12, marginBottom: 10 },
  encHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  encType: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, color: Colors.textSecondary },
  encDate: { fontSize: 13, fontWeight: '800', color: Colors.text },
  encBody: { gap: 4 },
  encRow: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  encKey: { fontWeight: '700', color: Colors.textSecondary },
  encRemoveBtn: { alignSelf: 'flex-end', marginTop: 8, paddingVertical: 4, paddingHorizontal: 6 },
  encRemoveText: { fontSize: 12.5, fontWeight: '700', color: Colors.danger },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalBox: { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden' },
  modalHeader: { backgroundColor: Colors.danger, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalText: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: 14 },
});
