/**
 * Patient Lookup — mirrors `#lookupScreen` in smart-arf-app.html. MVP searches
 * the local device (server lookup requires the backend, out of scope).
 * Source of truth: smart-arf-app.html.
 */
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Alert, Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, StepBadge, TextField } from '@/components/ui/primitives';
import { useRecords } from '@/state/RecordsContext';
import { normalizeCode } from '@/lib/format';
import { Colors } from '@/constants/theme';

export default function LookupScreen() {
  const router = useRouter();
  const { getByCode } = useRecords();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    const norm = normalizeCode(code);
    if (!norm) return setErr('Enter a referral code.');
    const record = getByCode(norm);
    if (!record) {
      return setErr('No patient found with that code on this device. (Server lookup is not available in this build.)');
    }
    setErr('');
    router.push({ pathname: '/record', params: { id: record.id, fromLookup: '1' } });
  };

  return (
    <Card style={styles.wrap}>
      <StepBadge>Patient Lookup</StepBadge>
      <CardTitle>Find Patient by Code</CardTitle>
      <CardSubtitle>Enter the referral code (e.g. ARF-XXXX-XXXX) to view the assessment and add follow-up.</CardSubtitle>

      <TextField
        label="Referral Code"
        value={code}
        onChangeText={setCode}
        placeholder="ARF-XXXX-XXXX"
        style={styles.codeInput}
        autoCapitalize="characters"
      />

      {err ? <Alert variant="warning">{err}</Alert> : null}

      <PrimaryButton title="Look Up Patient" onPress={submit} />
      <SecondaryButton title="Cancel" onPress={() => router.back()} />

      <Text style={styles.disclaimer}>Local lookup only in this build. The source app also queries the sync server when online.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: 560, width: '100%', alignSelf: 'center', marginTop: 14 },
  codeInput: { fontFamily: 'Courier', fontSize: 19, letterSpacing: 2, textAlign: 'center', textTransform: 'uppercase' },
  disclaimer: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 17, marginTop: 10 },
});
