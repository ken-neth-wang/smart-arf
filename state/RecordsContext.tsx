/**
 * RecordsContext — loads/saves Patient + Encounter[] (patient-anchored model)
 * and exposes CRUD helpers used across the app. Mirrors the persistence model
 * in lib/storage.ts (local) / lib/sync.ts (cloud), swappable via env var.
 *
 * Implementation note: state is mirrored into refs (patientsRef / encountersRef)
 * so that sequential async mutations within one flow (e.g. commit patient THEN
 * commit encounter) always build on the latest snapshot. Without the refs, a
 * stale closure would overwrite the just-added patient with the pre-call array.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Clinic, Encounter, Patient, PatientSummary, PatientWithHistory } from '@/lib/types';
import { loadData, saveData } from '@/lib/storage';
import { loadDataCloud, loadClinicsCloud, saveEncounterCloud, savePatientCloud } from '@/lib/sync';
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
  addFollowup: (patientId: string, fields: import('@/lib/types').FollowUpFields) => Promise<void>;
  softDelete: (patientId: string, reason: Patient['deleteReason'], notes?: string) => Promise<void>;
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
      // MRN dedup at the data layer (UI lookup deferred — docs/data-model.md #8).
      const existing = prev.find((p) => p.mrn === patient.mrn && !p.inactive);
      if (existing) {
        resolved = { ...existing, ...patient, id: existing.id, referralCode: existing.referralCode, createdAt: existing.createdAt };
        next = prev.map((p) => (p.id === resolved.id ? resolved : p));
      } else {
        next = [patient, ...prev];
      }
    } else {
      next = [patient, ...prev];
    }
    syncRefs(next, encountersRef.current);
    setPatients(next);
    if (USE_CLOUD) {
      try {
        await savePatientCloud(resolved);
      } catch (err) {
        console.error('[records] cloud patient save failed:', err);
      }
    } else {
      await persistLocal(next, encountersRef.current);
    }
    return { ...resolved };
  }, [persistLocal, syncRefs]);

  const upsertEncounter = useCallback(async (encounter: Encounter) => {
    const prev = encountersRef.current;
    const idx = prev.findIndex((e) => e.id === encounter.id);
    const next = idx >= 0 ? prev.map((e) => (e.id === encounter.id ? { ...e, ...encounter } : e)) : [encounter, ...prev];
    syncRefs(patientsRef.current, next);
    setEncounters(next);
    if (USE_CLOUD) {
      try {
        await saveEncounterCloud(encounter);
      } catch (err) {
        console.error('[records] cloud encounter save failed:', err);
      }
    } else {
      await persistLocal(patientsRef.current, next);
    }
  }, [persistLocal, syncRefs]);

  const addFollowup = useCallback(
    async (patientId: string, fields: import('@/lib/types').FollowUpFields) => {
      const now = new Date().toISOString();
      const encounter: Encounter = {
        id: 'enc-' + Date.now(),
        patientId,
        type: 'followup',
        date: fields.visitDate,
        inputs: null, score: null, level: null, resultLabel: null, range: null, breakdown: null, actions: null,
        includesLevelB: false,
        facilityType: null,
        confirmedDx: fields.confirmedDx,
        finalDx: fields.finalDx,
        bpgStatus: fields.bpgStatus,
        echoFindings: fields.echoFindings,
        complications: fields.complications,
        notes: fields.notes,
        referredTo: '',
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
      const next = prev.map((p) =>
        p.id === patientId
          ? { ...p, inactive: true, deletedAt: ts, deletedBy: 'local', deleteReason: reason, deleteNotes: notes, updatedAt: ts }
          : p,
      );
      syncRefs(next, encountersRef.current);
      setPatients(next);
      if (USE_CLOUD) {
        const target = next.find((p) => p.id === patientId);
        if (target) {
          try { await savePatientCloud(target); } catch (err) { console.error('[records] cloud soft-delete failed:', err); }
        }
      } else {
        await persistLocal(next, encountersRef.current);
      }
    },
    [persistLocal, syncRefs],
  );

  const setReferral = useCallback(
    async (encounterId: string, referredTo: string, referredToClinicId: string | null) => {
      const prev = encountersRef.current;
      const ts = new Date().toISOString();
      const next = prev.map((e) => (e.id === encounterId ? { ...e, referredTo, referredToClinicId, updatedAt: ts } : e));
      syncRefs(patientsRef.current, next);
      setEncounters(next);
      if (USE_CLOUD) {
        const target = next.find((e) => e.id === encounterId);
        if (target) {
          try { await saveEncounterCloud(target); } catch (err) { console.error('[records] cloud referral save failed:', err); }
        }
      } else {
        await persistLocal(patientsRef.current, next);
      }
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
    return activePatients.map((patient) => {
      const encs = encounters.filter((e) => e.patientId === patient.id);
      const initials = encs.filter((e) => e.type === 'initial');
      const followups = encs.filter((e) => e.type === 'followup');
      const latestInitial = initials.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return { patient, latestInitial, encounterCount: encs.length, followupCount: followups.length };
    });
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
      encounters.filter((e) => e.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
    upsertPatient, upsertEncounter, addFollowup, softDelete, setReferral, clearAll,
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
