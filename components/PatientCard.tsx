/**
 * PatientCard — list item for the records / home lists. Shows a tier-colored
 * initials dot, name, meta, and the result line from the patient's most recent
 * initial assessment encounter.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, tierColor } from '@/constants/theme';
import type { PatientSummary } from '@/state/RecordsContext';
import { ageFromDateOfBirth } from '@/lib/types';
import { fullName, initials, maskMRN } from '@/lib/format';

const dotBg: Record<string, string> = {
  unlikely: Colors.success,
  possible: Colors.warning,
  likely: Colors.danger,
  urgent: Colors.urgent,
  chorea: Colors.urgent,
  incomplete: Colors.gray,
};

export function PatientCard({ summary, onPress }: { summary: PatientSummary; onPress: () => void }) {
  const { patient, latestInitial, followupCount } = summary;
  const level = latestInitial?.level ?? null;
  const dot = (level && dotBg[level]) ?? Colors.gray;
  const name = fullName(patient.firstName, patient.lastName);
  const age = ageFromDateOfBirth(patient.dateOfBirth);

  const meta = [
    patient.referralCode,
    patient.mrn ? `MRN ${maskMRN(patient.mrn)}` : '',
    age ? `${age}y` : '',
    patient.gender,
    latestInitial?.date,
    followupCount ? `${followupCount} follow-up${followupCount > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const score = latestInitial?.score;
  const resultLabel = latestInitial?.resultLabel;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { borderColor: Colors.primary }]} onPress={onPress}>
      <View style={[styles.dot, { backgroundColor: dot }]}>
        <Text style={styles.dotText}>{initials(patient.firstName, patient.lastName)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{name}{patient.isTest ? '  (test)' : ''}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        {score != null && resultLabel ? (
          <Text style={[styles.result, { color: (level && tierColor[level]) ?? Colors.gray }]}>
            Score {score} · {resultLabel}
          </Text>
        ) : (
          <Text style={[styles.result, { color: Colors.gray }]}>No assessment yet</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.border} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: 'transparent', shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  dot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  result: { fontSize: 12.5, fontWeight: '700', marginTop: 3 },
});
