/**
 * RecordsContext — loads/saves Patient + Encounter[] (patient-anchored model)
 * and exposes CRUD helpers used across the app. Mirrors the persistence model
 * in lib/storage.ts (local) / lib/sync.ts (cloud), swappable via env var.
 *
 * Implementation note: state is mirrored into refs (patientsRef / encountersRef)
 * so that sequential async mutations within one flow (e.g. commit patient THEN
 * commit encounter) always build on the latest snapshot. Without the refs, a
 * stale closure would overwrite the just-added patient with the pre-call array.
 *
 * Save semantics (cloud): every write is SAVE-FIRST — local state is updated
 * only after the server accepts the row, and a failed save is surfaced to the
 * user (Alert) and rethrown so callers (wizard steps, forms) stop instead of
 * showing a record that exists nowhere.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { Clinic, Encounter, FollowUpFields, Patient, PatientSummary, PatientWithHistory } from '@/lib/types';
import { loadData, saveData } from '@/lib/storage';
import { loadDataCloud, loadClinicsCloud, saveEncounterCloud, savePatientCloud } from '@/lib/sync';
import { describeSaveError } from '@/lib/errors';
import { useAuth } from '@/state/AuthContext';

/** 'local' (AsyncStorage, default) or 'supabase' (cloud, QA opt-in). */
const DATA_BACKEND = (process.env.EXPO_PUBLIC_DATA_BACKEND ?? 'local') as 'local' | 'supabase';
const USE_CLOUD = DATA_BACKEND === 'supabase';

interface RecordsContextValue {
  patients: Patient[];
  encounters: Encounter[];
  clinics: Clinic[];
  loading: boolean;
  refresh: () => Promise<void>;
  upsertPatient: (patient: Patient) => Promise<Patient>;
  upsertEncounter: (encounter: Encounter) => Promise<void>;
  addFollowup: (patientId: string, fields: FollowUpFields) => Promise<void>;
  softDelete: (patientId: string, reason: Patient['deleteReason'], notes?: string) => Promise<void>;
  softDeleteEncounter: (encounterId: string, reason: Encounter['deleteReason'], notes?: string) => Promise<void>;
  restoreEncounter: (encounterId: string) => Promise<void>;
  setReferral: (encounterId: string, referredTo: string, referredToClinicId: string | null) => Promise<void>;
  clearAll: () => Promise<void>;
  activePatients: Patient[];
  patientSummaries: PatientSummary[];
  getPatientById: (id: string) => Patient | undefined;
  getPatientByMRN: (mrn: string) => Patient | undefined;
  getPatientByCode: (code: string) => Patient | undefined;
  getPatientWithHistory: (id: string) => PatientWithHistory | undefined;
  getEncountersForPatient: (patientId: string) => Encounter[];
}

/** Surface a failed cloud write to the user, then rethrow so callers stop
 *  (the wizard must not advance, the record must not look saved).
 *  Module-level: uses no component state, keeps useCallback deps stable. */
function failSave(what: string, err: unknown): never {
  console.error(`[records] cloud ${what.toLowerCase()} save failed:`, err);
  const detail = describeSaveError(err);
  const msg = `${detail}\n\nNothing was recorded. Your entries are still on this screen — reconnect or sign in again, then press Save once more.`;
  // react-native-web's Alert is a NO-OP (empty stub) — on web we must use
  // window.alert; the react-native Alert is the fallback for native builds.
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`${what} NOT saved\n\n${msg}`);
  } else {
    Alert.alert(`${what} NOT saved`, msg);
  }
  throw err;
}

const RecordsContext = createContext<RecordsContextValue | null>(null);

export function RecordsProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth identity — the load effect keys off this so records re-fetch once the
  // session resolves. null in local mode (no auth).
  const { user } = useAuth();
  const authId = user?.profile.id ?? null;

  // Mirror state into refs so sequential async mutations see the latest snapshot.
  const patientsRef = useRef<Patient[]>([]);
  const encountersRef = useRef<Encounter[]>([]);

  const syncRefs = useCallback((p: Patient[], e: Encounter[]) => {
    patientsRef.current = p;
    encountersRef.current = e;
  }, []);

  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);
  useEffect(() => {
    encountersRef.current = encounters;
  }, [encounters]);

  const refresh = useCallback(async () => {
    try {
      const [data, clinicList] = await Promise.all([
        USE_CLOUD ? loadDataCloud() : loadData(),
        USE_CLOUD ? loadClinicsCloud() : Promise.resolve([]),
      ]);
      syncRefs(data.patients, data.encounters);
      setPatients(data.patients);
      setEncounters(data.encounters);
      setClinics(clinicList);
    } catch (err) {
      console.error('[records] load failed, falling back to empty:', err);
      syncRefs([], []);
      setPatients([]);
      setEncounters([]);
      setClinics([]);
    }
  }, [syncRefs]);

  // Load on mount (local) or when the auth identity is established/changes.
  // Race fix: in cloud mode the provider can mount before the session resolves
  // (fresh login), so the first load sees no auth → RLS returns nothing. This
  // re-runs once `authId` is known, so clinics/patients populate correctly.
  useEffect(() => {
    if (USE_CLOUD && !authId) {
      setLoading(false); // logged out / pre-auth → nothing to load yet
      return;
    }
    let active = true;
    (async () => {
      await refresh();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [authId, refresh]);

  /** Persist the full snapshot to LOCAL storage (cloud uses targeted saves). */
  const persistLocal = useCallback(async (p: Patient[], e: Encounter[]) => {
    await saveData({ patients: p, encounters: e });
  }, []);

  const upsertPatient = useCallback(async (patient: Patient): Promise<Patient> => {
    const prev = patientsRef.current;
    let resolved = patient;
    let next: Patient[];
    const idx = prev.findIndex((p) => p.id === patient.id);
    if (idx >= 0) {
      resolved = { ...prev[idx], ...patient, referralCode: prev[idx].referralCode, createdAt: prev[idx].createdAt };
      next = prev.map((p) => (p.id === resolved.id ? resolved : p));
    } else if (patient.mrn) {
      // MRN dedup is PER-CLINIC: only reuse an existing patient if the MRN
      // matches AND it's the same clinic. Cross-clinic link via referralCode.
      const existing = prev.find(
        (p) => p.mrn === patient.mrn && (p.clinicId ?? null) === (patient.clinicId ?? null) && !p.inactive,
      );
      if (existing) {
        resolved = { ...existing, ...patient, id: existing.id, referralCode: existing.referralCode, createdAt: existing.createdAt };
        next = prev.map((p) => (p.id === resolved.id ? resolved : p));
      } else {
        next = [patient, ...prev];
      }
    } else {
      next = [patient, ...prev];
    }
    if (USE_CLOUD) {
      try {
        await savePatientCloud(resolved);
      } catch (err) {
        failSave('Patient', err);
      }
    }
    // Local state is updated ONLY after the write succeeds — a failed save
    // must never leave a record that looks saved but exists nowhere.
    syncRefs(next, encountersRef.current);
    setPatients(next);
    if (!USE_CLOUD) await persistLocal(next, encountersRef.current);
    return { ...resolved };
  }, [persistLocal, syncRefs]);

  const upsertEncounter = useCallback(async (encounter: Encounter) => {
    // Stamp the responsible-clinician sign-off the first time a name is given
    // (audit: the acting account + timestamp). The name can change later; the
    // original signedAt is preserved on re-commit (set in AssessmentContext.commit).
    let toSave = encounter;
    if (encounter.signedBy && encounter.signedBy.trim() && !encounter.signedAt) {
      toSave = { ...encounter, signedByUserId: authId, signedAt: new Date().toISOString() };
    }
    const prev = encountersRef.current;
    const idx = prev.findIndex((e) => e.id === toSave.id);
    const next = idx >= 0 ? prev.map((e) => (e.id === toSave.id ? { ...e, ...toSave } : e)) : [toSave, ...prev];
    if (USE_CLOUD) {
      try {
        await saveEncounterCloud(toSave);
      } catch (err) {
        failSave('Visit', err);
      }
    }
    // Local state is updated ONLY after the write succeeds (see upsertPatient).
    syncRefs(patientsRef.current, next);
    setEncounters(next);
    if (!USE_CLOUD) await persistLocal(patientsRef.current, next);
  }, [persistLocal, syncRefs, authId]);

  const addFollowup = useCallback(
    async (patientId: string, fields: FollowUpFields) => {
      const now = new Date().toISOString();
      const encounter: Encounter = {
        id: 'enc-' + Date.now(),
        patientId,
        type: 'followup',
        date: fields.visitDate,
        inputs: null, score: null, level: null, resultLabel: null, range: null, breakdown: null, actions: null,
        includesLevelB: false,
        facilityType: null,
        inactive: false,
        confirmedDx: fields.confirmedDx,
        finalDx: fields.finalDx,
        bpgStatus: fields.bpgStatus,
        echoFindings: fields.echoFindings,
        complications: fields.complications,
        notes: fields.notes,
        referredTo: '',
        signedBy: fields.signedBy?.trim() ?? '',
        createdAt: now,
        updatedAt: now,
      };
      await upsertEncounter(encounter);
    },
    [upsertEncounter],
  );

  const softDelete = useCallback(
    async (patientId: string, reason: Patient['deleteReason'], notes?: string) => {
      const ts = new Date().toISOString();
      const prev = patientsRef.current;
      const target = prev.find((p) => p.id === patientId);
      if (!target) return;
      const updated: Patient = { ...target, inactive: true, deletedAt: ts, deletedBy: 'local', deleteReason: reason, deleteNotes: notes, updatedAt: ts };
      if (USE_CLOUD) {
        try {
          await savePatientCloud(updated);
        } catch (err) {
          console.error('[records] cloud soft-delete failed:', err);
          if (typeof window !== 'undefined') window.alert('Could not remove patient (not saved to cloud): ' + (describeSaveError(err)));
          return; // don't hide locally if it didn't persist
        }
      }
      const next = prev.map((p) => (p.id === patientId ? updated : p));
      syncRefs(next, encountersRef.current);
      setPatients(next);
      if (!USE_CLOUD) await persistLocal(next, encountersRef.current);
    },
    [persistLocal, syncRefs],
  );

  const softDeleteEncounter = useCallback(
    async (encounterId: string, reason: Encounter['deleteReason'], notes?: string) => {
      const ts = new Date().toISOString();
      const prev = encountersRef.current;
      const target = prev.find((e) => e.id === encounterId);
      if (!target) return;
      const updated: Encounter = { ...target, inactive: true, deletedAt: ts, deletedBy: 'local', deleteReason: reason, deleteNotes: notes, updatedAt: ts };
      if (USE_CLOUD) {
        try {
          await saveEncounterCloud(updated);
        } catch (err) {
          console.error('[records] cloud encounter soft-delete failed:', err);
          if (typeof window !== 'undefined') window.alert('Could not remove visit (not saved to cloud): ' + (describeSaveError(err)));
          return;
        }
      }
      const next = prev.map((e) => (e.id === encounterId ? updated : e));
      syncRefs(patientsRef.current, next);
      setEncounters(next);
      if (!USE_CLOUD) await persistLocal(patientsRef.current, next);
    },
    [persistLocal, syncRefs],
  );

  // Restore a soft-deleted visit: flip inactive back to false + clear the audit
  // fields. Mirrors softDeleteEncounter (save-first, then update local state).
  const restoreEncounter = useCallback(
    async (encounterId: string) => {
      const ts = new Date().toISOString();
      const prev = encountersRef.current;
      const target = prev.find((e) => e.id === encounterId);
      if (!target) return;
      const updated: Encounter = {
        ...target,
        inactive: false,
        deletedAt: undefined,
        deletedBy: undefined,
        deleteReason: undefined,
        deleteNotes: undefined,
        updatedAt: ts,
      };
      if (USE_CLOUD) {
        try {
          await saveEncounterCloud(updated);
        } catch (err) {
          console.error('[records] cloud encounter restore failed:', err);
          if (typeof window !== 'undefined') window.alert('Could not restore visit (not saved to cloud): ' + (describeSaveError(err)));
          return;
        }
      }
      const next = prev.map((e) => (e.id === encounterId ? updated : e));
      syncRefs(patientsRef.current, next);
      setEncounters(next);
      if (!USE_CLOUD) await persistLocal(patientsRef.current, next);
    },
    [persistLocal, syncRefs],
  );

  const setReferral = useCallback(
    async (encounterId: string, referredTo: string, referredToClinicId: string | null) => {
      const prev = encountersRef.current;
      const target = prev.find((e) => e.id === encounterId);
      if (!target) return;
      const ts = new Date().toISOString();
      const updated: Encounter = { ...target, referredTo, referredToClinicId, updatedAt: ts };
      const next = prev.map((e) => (e.id === encounterId ? updated : e));
      if (USE_CLOUD) {
        try {
          await saveEncounterCloud(updated);
        } catch (err) {
          failSave('Referral', err);
        }
      } else {
        await persistLocal(patientsRef.current, next);
      }
      syncRefs(patientsRef.current, next);
      setEncounters(next);
    },
    [persistLocal, syncRefs],
  );

  const clearAll = useCallback(async () => {
    syncRefs([], []);
    setPatients([]);
    setEncounters([]);
    if (!USE_CLOUD) await saveData({ patients: [], encounters: [] });
    // Cloud clear is intentionally a no-op here (records persist server-side);
    // use softDelete per-patient or the Supabase SQL Editor to wipe.
  }, [syncRefs]);

  const activePatients = useMemo(() => patients.filter((p) => !p.inactive), [patients]);

  const patientSummaries = useMemo<PatientSummary[]>(() => {
    return activePatients
      .map((patient) => {
        const encs = encounters.filter((e) => e.patientId === patient.id && !e.inactive);
        const initials = encs.filter((e) => e.type === 'initial');
        const followups = encs.filter((e) => e.type === 'followup');
        const latestInitial = initials.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return { patient, latestInitial, encounterCount: encs.length, followupCount: followups.length };
      })
      .filter((s) => s.encounterCount > 0);
  }, [activePatients, encounters]);

  const getPatientById = useCallback((id: string) => patients.find((p) => p.id === id), [patients]);
  const getPatientByMRN = useCallback(
    (mrn: string) => (mrn ? patients.find((p) => p.mrn === mrn && !p.inactive) : undefined),
    [patients],
  );
  const getPatientByCode = useCallback(
    (code: string) => patients.find((p) => p.referralCode.toUpperCase() === code.toUpperCase()),
    [patients],
  );
  const getEncountersForPatient = useCallback(
    (patientId: string) =>
      encounters.filter((e) => e.patientId === patientId && !e.inactive).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [encounters],
  );
  const getPatientWithHistory = useCallback(
    (id: string): PatientWithHistory | undefined => {
      const patient = patients.find((p) => p.id === id);
      if (!patient) return undefined;
      return { patient, encounters: getEncountersForPatient(id) };
    },
    [patients, getEncountersForPatient],
  );

  const value: RecordsContextValue = {
    patients, encounters, clinics, loading, refresh,
    upsertPatient, upsertEncounter, addFollowup, softDelete, softDeleteEncounter, restoreEncounter, setReferral, clearAll,
    activePatients, patientSummaries,
    getPatientById, getPatientByMRN, getPatientByCode, getPatientWithHistory, getEncountersForPatient,
  };

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords(): RecordsContextValue {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error('useRecords must be used within RecordsProvider');
  return ctx;
}
