/**
 * Part B — definitive diagnostic assessment + final study reference
 * classification (case report form master.pdf, B1 + B2).
 *
 * Part B RECORDS investigations; it never scores them and never infers a
 * diagnosis. The final classification is the treating team's, independent of
 * ARF-FAST / SMART-ARF screening. Level B points, the combined score, WBC
 * scoring, and the fever-duration tie-breaker do not exist on this path.
 *
 * State discipline: every test distinguishes
 *   - not done   (test explicitly marked as not performed)
 *   - negative/normal (a result was recorded)
 *   - uncertain  (echo valves only: result reported as uncertain)
 *   - unanswered ('' / null — no entry yet; never converted to another state)
 */
import type { AssessmentInputs } from './types';

/* ─────────────────────────────────────────────────────────────────── *
 * B1. Investigations
 * ─────────────────────────────────────────────────────────────────── */

/** '' = unanswered; distinct from 'not-done'. */
export type MicroResult = '' | 'positive' | 'negative' | 'not-done';
export type EcgStatus = '' | 'done' | 'not-done' | 'not-reported';
export type EchoStatus = '' | 'not-done' | 'normal' | 'abnormal';
export type ValveAnswer = '' | 'yes' | 'no' | 'uncertain';
export type PairedRise = '' | 'yes' | 'no';

export interface PartBData {
  /** boolean | null: null = unanswered, true = performed, false = not done. */
  esrDone: boolean | null;
  esrValue: string; // mm/hour, numeric text
  crpDone: boolean | null;
  crpValue: string;
  crpUnit: '' | 'mg/L' | 'mg/dL';
  asoDone: boolean | null;
  asoValue: string;
  asoUnit: string;
  asoUpperLimit: string;
  asoPairedRise: PairedRise;
  dnaseDone: boolean | null;
  dnaseValue: string;
  dnaseUnit: string;
  dnaseUpperLimit: string;
  dnasePairedRise: PairedRise;
  throatCulture: MicroResult;
  rapidGas: MicroResult;
  ecgStatus: EcgStatus;
  ecgPrMs: string;
  ecgProlongedForAge: '' | 'yes' | 'no';
  echoStatus: EchoStatus;
  echoMrPathological: ValveAnswer;
  echoArPathological: ValveAnswer;
  echoOther: string;
  otherInvestigations: string;
}

/* ─────────────────────────────────────────────────────────────────── *
 * B2. Final study reference classification
 * ─────────────────────────────────────────────────────────────────── */

export type PartBClassification = '' | 'definite-probable' | 'excluded' | 'unable';
export type DiagnosticBasis = '' | 'two-major-gas' | 'one-major-two-minor-gas' | 'recurrent-three-minor-gas' | 'isolated-chorea' | 'indolent-carditis';
export type EpisodeType = '' | 'first' | 'recurrent' | 'uncertain';

export interface PartBDiagnosis {
  assessmentCompleted: '' | 'yes' | 'no';
  notCompletedReason: string;
  classification: PartBClassification;
  basis: DiagnosticBasis;
  episode: EpisodeType;
  treatingTeamDx: string;
  /** Required for 'unable' — covers BOTH incomplete assessments and completed
   *  assessments with an uncertain / indeterminate diagnosis. */
  unableReason: string;
}

export interface PartBRecord {
  investigations: PartBData;
  diagnosis: PartBDiagnosis;
  savedAt: string;
  savedBy: string;
}

export function emptyPartBData(): PartBData {
  return {
    esrDone: null, esrValue: '',
    crpDone: null, crpValue: '', crpUnit: '',
    asoDone: null, asoValue: '', asoUnit: '', asoUpperLimit: '', asoPairedRise: '',
    dnaseDone: null, dnaseValue: '', dnaseUnit: '', dnaseUpperLimit: '', dnasePairedRise: '',
    throatCulture: '', rapidGas: '',
    ecgStatus: '', ecgPrMs: '', ecgProlongedForAge: '',
    echoStatus: '', echoMrPathological: '', echoArPathological: '', echoOther: '',
    otherInvestigations: '',
  };
}

export function emptyPartBDiagnosis(): PartBDiagnosis {
  return {
    assessmentCompleted: '',
    notCompletedReason: '',
    classification: '',
    basis: '',
    episode: '',
    treatingTeamDx: '',
    unableReason: '',
  };
}

export function emptyPartB(): PartBRecord {
  return { investigations: emptyPartBData(), diagnosis: emptyPartBDiagnosis(), savedAt: '', savedBy: '' };
}

/* ─────────────────────────────────────────────────────────────────── *
 * Validation — contradictory entries + numeric formats only.
 * Unanswered fields are allowed everywhere (the printed form defines no
 * digital-only mandatory fields); the one required answer is the reason
 * for an 'unable' classification, and the reason when the assessment is
 * marked not completed.
 * ─────────────────────────────────────────────────────────────────── */

function numericOrEmpty(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0;
}

export function validatePartB(data: PartBData, diagnosis: PartBDiagnosis): string | null {
  const esrValue = data.esrValue.trim();
  if (data.esrDone === false && esrValue) return 'ESR is marked not done but a value is entered.';
  if (data.esrDone === true && !numericOrEmpty(esrValue)) return 'ESR must be a number in mm/hour.';

  const crpValue = data.crpValue.trim();
  if (data.crpDone === false && crpValue) return 'CRP is marked not done but a value is entered.';
  if (data.crpDone === true && !numericOrEmpty(crpValue)) return 'CRP must be a number.';
  if (crpValue && !data.crpUnit) return 'Select the unit for the CRP result.';

  const antibodies: [name: string, done: boolean | null, value: string, unit: string, uln: string, rise: string][] = [
    ['ASO titre', data.asoDone, data.asoValue, data.asoUnit, data.asoUpperLimit, data.asoPairedRise],
    ['Anti-DNase B', data.dnaseDone, data.dnaseValue, data.dnaseUnit, data.dnaseUpperLimit, data.dnasePairedRise],
  ];
  for (const [name, done, value, unit, uln, rise] of antibodies) {
    const v = value.trim(), u = unit.trim(), lim = uln.trim();
    if (done === false && (v || u || lim || rise)) return `${name} is marked not done but results are entered.`;
    if (done === true && !numericOrEmpty(v)) return `${name} value must be a number.`;
    if (done === true && !numericOrEmpty(lim)) return `${name} upper reference limit must be a number.`;
  }

  if (data.ecgStatus !== 'done' && (data.ecgPrMs.trim() || data.ecgProlongedForAge)) {
    return 'The ECG PR interval and its interpretation apply only when the ECG was done.';
  }
  if (data.ecgStatus === 'done' && !numericOrEmpty(data.ecgPrMs)) return 'The PR interval must be a number in ms.';

  if ((data.echoStatus === '' || data.echoStatus === 'not-done') && (data.echoMrPathological || data.echoArPathological || data.echoOther.trim())) {
    return 'Valve and report answers apply only when echocardiography was performed.';
  }

  if (diagnosis.assessmentCompleted === 'no' && !diagnosis.notCompletedReason.trim()) {
    return 'State the reason the diagnostic assessment was not completed.';
  }
  if (diagnosis.classification === 'unable' && !diagnosis.unableReason.trim()) {
    return 'Unable to classify requires a main reason (incomplete assessment or continuing uncertainty).';
  }
  return null;
}

/** Trim free text and clear basis/episode when they no longer apply (the
 *  form only shows them for definite/probable). Never invents values. */
export function normalizePartB(data: PartBData, diagnosis: PartBDiagnosis): { investigations: PartBData; diagnosis: PartBDiagnosis } {
  const investigations: PartBData = {
    ...data,
    esrValue: data.esrValue.trim(),
    crpValue: data.crpValue.trim(),
    asoValue: data.asoValue.trim(), asoUnit: data.asoUnit.trim(), asoUpperLimit: data.asoUpperLimit.trim(),
    dnaseValue: data.dnaseValue.trim(), dnaseUnit: data.dnaseUnit.trim(), dnaseUpperLimit: data.dnaseUpperLimit.trim(),
    ecgPrMs: data.ecgPrMs.trim(),
    echoOther: data.echoOther.trim(),
    otherInvestigations: data.otherInvestigations.trim(),
  };
  const dz: PartBDiagnosis = {
    ...diagnosis,
    notCompletedReason: diagnosis.notCompletedReason.trim(),
    treatingTeamDx: diagnosis.treatingTeamDx.trim(),
    unableReason: diagnosis.unableReason.trim(),
  };
  if (dz.classification !== 'definite-probable') {
    dz.basis = '';
    dz.episode = '';
  }
  return { investigations, diagnosis: dz };
}

/** Read-only view of a stored record, filling any key missing from older
 *  saves — without converting unanswered states. */
export function restorePartB(inputs: AssessmentInputs | null | undefined): PartBRecord {
  const base = emptyPartB();
  const stored = inputs?.partB;
  if (!stored) return base;
  return {
    investigations: { ...base.investigations, ...stored.investigations },
    diagnosis: { ...base.diagnosis, ...stored.diagnosis },
    savedAt: stored.savedAt ?? '',
    savedBy: stored.savedBy ?? '',
  };
}

/* ─────────────────────────────────────────────────────────────────── *
 * Display labels (record screen + CSV export)
 * ─────────────────────────────────────────────────────────────────── */

export const MICRO_LABEL: Record<MicroResult, string> = {
  '': '', positive: 'Positive', negative: 'Negative', 'not-done': 'Not done',
};
export const ECG_STATUS_LABEL: Record<EcgStatus, string> = {
  '': '', done: 'Done', 'not-done': 'Not done', 'not-reported': 'Not reported / not measurable',
};
export const ECHO_STATUS_LABEL: Record<EchoStatus, string> = {
  '': '', 'not-done': 'Not done', normal: 'Normal', abnormal: 'Abnormal',
};
export const VALVE_LABEL: Record<ValveAnswer, string> = {
  '': '', yes: 'Yes', no: 'No', uncertain: 'Uncertain',
};
export const PAIRED_RISE_LABEL: Record<PairedRise, string> = {
  '': '', yes: 'Yes', no: 'No',
};
export const CLASSIFICATION_LABEL: Record<PartBClassification, string> = {
  '': '',
  'definite-probable': 'Definite / probable ARF',
  excluded: 'ARF excluded',
  unable: 'Unable to classify',
};
export const BASIS_LABEL: Record<DiagnosticBasis, string> = {
  '': '',
  'two-major-gas': 'Two major manifestations plus evidence of preceding GAS infection',
  'one-major-two-minor-gas': 'One major plus two minor manifestations plus evidence of preceding GAS infection',
  'recurrent-three-minor-gas': 'Recurrent ARF: three minor manifestations plus preceding GAS infection, after excluding more likely causes',
  'isolated-chorea': 'Accepted special circumstance: isolated Sydenham chorea',
  'indolent-carditis': 'Accepted special circumstance: indolent carditis',
};
export const EPISODE_LABEL: Record<EpisodeType, string> = {
  '': '', first: 'First', recurrent: 'Recurrent', uncertain: 'Uncertain',
};

