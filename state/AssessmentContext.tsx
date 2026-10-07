/**
 * AssessmentContext — versioned in-memory wizard state.
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
import { fastResult, fastScoringSnapshot, fastValidation, isFast, newAssessmentInputs, restoreAssessmentInputs } from '@/lib/arfFast';
import { applyScreeningAmendment, fast31Result, fast31ScoringSnapshot, fast31Validation, isFast31, mergeCareRecord, type FastCareRecord } from '@/lib/arfFast31';
import { normalizePartB, validatePartB, type PartBData, type PartBDiagnosis } from '@/lib/partB';
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
  /** v3: optional study identifier shown on screening + Part B and in exports. */
  studyId: string;
}

function emptyPatient(): PatientFields {
  return { firstName: '', lastName: '', mrn: '', phone1: '', phone2: '', dateOfBirth: null, dobApproximate: false, gender: '', setting: '', isTest: false, studyId: '' };
}

// Legacy step IDs stay stable; named screens insert FAST stages before results.
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 'urgent' | 'automatic' | 'fast-score';

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
  /** Commit Level B; v2 stores separate subtotals with no combined interpretation. */
  commitFinal: () => Promise<{ patientId: string; encounterId: string }>;
  /** v3: save the ARF-FAST action record (BPG / referral / other) on the
   *  saved screening encounter. Referral fields stay the single source of
   *  truth for destination. */
  commitCareRecord: (
    patch: Partial<Omit<FastCareRecord, 'recordedAt'>>,
    referral: { referredTo: string; referredToClinicId: string | null },
  ) => Promise<void>;
  /** v3: save Part B investigations + reference diagnosis on the same encounter. */
  commitPartB: (data: PartBData, diagnosis: PartBDiagnosis) => Promise<void>;
  /** Resume the saved version: legacy scoring, v2 entry review, or locked v3. */
  loadRecordForEdit: (patient: Patient, encounter: Encounter, opts?: { toPartB?: boolean }) => void;
  /** v3: true once the screening for the loaded encounter is saved and frozen. */
  screeningLocked: boolean;
  /** v3: non-empty while an amendment is in progress (reason is required). */
  amendReason: string;
  setAmendReason: (reason: string) => void;
  startAmend: (reason: string) => void;
  cancelAmend: () => void;
  scoreA: number;
  scoreB: number;
}

const AssessmentContext = createContext<AssessmentContextValue | null>(null);

export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const records = useRecords();
  const { user, activeClinicId, setActiveClinic } = useAuth();
  const [patient, setPatientState] = useState<PatientFields>(emptyPatient);
  const [inputs, setInputsState] = useState<AssessmentInputs>(newAssessmentInputs);
  const [step, setStep] = useState<Step>(1);
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState('');
  const [amendMode, setAmendMode] = useState(false);
  const [amendReason, setAmendReason] = useState('');

  /** True once the user has entered anything — the assessment draft is live.
   *  While a draft exists the acting clinic is LOCKED (switching would
   *  silently re-stamp where the visit gets saved). Cleared by reset(). */
  const hasDraft = useMemo(
    () =>
      JSON.stringify(patient) !== JSON.stringify(emptyPatient()) ||
      JSON.stringify(inputs) !== JSON.stringify(newAssessmentInputs()),
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
    setInputsState(newAssessmentInputs());
    setStep(1);
    setActivePatientId(null);
    setActiveEncounterId(null);
    setReferralCode(null);
    setSignedBy('');
    setAmendMode(false);
    setAmendReason('');
  };

  const goStep = (n: Step) => setStep(n);

  const scoreA = useMemo(
    () => isFast31(inputs) ? fast31Result(inputs).scoreA ?? 0 : isFast(inputs) ? fastResult(inputs).scoreA ?? 0 : calcLevelA(inputs),
    [inputs],
  );
  // v3 has no Level B; the separate Part B record never feeds a score.
  const scoreB = useMemo(
    () => isFast(inputs) && !isFast31(inputs) ? fastResult(inputs, true).scoreB ?? 0 : isFast31(inputs) ? 0 : calcLevelB(inputs),
    [inputs],
  );

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

  /** Build an 'initial' encounter from the scoring state. `source` lets the
   *  v3 path hand in the amendment-merged inputs; defaults to wizard state. */
  const buildEncounter = (patientId: string, withLevelB: boolean, source: AssessmentInputs = inputs): Encounter => {
    const inputsFinal: AssessmentInputs = { ...source, choreaPositive: source.chorea === true };
    const scoring = isFast31(inputsFinal) ? fast31ScoringSnapshot(inputsFinal) : isFast(inputsFinal) ? fastScoringSnapshot(inputsFinal, withLevelB) : (() => {
      const scoreA = calcLevelA(inputsFinal);
      const scoreB = withLevelB ? calcLevelB(inputsFinal) : 0;
      const interp = withLevelB ? getInterp(scoreA, scoreB, inputs.feverDuration) : getLevelAInterp(scoreA);
      return {
        inputs: inputsFinal, score: scoreA + scoreB, level: interp.level,
        resultLabel: interp.label, range: interp.range,
        breakdown: withLevelB ? buildFullBreakdownArray(inputsFinal) : buildBreakdownArray(inputsFinal),
        actions: withLevelB ? getActions(scoreA, scoreB, inputs.feverDuration) : getLevelAActions(scoreA),
      };
    })();
    const now = new Date().toISOString();
    return {
      id: activeEncounterId ?? 'enc-' + Date.now(),
      patientId,
      type: 'initial',
      inactive: false,
      date: formatRecordDate(),
      ...scoring,
      includesLevelB: isFast31(inputsFinal) ? false : withLevelB,
      facilityType: source.facilityType,
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
    const existingBefore = activeEncounterId
      ? records.getEncountersForPatient(activePatientId ?? '').find((e) => e.id === activeEncounterId)
      : undefined;
    if (isFast31(inputs)) {
      const error = fast31Validation(inputs);
      if (error) throw new Error(error);
      if (!signedBy.trim()) throw new Error('Clinician sign-off is required.');
      // Screening lock: saved v3 answers change only through an amendment.
      if (existingBefore && !amendMode) {
        throw new Error('This screening is locked. To correct a saved answer, use "Amend answers" and state the reason.');
      }
    } else if (isFast(inputs)) {
      const error = fastValidation(inputs);
      if (error) throw new Error(error);
      if (!signedBy.trim()) throw new Error('Clinician sign-off is required.');
    }
    // Upsert the patient (RecordsContext dedups by MRN at the data layer when
    // the UI lookup is not used).
    const savedPatient = await records.upsertPatient(buildPatient());
    // Stamp the persisted identity NOW, before the encounter save. If the
    // encounter write fails, the retry must reuse this patient id (upsert →
    // update); otherwise an MRN-less patient would mint a new id and duplicate.
    setActivePatientId(savedPatient.id);
    setReferralCode(savedPatient.referralCode);

    // v3: carry the study id and, when amending, append the audit trail on top
    // of the SAVED inputs — the wizard state never holds the only copy of
    // careRecord / partB, so those ride along untouched.
    let effective: AssessmentInputs = { ...inputs, studyId: patient.studyId.trim() || inputs.studyId || '' };
    if (existingBefore?.inputs && isFast31(existingBefore.inputs)) {
      effective = amendMode
        ? applyScreeningAmendment(existingBefore.inputs, effective.arfFast31!, amendReason.trim(), signedBy.trim(), new Date().toISOString()).inputs
        : existingBefore.inputs;
    } else if (isFast31(effective)) {
      // First save: freeze the original answers for the export's before/after.
      effective.screeningOriginal = effective.arfFast31 ? { ...effective.arfFast31 } : undefined;
    }
    const encounter = buildEncounter(savedPatient.id, withLevelB, effective);
    // Preserve date + referral on edit (don't overwrite a prior encounter's date).
    if (existingBefore) {
      encounter.id = existingBefore.id;
      encounter.date = existingBefore.date;
      encounter.referredTo = existingBefore.referredTo;
      encounter.referredToClinicId = existingBefore.referredToClinicId;
      encounter.confirmedDx = existingBefore.confirmedDx;
      encounter.finalDx = existingBefore.finalDx;
      encounter.bpgStatus = existingBefore.bpgStatus;
      encounter.echoFindings = existingBefore.echoFindings;
      encounter.complications = existingBefore.complications;
      encounter.notes = existingBefore.notes;
      encounter.createdAt = existingBefore.createdAt;
      // Preserve the sign-off stamp on re-commit; the name itself comes from
      // the current `signedBy` state (editable on the scoring step).
      encounter.signedBy = encounter.signedBy || existingBefore.signedBy;
      encounter.signedByUserId = existingBefore.signedByUserId;
      encounter.signedAt = existingBefore.signedAt;
    }
    await records.upsertEncounter(encounter);
    setActiveEncounterId(encounter.id);
    if (effective !== inputs) setInputsState(effective);
    if (amendMode) { setAmendMode(false); setAmendReason(''); }
    return { patientId: savedPatient.id, encounterId: encounter.id };
  };

  const commitLevelA = () => commit(false);
  const commitFinal = () => commit(true);

  const findActiveEncounter = (): Encounter | undefined =>
    activeEncounterId && activePatientId
      ? records.getEncountersForPatient(activePatientId).find((e) => e.id === activeEncounterId)
      : undefined;

  /** v3 action record. Written straight onto the SAVED encounter — screening
   *  answers are untouched, and mergeCareRecord keeps the first action time
   *  + recordedAt unless the editor explicitly changes them. */
  const commitCareRecord = async (
    patch: Partial<Omit<FastCareRecord, 'recordedAt'>>,
    referral: { referredTo: string; referredToClinicId: string | null },
  ) => {
    const existing = findActiveEncounter();
    if (!existing?.inputs) throw new Error('Save the screening before recording actions.');
    const patientClinicId = records.patients.find((p) => p.id === existing.patientId)?.clinicId ?? activeClinicId;
    const facilityDefault = records.clinics.find((c) => c.id === patientClinicId)?.name ?? '';
    const now = new Date().toISOString();
    const careRecord = mergeCareRecord(existing.inputs.careRecord, patch, now, {
      provider: existing.signedBy || signedBy.trim(),
      facility: facilityDefault,
    });
    await records.upsertEncounter({
      ...existing,
      inputs: { ...existing.inputs, careRecord },
      referredTo: referral.referredTo,
      referredToClinicId: referral.referredToClinicId,
      updatedAt: now,
    });
  };

  /** v3 Part B. Also written onto the SAVED encounter; the screening block
   *  is never rewritten. First-save attribution (savedAt/savedBy) is frozen. */
  const commitPartB = async (data: PartBData, diagnosis: PartBDiagnosis) => {
    const existing = findActiveEncounter();
    if (!existing?.inputs) throw new Error('Save the screening before entering Part B.');
    const error = validatePartB(data, diagnosis);
    if (error) throw new Error(error);
    const { investigations, diagnosis: dz } = normalizePartB(data, diagnosis);
    const now = new Date().toISOString();
    const prev = existing.inputs.partB;
    const partB = { investigations, diagnosis: dz, savedAt: prev?.savedAt || now, savedBy: prev?.savedBy || signedBy.trim() };
    await records.upsertEncounter({ ...existing, inputs: { ...existing.inputs, partB }, updatedAt: now });
  };

  const loadRecordForEdit = (p: Patient, e: Encounter, opts?: { toPartB?: boolean }) => {
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
      studyId: e.inputs?.studyId ?? '',
    });
    setInputsState({ ...restoreAssessmentInputs(e.inputs), facilityType: e.facilityType ?? null });
    setSignedBy(e.signedBy ?? '');
    setActivePatientId(p.id);
    setActiveEncounterId(e.id);
    setReferralCode(p.referralCode);
    setAmendMode(false);
    setAmendReason('');
    setStep(isFast31(e.inputs) ? (opts?.toPartB ? 5 : 2) : isFast(e.inputs) ? 2 : 3);
  };
  /** v3 lock: answers of a SAVED v3 screening are frozen until an amendment
   *  with a stated reason opens them. */
  const screeningLocked = !!activeEncounterId && isFast31(inputs) && !amendMode;
  const startAmend = (reason: string) => {
    setAmendReason(reason);
    setAmendMode(true);
  };
  const cancelAmend = () => {
    setAmendMode(false);
    setAmendReason('');
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
    commitCareRecord,
    commitPartB,
    loadRecordForEdit,
    screeningLocked,
    amendReason,
    setAmendReason,
    startAmend,
    cancelAmend,
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
