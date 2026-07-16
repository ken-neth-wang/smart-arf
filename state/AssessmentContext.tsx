/**
 * AssessmentContext — the in-memory wizard state. Drives Steps 1–6.
 *
 * Patient-anchored model: on commit, it upserts a Patient (reusing an existing
 * one by MRN when possible) and upserts an 'initial' Encounter that carries the
 * Jones-criteria scoring block. Follow-up encounters are created separately via
 * RecordsContext.addFollowup().
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useRecords } from './RecordsContext';
import { useAuth } from './AuthContext';
import { ageFromDateOfBirth, type AssessmentInputs, type Encounter, type Gender, type Patient, type Setting } from '@/lib/types';
import { emptyInputs } from '@/lib/types';
import {
  buildBreakdownArray,
  buildFullBreakdownArray,
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
  dateOfBirth: string | null; // ISO YYYY-MM-DD; null = unknown
  gender: Gender;
  setting: Setting;
  isTest: boolean;
}

function emptyPatient(): PatientFields {
  return { firstName: '', lastName: '', mrn: '', phone1: '', phone2: '', dateOfBirth: null, gender: '', setting: '', isTest: false };
}

export type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface AssessmentContextValue {
  patient: PatientFields;
  inputs: AssessmentInputs;
  step: Step;
  activePatientId: string | null;
  activeEncounterId: string | null;
  referralCode: string | null;
  setPatient: (patch: Partial<PatientFields>) => void;
  setInputs: (patch: Partial<AssessmentInputs>) => void;
  setEntry: (field: 'fever' | 'chorea' | 'altCause', value: boolean) => void;
  reset: () => void;
  goStep: (n: Step) => void;
  /** Commit Level A → upsert patient + create/update initial encounter. */
  commitLevelA: () => Promise<{ patientId: string; encounterId: string }>;
  /** Commit Level A + B → update encounter with combined score. */
  commitFinal: () => Promise<{ patientId: string; encounterId: string }>;
  /** Rehydrate state from a saved patient + encounter to resume/edit (jumps to Step 3). */
  loadRecordForEdit: (patient: Patient, encounter: Encounter) => void;
  scoreA: number;
  scoreB: number;
}

const AssessmentContext = createContext<AssessmentContextValue | null>(null);

export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const records = useRecords();
  const { user } = useAuth();
  const [patient, setPatientState] = useState<PatientFields>(emptyPatient);
  const [inputs, setInputsState] = useState<AssessmentInputs>(emptyInputs);
  const [step, setStep] = useState<Step>(1);
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  const setPatient = (patch: Partial<PatientFields>) => setPatientState((p) => ({ ...p, ...patch }));
  const setInputs = (patch: Partial<AssessmentInputs>) => setInputsState((i) => ({ ...i, ...patch }));
  const setEntry = (field: 'fever' | 'chorea' | 'altCause', value: boolean) =>
    setInputsState((i) => ({ ...i, [field]: value }));

  const reset = () => {
    setPatientState(emptyPatient());
    setInputsState(emptyInputs());
    setStep(1);
    setActivePatientId(null);
    setActiveEncounterId(null);
    setReferralCode(null);
  };

  const goStep = (n: Step) => setStep(n);

  const scoreA = useMemo(() => calcLevelA(inputs), [inputs]);
  const scoreB = useMemo(() => calcLevelB(inputs), [inputs]);

  /** Build the Patient object from wizard state, reusing existing ids when editing. */
  const buildPatient = (): Patient => {
    const id = activePatientId ?? 'pat-' + Date.now();
    const code = referralCode ?? generatePatientCode();
    const now = new Date().toISOString();
    return {
      id,
      referralCode: code,
      firstName: patient.firstName,
      lastName: patient.lastName,
      mrn: patient.mrn,
      phone1: patient.phone1,
      phone2: patient.phone2,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      setting: patient.setting,
      isTest: patient.isTest,
      // Assign the patient to the current user's clinic so RLS can see it.
      // (For users with >1 clinic, takes the first — a picker is deferred.)
      clinicId: user?.memberships[0]?.clinicId ?? null,
      inactive: false,
      createdAt: now,
      updatedAt: now,
    };
  };

  /** Build an 'initial' encounter from the scoring state. */
  const buildEncounter = (patientId: string, withLevelB: boolean): Encounter => {
    const inputsFinal: AssessmentInputs = { ...inputs, choreaPositive: inputs.chorea === true };
    const scoreA = calcLevelA(inputsFinal);
    const scoreB = withLevelB ? calcLevelB(inputsFinal) : 0;
    const score = scoreA + scoreB;
    const interp = getInterp(scoreA, scoreB);
    const breakdown = withLevelB ? buildFullBreakdownArray(inputsFinal) : buildBreakdownArray(inputsFinal);
    const now = new Date().toISOString();
    return {
      id: activeEncounterId ?? 'enc-' + Date.now(),
      patientId,
      type: 'initial',
      date: formatRecordDate(),
      inputs: { ...inputsFinal },
      score,
      level: interp.level,
      resultLabel: interp.label,
      range: interp.range,
      breakdown,
      actions: getActions(scoreA, scoreB),
      includesLevelB: withLevelB,
      facilityType: inputs.facilityType,
      confirmedDx: '',
      finalDx: '',
      bpgStatus: '',
      echoFindings: '',
      complications: '',
      notes: '',
      referredTo: '',
      createdAt: now,
      updatedAt: now,
    };
  };

  const commit = async (withLevelB: boolean): Promise<{ patientId: string; encounterId: string }> => {
    // Upsert the patient (RecordsContext dedups by MRN at the data layer when
    // the UI lookup is not used).
    const savedPatient = await records.upsertPatient(buildPatient());
    // Preserve the patient's stable id/code + createdAt after dedup.
    const encounter = buildEncounter(savedPatient.id, withLevelB);
    // Preserve date + referral on edit (don't overwrite a prior encounter's date).
    if (activeEncounterId) {
      const existing = records.getEncountersForPatient(savedPatient.id).find((e) => e.id === activeEncounterId);
      if (existing) {
        encounter.id = existing.id;
        encounter.date = existing.date;
        encounter.referredTo = existing.referredTo;
        encounter.confirmedDx = existing.confirmedDx;
        encounter.finalDx = existing.finalDx;
        encounter.bpgStatus = existing.bpgStatus;
        encounter.echoFindings = existing.echoFindings;
        encounter.complications = existing.complications;
        encounter.notes = existing.notes;
        encounter.createdAt = existing.createdAt;
      }
    }
    await records.upsertEncounter(encounter);
    setActivePatientId(savedPatient.id);
    setActiveEncounterId(encounter.id);
    setReferralCode(savedPatient.referralCode);
    return { patientId: savedPatient.id, encounterId: encounter.id };
  };

  const commitLevelA = () => commit(false);
  const commitFinal = () => commit(true);

  const loadRecordForEdit = (p: Patient, e: Encounter) => {
    setPatientState({
      firstName: p.firstName,
      lastName: p.lastName,
      mrn: p.mrn,
      phone1: p.phone1,
      phone2: p.phone2,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      setting: p.setting,
      isTest: p.isTest,
    });
    setInputsState({ ...emptyInputs(), ...(e.inputs ?? emptyInputs()), facilityType: e.facilityType ?? null });
    setActivePatientId(p.id);
    setActiveEncounterId(e.id);
    setReferralCode(p.referralCode);
    setStep(3);
  };

  const value: AssessmentContextValue = {
    patient,
    inputs,
    step,
    activePatientId,
    activeEncounterId,
    referralCode,
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

export { ageFromDateOfBirth };
