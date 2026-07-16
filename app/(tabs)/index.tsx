/**
 * Home / Landing — mirrors `#landingPage` in smart-arf-app.html.
 * (Sync bar, server lookup, and settings modal are out of MVP scope; settings
 * lives in its own tab. See SMART-ARF.md.)
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useRecords } from '@/state/RecordsContext';
import { useAssessment } from '@/state/AssessmentContext';
import { PatientCard } from '@/components/PatientCard';

export default function HomeScreen() {
  const router = useRouter();
  const { patientSummaries } = useRecords();
  const { reset } = useAssessment();
  const top = useSafeAreaInsets().top;

  const newAssessment = () => {
    reset();
    router.navigate('/(tabs)/assess');
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[styles.header, { paddingTop: top + 30 }]}>
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable onPress={() => router.navigate('/(tabs)/settings')} style={styles.gearBtn}>
            <Ionicons name="settings" size={16} color="#fff" />
            <Text style={styles.gearText}>Settings</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>SMART-ARF</Text>
        <Text style={styles.tagline}>Clinical Decision Support & Triage for Acute Rheumatic Fever</Text>
        <Text style={styles.version}>Version 6 · For frontline healthcare workers</Text>
      </View>

      <View style={styles.container}>
        <Pressable style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.92 }]} onPress={newAssessment}>
          <Text style={styles.plus}>＋</Text>
          <Text style={styles.newBtnText}>New Patient Assessment</Text>
        </Pressable>

        <Pressable style={styles.lookupBtn} onPress={() => router.navigate('/(tabs)/records')}>
          <Ionicons name="search" size={16} color={Colors.textSecondary} />
          <Text style={styles.lookupText}>Search Records</Text>
        </Pressable>

        <Text style={styles.heading}>Recent Assessments</Text>

        {patientSummaries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No assessments yet. Tap “New Patient Assessment” to begin.</Text>
          </View>
        ) : (
          patientSummaries.map((s) => (
            <PatientCard key={s.patient.id} summary={s} onPress={() => router.push({ pathname: '/record', params: { id: s.patient.id } })} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 28 },
  gearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  gearText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  title: { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  tagline: { color: 'rgba(255,255,255,0.82)', fontSize: 13.5, textAlign: 'center', marginTop: 6 },
  version: { color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'center', marginTop: 6 },
  container: { maxWidth: 560, width: '100%', alignSelf: 'center', padding: 14, paddingTop: 16 },
  newBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 12, backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  plus: { color: '#fff', fontSize: 22, fontWeight: '900' },
  newBtnText: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  lookupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: 15, borderRadius: 11, backgroundColor: Colors.grayLight, borderWidth: 1.5, borderColor: Colors.border },
  lookupText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '700' },
  heading: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: Colors.textSecondary, marginVertical: 16, paddingHorizontal: 2 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 44, marginBottom: 10 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
