/**
 * PatientCard — list item for `.patient-card` in smart-arf-app.html (landing
 * history + records list). Shows a tier-colored initials dot, name, meta, and
 * the result line. Source of truth: smart-arf-app.html.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, tierColor } from '@/constants/theme';
import type { PatientRecord } from '@/lib/types';
import { fullName, initials, maskMRN } from '@/lib/format';

const dotBg: Record<string, string> = {
  unlikely: Colors.success,
  possible: Colors.warning,
  likely: Colors.danger,
  urgent: Colors.urgent,
  chorea: Colors.urgent,
  incomplete: Colors.gray,
};

export function PatientCard({ record, onPress }: { record: PatientRecord; onPress: () => void }) {
  const dot = dotBg[record.level] ?? Colors.gray;
  const name = fullName(record.firstName, record.lastName);
  const meta = [
    record.patientCode,
    record.mrn ? `MRN: ${maskMRN(record.mrn)}` : '',
    record.age ? `${record.age}y` : '',
    record.gender,
    record.date,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { borderColor: Colors.primary }]} onPress={onPress}>
      <View style={[styles.dot, { backgroundColor: dot }]}>
        <Text style={styles.dotText}>{initials(record.firstName, record.lastName)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{name}{record.isTest ? '  (test)' : ''}</Text>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        <Text style={[styles.result, { color: tierColor[record.level] ?? Colors.gray }]}>
          Score: {record.score} · {record.resultLabel}
        </Text>
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
