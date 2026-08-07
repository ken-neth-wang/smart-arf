import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

/**
 * Inline "working" indicator shown while an AI operation is in flight:
 * spinner + a human-readable stage label + elapsed seconds, so a multi-second
 * wait reads as progress instead of a frozen UI. Mounted only while busy, so
 * the elapsed counter resets at the start of each run.
 */
export function AiProgress({ label }: { label: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={styles.row}>
      <ActivityIndicator size="small" color={Colors.primary} />
      <Text style={styles.text}>
        {label} ({secs}s)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  text: { color: Colors.textSecondary, fontSize: 13 },
});
