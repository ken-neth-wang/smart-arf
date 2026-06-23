/**
 * AssessmentContext — the in-memory wizard state, mirroring the `S` object in
 * smart-arf-app.html. Drives Steps 1–6 and persists a PatientRecord (created on
 * entering Step 4, updated with Level B on entering Step 6).
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useRecords } from './RecordsContext';
import { emptyInputs, type AssessmentInputs, type Gender, type PatientRecord, type Setting } from '@/lib/types';
import {
  buildFullBreakdownArray,
  buildBreakdownArray,
  calcLevelA,
  calcLevelB,
  generatePatientCode,
  getActions,
  getInterp,
} from '@/lib/scoring';
import { formatRecordDate } from '@/lib/format';

export interface PatientFields {
  firstName: string;
  lastName: string;
  mrn: string;
  phone1: string;
  phone2: string;
  age: number | null;
  gender: Gender;
  setting: Setting;
  isTest: boolean;
}

function emptyPatient(): PatientFields {
  return { firstName: '', lastName: '', mrn: '', phone1: '', phone2: '', age: null, gender: '', setting: '', isTest: false };
}

export type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface AssessmentContextValue {
  patient: PatientFields;
  inputs: AssessmentInputs;
  step: Step;
  activeRecordId: string | null;
  patientCode: string | null;
  // patient setters
  setPatient: (patch: Partial<PatientFields>) => void;
  // clinical input setters
  setInputs: (patch: Partial<AssessmentInputs>) => void;
  // entry criteria helpers
  setEntry: (field: 'fever' | 'chorea' | 'altCause', value: boolean) => void;
  // wizard control
  reset: () => void;
  goStep: (n: Step) => void;
  /** Commit Level A → create/update record. Called when advancing Step 3 → 4. */
  commitLevelA: () => PatientRecord;
  /** Commit Level A + B → update record with combined score. Called Step 5 → 6. */
  commitFinal: () => PatientRecord;
  /** Rehydrate state from a saved record to resume/edit (jumps to Step 3). */
  loadRecordForEdit: (record: PatientRecord) => void;
  // derived (live)
  scoreA: number;
  scoreB: number;
}

const AssessmentContext = createContext<AssessmentContextValue | null>(null);

export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const records = useRecords();
  const [patient, setPatientState] = useState<PatientFields>(emptyPatient);
  const [inputs, setInputsState] = useState<AssessmentInputs>(emptyInputs);
  const [step, setStep] = useState<Step>(1);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [patientCode, setPatientCode] = useState<string | null>(null);

  const setPatient = (patch: Partial<PatientFields>) => setPatientState((p) => ({ ...p, ...patch }));
  const setInputs = (patch: Partial<AssessmentInputs>) => setInputsState((i) => ({ ...i, ...patch }));
  const setEntry = (field: 'fever' | 'chorea' | 'altCause', value: boolean) =>
    setInputsState((i) => ({ ...i, [field]: value }));

  const reset = () => {
    setPatientState(emptyPatient());
    setInputsState(emptyInputs());
    setStep(1);
    setActiveRecordId(null);
    setPatientCode(null);
  };

  const goStep = (n: Step) => setStep(n);

  const scoreA = useMemo(() => calcLevelA(inputs), [inputs]);
  const scoreB = useMemo(() => calcLevelB(inputs), [inputs]);

  const commitLevelA = (): PatientRecord => {
    // Set chorea flag from entry criteria (mirrors evalEntry()).
    const inputsFinal: AssessmentInputs = { ...inputs, choreaPositive: inputs.chorea === true };
    setInputsState(inputsFinal);
    const id = activeRecordId ?? Date.now().toString();
    const code = patientCode ?? generatePatientCode();
    const score = calcLevelA(inputsFinal);
    const interp = getInterp(score);
    const record: PatientRecord = {
      id,
      patientCode: code,
      date: formatRecordDate(),
      firstName: patient.firstName,
      lastName: patient.lastName,
      mrn: patient.mrn,
      phone1: patient.phone1,
      phone2: patient.phone2,
      age: patient.age,
      gender: patient.gender,
      setting: patient.setting,
      isTest: patient.isTest,
      inactive: false,
      score,
      level: interp.level,
      resultLabel: interp.label,
      range: interp.range,
      breakdown: buildBreakdownArray(inputsFinal),
      actions: getActions(score),
      referredTo: '',
      followups: [],
      inputs: { ...inputsFinal },
      includesLevelB: false,
      updatedAt: new Date().toISOString(),
    };
    setActiveRecordId(id);
    setPatientCode(code);
    void records.upsert(record);
    return record;
  };

  const commitFinal = (): PatientRecord => {
    const inputsFinal: AssessmentInputs = { ...inputs, choreaPositive: inputs.chorea === true };
    const id = activeRecordId ?? Date.now().toString();
    const code = patientCode ?? generatePatientCode();
    const total = calcLevelA(inputsFinal) + calcLevelB(inputsFinal);
    const interp = getInterp(total);
    // Preserve existing followups/referral when updating.
    const existing = records.getById(id);
    const record: PatientRecord = {
      id,
      patientCode: code,
      date: existing?.date ?? formatRecordDate(),
      firstName: patient.firstName,
      lastName: patient.lastName,
      mrn: patient.mrn,
      phone1: patient.phone1,
      phone2: patient.phone2,
      age: patient.age,
      gender: patient.gender,
      setting: patient.setting,
      isTest: patient.isTest,
      inactive: false,
      score: total,
      level: interp.level,
      resultLabel: interp.label,
      range: interp.range,
      breakdown: buildFullBreakdownArray(inputsFinal),
      actions: getActions(total),
      referredTo: existing?.referredTo ?? '',
      followups: existing?.followups ?? [],
      inputs: { ...inputsFinal },
      includesLevelB: true,
      updatedAt: new Date().toISOString(),
    };
    setActiveRecordId(id);
    setPatientCode(code);
    void records.upsert(record);
    return record;
  };

  const loadRecordForEdit = (record: PatientRecord) => {
    setPatientState({
      firstName: record.firstName,
      lastName: record.lastName,
      mrn: record.mrn,
      phone1: record.phone1,
      phone2: record.phone2,
      age: record.age,
      gender: record.gender,
      setting: record.setting,
      isTest: record.isTest,
    });
    setInputsState({ ...emptyInputs(), ...record.inputs });
    setActiveRecordId(record.id);
    setPatientCode(record.patientCode);
    setStep(3);
  };

  const value: AssessmentContextValue = {
    patient,
    inputs,
    step,
    activeRecordId,
    patientCode,
    setPatient,
    setInputs,
    setEntry,
    reset,
    goStep,
    commitLevelA,
    commitFinal,
    loadRecordForEdit,
    scoreA,
    scoreB,
  };

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}

export function useAssessment(): AssessmentContextValue {
  const ctx = useContext(AssessmentContext);
  if (!ctx) throw new Error('useAssessment must be used within AssessmentProvider');
  return ctx;
}
