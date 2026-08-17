/**
 * Records — searchable list of patients. Each card reflects the patient's
 * latest initial assessment. Source of truth: smart-arf-app.html.
 */
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, TextInput, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardSubtitle, CardTitle, SecondaryButton, SelectField, StepBadge, type SelectOption } from '@/components/ui/primitives';
import { PatientCard } from '@/components/PatientCard';
import { useRecords } from '@/state/RecordsContext';
import { exportEncountersToCsv, EXPORT_LINK_EXPIRY_SECONDS } from '@/lib/exportCsv';
import { Colors } from '@/constants/theme';

export default function RecordsScreen() {
  const router = useRouter();
  const { patientSummaries, encounters, clinics } = useRecords();
  const [q, setQ] = useState('');
  const [selectedClinic, setSelectedClinic] = useState('');
  const [exporting, setExporting] = useState(false);

  const clinicOptions: SelectOption[] = [
    { label: 'All clinics', value: '' },
    ...clinics.map((c) => ({ label: c.name, value: c.id })),
  ];

  const query = q.trim().toLowerCase();
  const filtered = patientSummaries
    .filter((s) => !selectedClinic || s.patient.clinicId === selectedClinic)
    .filter((s) => {
      if (!query) return true;
      const hay = `${s.patient.firstName} ${s.patient.lastName} ${s.patient.mrn} ${s.patient.referralCode} ${s.latestInitial?.resultLabel ?? ''}`.toLowerCase();
      return hay.includes(query);
    });

  /** Export one row per encounter for the patients currently shown (clinic +
   *  search filters apply), with demographics + signed media links inlined. */
  const handleExport = async () => {
    if (filtered.length === 0 || exporting) return;
    setExporting(true);
    try {
      const result = await exportEncountersToCsv({
        patients: filtered.map((s) => s.patient),
        encounters,
        clinics,
      });
      Alert.alert(
        'Export ready',
        `${result.rowCount} encounter${result.rowCount === 1 ? '' : 's'} exported to ${result.fileName}.` +
          (result.mediaLinkCount > 0
            ? `\n${result.mediaLinkCount} photo/audio link${result.mediaLinkCount === 1 ? '' : 's'} included — valid for ${EXPORT_LINK_EXPIRY_SECONDS / 86400} days.`
            : ''),
      );
    } catch (err) {
      // RN-web often doesn't render Alert — always log so the browser console
      // shows the real failure.
      console.error('[records] export failed:', err);
      Alert.alert('Export failed', err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>Patient Records</StepBadge>
        <CardTitle>All Patients</CardTitle>
        <CardSubtitle>Search and review every patient saved on this device.</CardSubtitle>

        {clinics.length > 0 ? (
          <SelectField
            label="Filter by clinic"
            value={selectedClinic}
            options={clinicOptions}
            onChange={setSelectedClinic}
          />
        ) : null}

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

        <SecondaryButton
          title={exporting ? 'Exporting…' : 'Export Encounters (CSV)'}
          onPress={handleExport}
          disabled={exporting || filtered.length === 0}
        />

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
