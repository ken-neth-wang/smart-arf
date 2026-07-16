/**
 * Settings — MVP scope. The full HTML app has clinic/API-key/sync-server/MFA
 * configuration; those require a backend and are out of scope for this build
 * (see SMART-ARF.md). This screen shows app info and local-data management.
 */
import React, { useState } from 'react';
import { Alert as RNAlert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, CardTitle, PrimaryButton, StepBadge } from '@/components/ui/primitives';
import { useRecords } from '@/state/RecordsContext';
import { Colors } from '@/constants/theme';

export default function SettingsScreen() {
  const { activePatients, patients, clearAll } = useRecords();
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
});
