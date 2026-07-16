/**
 * Records — searchable list of patients. Each card reflects the patient's
 * latest initial assessment. Source of truth: smart-arf-app.html.
 */
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, TextInput, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardSubtitle, CardTitle, StepBadge } from '@/components/ui/primitives';
import { PatientCard } from '@/components/PatientCard';
import { useRecords } from '@/state/RecordsContext';
import { Colors } from '@/constants/theme';

export default function RecordsScreen() {
  const router = useRouter();
  const { patientSummaries } = useRecords();
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  const filtered = query
    ? patientSummaries.filter((s) => {
        const hay = `${s.patient.firstName} ${s.patient.lastName} ${s.patient.mrn} ${s.patient.referralCode} ${s.latestInitial?.resultLabel ?? ''}`.toLowerCase();
        return hay.includes(query);
      })
    : patientSummaries;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>Patient Records</StepBadge>
        <CardTitle>All Patients</CardTitle>
        <CardSubtitle>Search and review every patient saved on this device.</CardSubtitle>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.gray} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="🔍 Search by name, MRN, or code…"
            placeholderTextColor={Colors.gray}
            style={styles.search}
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{query ? '🔍' : '📋'}</Text>
            <Text style={styles.emptyText}>{query ? `No patients match "${q.trim()}"` : 'No patients yet.'}</Text>
          </View>
        ) : (
          filtered.map((s) => (
            <PatientCard key={s.patient.id} summary={s} onPress={() => router.push({ pathname: '/record', params: { id: s.patient.id } })} />
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, backgroundColor: Colors.white },
  search: { flex: 1, fontSize: 15, color: Colors.text, padding: 0 },
  empty: { alignItems: 'center', paddingVertical: 36 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center' },
});
