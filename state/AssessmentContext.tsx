/**
 * AssessmentContext — the in-memory wizard state. Drives Steps 1–6.
 *
 * Patient-anchored model: on commit, it upserts a Patient (reusing an existing
 * one by MRN when possible) and upserts an 'initial' Encounter that carries the
 * Jones-criteria scoring block. Follow-up encounters are created separately via
 * RecordsContext.addFollowup().
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRecords } from './RecordsContext';
import { useAuth } from './AuthContext';
import { ALL_CLINICS } from './actingClinic';
import { clinicsForUser } from '@/lib/permissions';
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
  getLevelAActions,
  getLevelAInterp,
  isAutoConfirmed,
} from '@/lib/scoring';
import { formatRecordDate } from '@/lib/format';

export interface PatientFields {
  firstName: string;
  lastName: string;
  mrn: string;
  phone1: string;
  phone2: string;
  dateOfBirth: string | null; // ISO YYYY-MM-DD; null = unknown
  dobApproximate: boolean; // true when dateOfBirth was derived from a manually-entered age
  gender: Gender;
  setting: Setting;
  isTest: boolean;
}

function emptyPatient(): PatientFields {
  return { firstName: '', lastName: '', mrn: '', phone1: '', phone2: '', dateOfBirth: null, dobApproximate: false, gender: '', setting: '', isTest: false };
}

export type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface AssessmentContextValue {
  /** True once any patient/assessment input exists — acting clinic is locked. */
  hasDraft: boolean;
  patient: PatientFields;
  inputs: AssessmentInputs;
  step: Step;
  activePatientId: string | null;
  activeEncounterId: string | null;
  referralCode: string | null;
  signedBy: string; // typed name of the responsible clinician (pre-filled from the logged-in user)
  setSignedBy: (name: string) => void;
  setPatient: (patch: Partial<PatientFields>) => void;
  setInputs: (patch: Partial<AssessmentInputs>) => void;
  setEntry: (field: 'fever' | 'chorea' | 'altCause' | 'historyArf', value: boolean) => void;
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
  const { user, activeClinicId, setActiveClinic } = useAuth();
  const [patient, setPatientState] = useState<PatientFields>(emptyPatient);
  const [inputs, setInputsState] = useState<AssessmentInputs>(emptyInputs);
  const [step, setStep] = useState<Step>(1);
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState('');

  /** True once the user has entered anything — the assessment draft is live.
   *  While a draft exists the acting clinic is LOCKED (switching would
   *  silently re-stamp where the visit gets saved). Cleared by reset(). */
  const hasDraft = useMemo(
    () =>
      JSON.stringify(patient) !== JSON.stringify(emptyPatient()) ||
      JSON.stringify(inputs) !== JSON.stringify(emptyInputs()),
    [patient, inputs],
  );

  // A draft cannot start in "All my clinics" view mode: snap to a real clinic
  // (first membership) the moment any input lands, so attribution is concrete.
  useEffect(() => {
    if (hasDraft && activeClinicId === ALL_CLINICS) {
      const first = user ? clinicsForUser(user)[0] : undefined;
      if (first) setActiveClinic(first);
    }
  }, [hasDraft, activeClinicId, user, setActiveClinic]);


  // Pre-fill the signer with the logged-in user's display name (editable); the
  // user can override it when signing on behalf of someone else.
  useEffect(() => {
    if (!signedBy && user?.profile.displayName) setSignedBy(user.profile.displayName);
  }, [user?.profile.displayName, signedBy]);

  const setPatient = (patch: Partial<PatientFields>) => setPatientState((p) => ({ ...p, ...patch }));
  const setInputs = (patch: Partial<AssessmentInputs>) => setInputsState((i) => ({ ...i, ...patch }));
  const setEntry = (field: 'fever' | 'chorea' | 'altCause' | 'historyArf', value: boolean) =>
    setInputsState((i) => ({ ...i, [field]: value }));


  const reset = () => {
    setPatientState(emptyPatient());
    setInputsState(emptyInputs());
    setStep(1);
    setActivePatientId(null);
    setActiveEncounterId(null);
    setReferralCode(null);
    setSignedBy('');
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
      dobApproximate: patient.dobApproximate,
      gender: patient.gender,
      setting: patient.setting,
      isTest: patient.isTest,
      // The ONE attribution decision: the acting clinic stamps the new visit
      // (header picker). Everything downstream (media) derives from the
      // encounter — no other clinic choice exists in the app.
      clinicId: activeClinicId,
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
    const autoConfirmed = isAutoConfirmed(inputsFinal);
    // Level A-only saves store the Level A verdict (the Step 3/4 wording);
    // Level B commits keep the combined tiers.
    const interp = withLevelB
      ? getInterp(scoreA, scoreB, inputs.feverDuration, autoConfirmed)
      : getLevelAInterp(scoreA, autoConfirmed);
    const breakdown = withLevelB ? buildFullBreakdownArray(inputsFinal) : buildBreakdownArray(inputsFinal);
    const now = new Date().toISOString();
    return {
      id: activeEncounterId ?? 'enc-' + Date.now(),
      patientId,
      type: 'initial',
      inactive: false,
      date: formatRecordDate(),
      inputs: { ...inputsFinal },
      score,
      level: interp.level,
      resultLabel: interp.label,
      range: interp.range,
      breakdown,
      actions: withLevelB
        ? getActions(scoreA, scoreB, inputs.feverDuration, autoConfirmed)
        : getLevelAActions(scoreA, autoConfirmed),
      includesLevelB: withLevelB,
      facilityType: inputs.facilityType,
      confirmedDx: '',
      finalDx: '',
      bpgStatus: '',
      echoFindings: '',
      complications: '',
      notes: '',
      referredTo: '',
      signedBy: signedBy.trim(),
      createdAt: now,
      updatedAt: now,
    };
  };

  const commit = async (withLevelB: boolean): Promise<{ patientId: string; encounterId: string }> => {
    // Upsert the patient (RecordsContext dedups by MRN at the data layer when
    // the UI lookup is not used).
    const savedPatient = await records.upsertPatient(buildPatient());
    // Stamp the persisted identity NOW, before the encounter save. If the
    // encounter write fails, the retry must reuse this patient id (upsert →
    // update); otherwise an MRN-less patient would mint a new id and duplicate.
    setActivePatientId(savedPatient.id);
    setReferralCode(savedPatient.referralCode);
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
        // Preserve the sign-off stamp on re-commit (Level B); the name itself
        // comes from the current `signedBy` state (editable in Step 3).
        encounter.signedBy = encounter.signedBy || existing.signedBy;
        encounter.signedByUserId = existing.signedByUserId;
        encounter.signedAt = existing.signedAt;
      }
    }
    await records.upsertEncounter(encounter);
    setActiveEncounterId(encounter.id);
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
      dobApproximate: p.dobApproximate,
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
    hasDraft,
    activePatientId,
    activeEncounterId,
    referralCode,
    signedBy,
    setSignedBy,
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
