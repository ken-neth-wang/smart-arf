/**
 * Records — clinic-at-a-time patient list + global search.
 *
 * Model (docs/user-clinic-management-plan.md §4.1/§4.5):
 *   - List: the ACTING clinic's patients + referrals INTO it. No aggregate
 *     "all clinics" view — the header picker is the only clinic control.
 *   - Search: ALWAYS spans all clinics the user can see (RLS-bounded — it's a
 *     directory, not a reader). Results at another clinic offer switch-and-open.
 *   - Export covers whatever is currently shown (search results when searching).
 */
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardSubtitle, CardTitle, SecondaryButton, StepBadge } from '@/components/ui/primitives';
import { Colors } from '@/constants/theme';
import type { PatientSummary } from '@/lib/types';
import { PatientCard } from '@/components/PatientCard';
import { useAuth } from '@/state/AuthContext';
import { useAssessment } from '@/state/AssessmentContext';
import { ALL_CLINICS } from '@/state/actingClinic';
import { useRecords } from '@/state/RecordsContext';
import { exportEncountersToCsv, EXPORT_LINK_EXPIRY_SECONDS } from '@/lib/exportCsv';
import { describeSaveError } from '@/lib/errors';

export default function RecordsScreen() {
  const router = useRouter();
  const { patientSummaries, encounters, clinics } = useRecords();
  const { activeClinicId, setActiveClinic } = useAuth();
  const { hasDraft } = useAssessment();
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);

  const activeClinicName = clinics.find((c) => c.id === activeClinicId)?.name;

  /** Patients visible in the acting clinic's slice: its own + referred into it. */
  const actingScope = useMemo(() => {
    const scope = new Set<string>();
    for (const s of patientSummaries) {
      if (s.patient.clinicId === activeClinicId) scope.add(s.patient.id);
    }
    for (const e of encounters) {
      if (e.referredToClinicId && e.referredToClinicId === activeClinicId) scope.add(e.patientId);
    }
    return scope;
  }, [patientSummaries, encounters, activeClinicId]);

  const query = q.trim().toLowerCase();
  const searching = query.length > 0;

  const matchesQuery = (s: PatientSummary) => {
    const hay = `${s.patient.firstName} ${s.patient.lastName} ${s.patient.mrn} ${s.patient.referralCode} ${s.latestInitial?.resultLabel ?? ''}`.toLowerCase();
    return hay.includes(query);
  };

  const viewingAll = activeClinicId === ALL_CLINICS;
  const shown = searching
    ? patientSummaries.filter(matchesQuery) // global directory (RLS-bounded)
    : viewingAll
      ? patientSummaries // every clinic you can see (RLS-bounded)
      : patientSummaries.filter((s) => actingScope.has(s.patient.id));

  /** Open a patient; foreign-clinic hits confirm-switch the acting clinic first. */
  const openPatient = (s: PatientSummary) => {
    const go = () => router.push({ pathname: '/record', params: { id: s.patient.id } });
    if (viewingAll || actingScope.has(s.patient.id) || !s.patient.clinicId || hasDraft) {
      // Viewing is safe in any scope; mid-draft we never switch clinics
      // (the draft's clinic is locked) — just open the record.
      go();
      return;
    }
    const clinicName = clinics.find((c) => c.id === s.patient.clinicId)?.name ?? 'another clinic';
    Alert.alert(
      'Switch clinic?',
      `This patient is at ${clinicName}. Switch your acting clinic there to open their record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Switch to ${clinicName}`, onPress: () => { setActiveClinic(s.patient.clinicId ?? null); go(); } },
      ],
    );
  };

  /** Export one row per encounter for the patients currently shown, with
   *  demographics + signed media links inlined. */
  const handleExport = async () => {
    if (shown.length === 0 || exporting) return;
    setExporting(true);
    try {
      const result = await exportEncountersToCsv({
        patients: shown.map((s) => s.patient),
        encounters,
        clinics,
      });
      Alert.alert(
        'Export ready',
        `${result.rowCount} encounter${result.rowCount === 1 ? '' : 's'} from ${shown.length} patient${shown.length === 1 ? '' : 's'} exported to ${result.fileName} (each visit is a row — initial + follow-ups).` +
          (result.mediaLinkCount > 0
            ? `\n${result.mediaLinkCount} photo/audio link${result.mediaLinkCount === 1 ? '' : 's'} included — valid for ${EXPORT_LINK_EXPIRY_SECONDS / 86400} days.`
            : ''),
      );
    } catch (err) {
      // RN-web often doesn't render Alert — always log so the browser console
      // shows the real failure.
      console.error('[records] export failed:', err);
      Alert.alert('Export failed', describeSaveError(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>Patient Records</StepBadge>
        <CardTitle>{searching ? 'Search — all your clinics' : activeClinicName ?? 'Patients'}</CardTitle>
        {!searching ? (
          <CardSubtitle>
            {viewingAll
              ? 'Every patient you can see, across all your clinics plus referrals in.'
              : `Showing ${activeClinicName ? `${activeClinicName}'s` : 'your'} patients plus referrals into it.`}{' '}
            Switch clinics in the header.
          </CardSubtitle>
        ) : (
          <CardSubtitle>Search spans every clinic you can see — switch to open a patient at another clinic.</CardSubtitle>
        )}



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
          disabled={exporting || shown.length === 0}
        />

        {shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{searching ? '🔍' : '📋'}</Text>
            <Text style={styles.emptyText}>
              {searching ? `No patients match "${q.trim()}"` : viewingAll ? 'No patients at any of your clinics yet.' : 'No patients at this clinic yet.'}
            </Text>
          </View>
        ) : (
          shown.map((s) => {
            const foreign = searching && !actingScope.has(s.patient.id) && !!s.patient.clinicId;
            const clinicName = clinics.find((c) => c.id === s.patient.clinicId)?.name ?? '—';
            return (
              <View key={s.patient.id}>
                {foreign ? (
                  <Text style={styles.foreignTag}>
                    {clinicName} · tap to switch ›
                  </Text>
                ) : null}
                <PatientCard summary={s} onPress={() => openPatient(s)} />
              </View>
            );
          })
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
  foreignTag: { fontSize: 11, color: Colors.primary, fontWeight: '700', marginTop: 10, marginBottom: -4 },
});
