/**
 * Records — mirrors `#recordsScreen` in smart-arf-app.html: searchable list of
 * all assessments on this device. Source of truth: smart-arf-app.html.
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
  const { activeRecords } = useRecords();
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  // Mirrors HTML renderRecordsList (L2158): hay = firstName, lastName, mrn,
  // patientCode, resultLabel.
  const filtered = query
    ? activeRecords.filter((r) => {
        const hay = `${r.firstName} ${r.lastName} ${r.mrn} ${r.patientCode} ${r.resultLabel}`.toLowerCase();
        return hay.includes(query);
      })
    : activeRecords;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>Patient Records</StepBadge>
        <CardTitle>All Assessments</CardTitle>
        <CardSubtitle>Search and review every assessment saved on this device.</CardSubtitle>

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
            <Text style={styles.emptyText}>{query ? `No records match "${q.trim()}"` : 'No records yet.'}</Text>
          </View>
        ) : (
          filtered.map((r) => (
            <PatientCard key={r.id} record={r} onPress={() => router.push({ pathname: '/record', params: { id: r.id } })} />
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
