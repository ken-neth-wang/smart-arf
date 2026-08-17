/**
 * OfflineBanner — persistent connectivity indicator (cloud mode only).
 *
 * A thin warning bar shown whenever the browser reports no network, so a
 * health worker knows BEFORE starting that records can't be saved until the
 * connection returns. Web-only events (`online`/`offline` + navigator.onLine);
 * a native build would swap in NetInfo when one ships.
 *
 * Note: navigator.onLine can occasionally report a false "online" (e.g. router
 * up but backhaul down) — the save-first failure handling in RecordsContext
 * remains the source of truth for actual write failures; this banner is an
 * early-warning UX layer, not a guarantee.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/theme';

const USE_CLOUD = process.env.EXPO_PUBLIC_DATA_BACKEND === 'supabase';

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const update = () => setOnline(window.navigator.onLine);
    update(); // resolve initial state
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!USE_CLOUD || online) return null;

  return (
    <View style={styles.bar}>
      <Text style={styles.text}>Offline — new records can&apos;t be saved until the connection returns</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warning,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  text: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
