/**
 * Local record persistence via AsyncStorage.
 * (MVP: no encryption / no server sync — see SMART-ARF.md scope note.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PatientRecord } from './types';

const KEY = 'smartarf_records_v1';

export async function loadRecords(): Promise<PatientRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PatientRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveRecords(records: PatientRecord[]): Promise<void> {
  // Mirror the HTML cap of 200 records.
  const capped = records.length > 200 ? records.slice(0, 200) : records;
  await AsyncStorage.setItem(KEY, JSON.stringify(capped));
}
