/**
 * actingClinic — persisted "the clinic I'm working at" selection.
 *
 * The whole app is clinic-at-a-time (docs/user-clinic-management-plan.md §4):
 * one header picker sets the acting clinic; it drives the records scope and the
 * ONE attribution decision (the clinic of a new visit). Visibility itself stays
 * membership-based (RLS) — the picker narrows the default view, never the
 * security boundary.
 *
 * Storage: localStorage on web, AsyncStorage on native. Failures are
 * non-fatal — the picker falls back to the first membership.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Sentinel acting-clinic value: "view all my clinics" (records/home lists).
 *  Viewing only — attribution (new visits) and the admin console always
 *  resolve to a REAL clinic; the app falls back to the first membership. */
export const ALL_CLINICS = '__all__';

const KEY = 'smartarf_activeClinicId';
const store = Platform.OS === 'web' ? undefined : AsyncStorage;

export async function loadActiveClinicId(): Promise<string | null> {
  try {
    if (store) return await store.getItem(KEY);
    if (typeof localStorage !== 'undefined') return localStorage.getItem(KEY);
  } catch {
    /* non-fatal */
  }
  return null;
}

export async function saveActiveClinicId(clinicId: string | null): Promise<void> {
  try {
    if (store) {
      if (clinicId) await store.setItem(KEY, clinicId);
      else await store.removeItem(KEY);
      return;
    }
    if (typeof localStorage !== 'undefined') {
      if (clinicId) localStorage.setItem(KEY, clinicId);
      else localStorage.removeItem(KEY);
    }
  } catch {
    /* non-fatal */
  }
}

