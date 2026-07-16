/**
 * Local record persistence via AsyncStorage (patient-anchored model).
 * Stores { patients, encounters }. (MVP: no encryption / no server sync —
 * see SMART-ARF.md scope note.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Encounter, Patient } from './types';

const KEY = 'smartarf_data_v1';
const PATIENT_CAP = 200;

interface LocalData {
  patients: Patient[];
  encounters: Encounter[];
}

const EMPTY: LocalData = { patients: [], encounters: [] };

export async function loadData(): Promise<LocalData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY };
    const patients = Array.isArray(parsed.patients) ? (parsed.patients as Patient[]) : [];
    const encounters = Array.isArray(parsed.encounters) ? (parsed.encounters as Encounter[]) : [];
    return { patients, encounters };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveData(data: LocalData): Promise<void> {
  // Cap patients at 200 (the HTML limit). Encounters belonging to dropped
  // patients are removed too (cascade), so storage stays consistent.
  let { patients, encounters } = data;
  if (patients.length > PATIENT_CAP) {
    const keep = new Set(patients.slice(0, PATIENT_CAP).map((p) => p.id));
    patients = patients.slice(0, PATIENT_CAP);
    encounters = encounters.filter((e) => keep.has(e.patientId));
  }
  await AsyncStorage.setItem(KEY, JSON.stringify({ patients, encounters }));
}

// ── Legacy key compatibility ──────────────────────────────────────────
// The previous schema used key `smartarf_records_v1` with a PatientRecord[].
// We deliberately do not migrate it (test data only) — a fresh v1 key means
// old local test records simply don't appear, which is the desired clean slate.
