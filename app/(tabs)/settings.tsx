/**
 * Settings — MVP scope. The full HTML app has clinic/API-key/sync-server/MFA
 * configuration; those require a backend and are out of scope for this build
 * (see SMART-ARF.md). This screen shows app info and local-data management.
 */
import React, { useState } from 'react';
import { Alert as RNAlert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, CardTitle, PrimaryButton, SecondaryButton, StepBadge } from '@/components/ui/primitives';
import { useRecords } from '@/state/RecordsContext';
import { useAuth } from '@/state/AuthContext';
import { isAdminAnywhere } from '@/lib/permissions';
import { Colors } from '@/constants/theme';

export default function SettingsScreen() {
  const { activePatients, patients, clinics, clearAll } = useRecords();
  const { user, activeClinicId, signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const doErase = async () => {
    setBusy(true);
    await clearAll();
    setBusy(false);
  };

  // Alert.alert() is a no-op on react-native-web, so use window.confirm there.
  // Native keeps the styled Alert dialog (Cancel / Erase All).
  const confirmClear = () => {
    if (Platform.OS === 'web') {
      if (
        window.confirm(
          'Erase all records?\n\nThis permanently removes all assessments from this device. This cannot be undone.',
        )
      ) {
        void doErase();
      }
      return;
    }
    RNAlert.alert(
      'Erase all records?',
      'This permanently removes all assessments from this device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase All', style: 'destructive', onPress: doErase },
      ],
    );
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      {user ? (
        <Card>
          <StepBadge>Account</StepBadge>
          <CardTitle>{user.profile.displayName || 'Signed in'}</CardTitle>
          {user.profile.platformAdmin ? <Text style={styles.badge}>★ platform admin</Text> : null}
          {user.memberships.length === 0 ? (
            <Text style={styles.line}>No clinic assigned yet — an admin can approve you into one.</Text>
          ) : (
            user.memberships.map((m) => {
              const clinicName = clinics.find((c) => c.id === m.clinicId)?.name ?? '—';
              const acting = m.clinicId === activeClinicId;
              return (
                <View key={m.clinicId} style={styles.memRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memClinic}>{clinicName}</Text>
                    <Text style={styles.memRole}>{m.role === 'admin' ? 'Admin' : 'Health Worker'}</Text>
                  </View>
                  {acting ? <Text style={styles.actingTag}>acting clinic</Text> : null}
                </View>
              );
            })
          )}
          <Text style={styles.note}>Memberships are managed by your clinic admins. Records stay attributed to the clinic where they were created.</Text>
          <View style={{ marginTop: 10 }}>
            <SecondaryButton title="Sign Out" onPress={signOut} />
          </View>
        </Card>
      ) : null}

      {user && isAdminAnywhere(user) ? (
        <Card>
          <StepBadge>Administration</StepBadge>
          <CardTitle>User Management</CardTitle>
          <Text style={styles.line}>Pre-approve emails and approve pending sign-ups.</Text>
          <View style={{ marginTop: 10 }}>
            <SecondaryButton title="Admin Console →" onPress={() => router.push('/admin')} />
          </View>
        </Card>
      ) : null}

      <Card>
        <StepBadge>About</StepBadge>
        <CardTitle>SMART-ARF</CardTitle>
        <Text style={styles.line}>Clinical Decision Support & Triage for Acute Rheumatic Fever</Text>
        <Text style={styles.line}>Version 6 (Expo build)</Text>
        <Text style={styles.note}>
          This build implements the full ARF assessment, scoring, records, lookup, follow-up, and
          BPG reference. Server sync, encryption-at-rest, PIN auth, and admin MFA from the source
          app are not included in this MVP.
        </Text>
      </Card>

      <Card>
        <StepBadge>Local Data</StepBadge>
        <CardTitle>Records on this device</CardTitle>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Active patients</Text>
          <Text style={styles.rowVal}>{activePatients.length}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Total (incl. removed)</Text>
          <Text style={styles.rowVal}>{patients.length}</Text>
        </View>
        <View style={{ marginTop: 10 }}>
          <PrimaryButton title={busy ? 'Erasing…' : 'Erase All Local Records'} color={Colors.danger} onPress={confirmClear} />
        </View>
      </Card>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: 13.5, color: Colors.textSecondary, marginBottom: 4, lineHeight: 19 },
  note: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 10, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  rowLabel: { fontSize: 14, color: Colors.text },
  rowVal: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  badge: { fontSize: 10.5, fontWeight: '800', color: '#b45309', backgroundColor: '#fef3c7', alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 8 },
  memRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  memClinic: { fontSize: 14, fontWeight: '700', color: Colors.text },
  memRole: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  actingTag: { fontSize: 10.5, fontWeight: '800', color: Colors.primary, backgroundColor: Colors.primaryLight, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
});
