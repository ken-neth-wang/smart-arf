/**
 * RecordsContext — loads/saves PatientRecord[] to AsyncStorage and exposes
 * CRUD helpers used across the app. Mirrors the localStorage history operations
 * in smart-arf-app.html (loadHistory / saveHistory / saveRecord / softDeleteLocal).
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { FollowUp, PatientRecord } from '@/lib/types';
import { loadRecords, saveRecords } from '@/lib/storage';

interface RecordsContextValue {
  records: PatientRecord[];
  loading: boolean;
  refresh: () => Promise<void>;
  upsert: (record: PatientRecord) => Promise<void>;
  softDelete: (id: string, reason: PatientRecord['deletedReason'], notes?: string) => Promise<void>;
  addFollowup: (patientCode: string, followup: FollowUp) => Promise<void>;
  setReferral: (id: string, referredTo: string) => Promise<void>;
  clearAll: () => Promise<void>;
  /** Active (non-inactive) records, newest first — for lists. */
  activeRecords: PatientRecord[];
  getById: (id: string) => PatientRecord | undefined;
  getByCode: (code: string) => PatientRecord | undefined;
}

const RecordsContext = createContext<RecordsContextValue | null>(null);

export function RecordsProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await loadRecords();
    setRecords(list);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const persist = useCallback(async (next: PatientRecord[]) => {
    setRecords(next);
    await saveRecords(next);
  }, []);

  const upsert = useCallback(
    async (record: PatientRecord) => {
      const next = [...records];
      const idx = next.findIndex((r) => r.id === record.id);
      if (idx >= 0) next[idx] = record;
      else next.unshift(record);
      await persist(next);
    },
    [records, persist],
  );

  const softDelete = useCallback(
    async (id: string, reason: PatientRecord['deletedReason'], notes?: string) => {
      const next = records.map((r) =>
        r.id === id
          ? { ...r, inactive: true, deletedReason: reason, deletedNotes: notes, deletedAt: new Date().toISOString() }
          : r,
      );
      await persist(next);
    },
    [records, persist],
  );

  const addFollowup = useCallback(
    async (patientCode: string, followup: FollowUp) => {
      const next = records.map((r) =>
        r.patientCode === patientCode ? { ...r, followups: [...r.followups, followup] } : r,
      );
      await persist(next);
    },
    [records, persist],
  );

  const setReferral = useCallback(
    async (id: string, referredTo: string) => {
      const next = records.map((r) => (r.id === id ? { ...r, referredTo } : r));
      await persist(next);
    },
    [records, persist],
  );

  const clearAll = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const activeRecords = records.filter((r) => !r.inactive);
  const getById = useCallback((id: string) => records.find((r) => r.id === id), [records]);
  const getByCode = useCallback(
    (code: string) => records.find((r) => r.patientCode.toUpperCase() === code.toUpperCase()),
    [records],
  );

  const value: RecordsContextValue = {
    records,
    loading,
    refresh,
    upsert,
    softDelete,
    addFollowup,
    setReferral,
    clearAll,
    activeRecords,
    getById,
    getByCode,
  };

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords(): RecordsContextValue {
  const ctx = useContext(RecordsContext);
  if (!ctx) throw new Error('useRecords must be used within RecordsProvider');
  return ctx;
}
