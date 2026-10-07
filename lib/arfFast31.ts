/**
 * ARF-FAST v3.1 screening (assessment version 3).
 *
 * Source: "ARF-FAST revised v3.1" (DOCX) — frontline triage instrument.
 * Changes from v2: structured automatic-positive definitions (cardiac pattern
 * needs breathlessness PLUS a companion), tri-state family/previous history
 * (unknown scores 0, never silently "No"), corrected arthralgia wording, and
 * result labels that name the action threshold instead of a step number.
 *
 * v3 has NO Level B scoring and NO combined interpretation — definitive
 * assessment is captured separately via lib/partB.ts and is never computed
 * from screening answers.
 */
import { emptyInputs, type AssessmentInputs, type BreakdownRow, type Encounter } from './types';

export const INSTRUMENT_VERSION_31 = '3.1';

/** Step-1 entry features (DOCX "When to apply ARF-FAST"). Checked features do
 *  not by themselves mean ARF-FAST positive. */
export const ENTRY31_FEATURES = [
  { id: 'joints', label: 'Joint symptoms', description: 'Pain, visible swelling, or painful restriction of movement in one or more joints, especially large joints — unless clearly and sufficiently explained by an established alternative cause, such as a clear recent injury.' },
  { id: 'movements', label: 'Possible choreiform movements', description: 'New irregular, unpredictable, non-rhythmic involuntary movements, or new clumsiness / decline in handwriting, feeding, dressing, or walking. Awareness is usually preserved.' },
  { id: 'murmur', label: 'Murmur of concern', description: 'Any diastolic murmur, or a clearly pansystolic / holosystolic murmur best heard at the apex. A previously evaluated and documented innocent murmur alone does not qualify.' },
  { id: 'cardiac', label: 'Cardiac symptoms of concern', description: 'Breathlessness at rest or with usual activity; breathlessness worse lying flat and relieved sitting up (orthopnoea); bilateral foot / ankle / leg swelling; or a marked recent reduction in walking or playing because of breathlessness or fatigue.' },
  { id: 'skin', label: 'Possible ARF skin manifestations', description: 'A non-itchy ring-shaped or serpiginous rash with central clearing, usually on the trunk / proximal limbs, or small firm painless nodules under the skin.' },
] as const;

/** The alternative-explanation rule, applied per finding at entry,
 *  automatic-positive assessment, and scoring (DOCX Step 1 + safety rule 3). */
export const ALT_EXPLANATION_RULE =
  'Only use a symptom or sign as an entry feature, automatic-positive feature, or scored feature when it is NOT clearly and sufficiently explained by an established alternative cause. A concurrent illness does not itself exclude ARF. If it remains uncertain whether the alternative cause explains the finding, keep the finding and count it as appropriate.';


/** Joint manifestation — choose ONE, the highest applicable category. Same
 *  numerical weights as v2; "without objective arthritis" replaces "no
 *  swelling" because painful restriction alone can qualify as arthritis. */
export const FAST31_JOINTS = [
  { id: 'none', name: 'No joint pain or objective arthritis', desc: '', points: 0 },
  { id: 'monoarthralgia', name: 'Monoarthralgia', desc: 'Pain in one joint, without objective arthritis', points: 1 },
  { id: 'polyarthralgia', name: 'Polyarthralgia', desc: 'Pain in 2 or more joints, without objective arthritis', points: 2 },
  { id: 'monoarthritis', name: 'Monoarthritis', desc: 'Objective arthritis affecting one joint', points: 3 },
  { id: 'polyarthritis', name: 'Non-migratory polyarthritis', desc: 'Objective arthritis affecting 2 or more joints, without a clearly migratory pattern', points: 4 },
] as const;

/** Answered tri-state for scored history questions. `null` = unanswered. */
export type Fast31Tri = 'yes' | 'no' | 'unknown' | null;

export interface Fast31Inputs {
  entry: Record<typeof ENTRY31_FEATURES[number]['id'], boolean>;
  entryReviewed: boolean;
  urgentAcknowledged: boolean;
  /** Automatic-positive findings (DOCX Step 3). Cardiac is split into
   *  structured sub-findings; `cardiac` itself is derived, not stored. */
  chorea: boolean;
  /** Movements occur ONLY as discrete episodes with loss of awareness /
   *  sustained unresponsiveness / postictal state → does NOT qualify; needs
   *  urgent neurological assessment. Answered only when chorea is checked. */
  choreaEpisodicBlackout: boolean | null;
  murmur: boolean;
  /** Previously evaluated and documented innocent murmur alone → does not
   *  fulfill the murmur trigger. Answered only when murmur is checked. */
  murmurDocumentedInnocent: boolean | null;
  /** New or clearly worsened significant breathlessness at rest / usual activity. */
  breathlessness: boolean | null;
  orthopnea: boolean | null;
  edema: boolean | null;
  activityReduction: boolean | null;
  em: boolean;
  sn: boolean;
  /** Objective arthritis in ≥2 joints, migrating during the same illness. */
  migratoryArthritis: boolean;
  automaticReviewed: boolean;
  joint: typeof FAST31_JOINTS[number]['id'] | null;
  /** Measured temperature ≥38.0 °C during this illness at or before this
   *  assessment. Subjective fever without a measurement does not score. */
  measuredFever: boolean | null;
  familyHistory: Fast31Tri;
  previousArfRhd: Fast31Tri;
  result?: Fast31Result;
}

export interface Fast31Result {
  method: 'automatic' | 'score' | 'incomplete';
  label: string;
  scoreA: number | null;
  reasons: string[];
}

export const FAST31_POSITIVE = 'ARF-FAST positive — suspected ARF';
export const FAST31_NEGATIVE = 'ARF-FAST negative — ARF treatment/referral threshold not met';
export const FAST31_POSITIVE_ACTION =
  'Initiate/administer BPG according to the current approved local ARF protocol, if it can be given safely, AND arrange prompt referral to secondary/higher-level care for definitive Jones-criteria assessment and echocardiography where available. Do not delay referral if BPG cannot be given.';
export const FAST31_NEGATIVE_ACTION =
  'Do not start BPG for suspected ARF solely on the basis of ARF-FAST. Assess and manage likely alternative diagnoses, provide safety-netting, and reassess or refer if symptoms persist, evolve, or clinical concern remains. A negative ARF-FAST result does not rule out ARF.';
export const BPG_SAFETY_CAUTION =
  'Do not administer BPG at the frontline with a history of severe immediate penicillin allergy or severe/uncontrolled heart failure — arrange urgent referral and follow the approved alternative pathway. Use trained personnel with anaphylaxis preparedness. If BPG is contraindicated or cannot be given safely, the ARF-FAST classification itself does not change, and BPG may still be indicated independently of ARF-FAST.';

export function isFast31(s: AssessmentInputs | null | undefined): boolean {
  return s?.assessmentVersion === 3;
}

export function emptyFast31(): Fast31Inputs {
  return {
    entry: { joints: false, movements: false, murmur: false, cardiac: false, skin: false },
    entryReviewed: false, urgentAcknowledged: false,
    chorea: false, choreaEpisodicBlackout: null, murmur: false, murmurDocumentedInnocent: null,
    breathlessness: null, orthopnea: null, edema: null, activityReduction: null,
    em: false, sn: false, migratoryArthritis: false,
    automaticReviewed: false, joint: null, measuredFever: null, familyHistory: null, previousArfRhd: null,
  };
}

/** The five automatic-positive features, computed from the structured answers
 *  (DOCX Step 3 — each must meet its definition). */
export function automatic31Reasons(f: Fast31Inputs | null | undefined): { id: string; label: string }[] {
  if (!f) return [];
  const reasons: { id: string; label: string }[] = [];
  if (f.chorea && f.choreaEpisodicBlackout === false) reasons.push({ id: 'chorea', label: 'A. Possible Sydenham chorea' });
  if (f.murmur && f.murmurDocumentedInnocent !== true) reasons.push({ id: 'murmur', label: 'B1. Murmur suggestive of mitral/aortic valvular involvement' });
  if (f.breathlessness === true && (f.orthopnea === true || f.edema === true || f.activityReduction === true)) {
    reasons.push({ id: 'carditis', label: 'B2. Clinical pattern concerning for carditis / heart failure' });
  }
  if (f.em || f.sn) reasons.push({ id: 'skin', label: 'C. Characteristic ARF skin manifestations' });
  if (f.migratoryArthritis) reasons.push({ id: 'arthritis', label: 'D. Clearly migratory inflammatory polyarthritis' });
  return reasons;
}

function scoreComplete(f: Fast31Inputs): boolean {
  return f.joint != null
    && typeof f.measuredFever === 'boolean'
    && f.familyHistory != null
    && f.previousArfRhd != null;
}

/** Two outputs only (DOCX Step 5). An unfinished form is a workflow state,
 *  never a third clinical classification. */
export function fast31Result(s: AssessmentInputs): Fast31Result {
  const f = s.arfFast31;
  const reasons = automatic31Reasons(f).map(r => r.label);
  if (reasons.length) return { method: 'automatic', label: FAST31_POSITIVE, scoreA: null, reasons };
  if (!f || !scoreComplete(f)) return { method: 'incomplete', label: 'Assessment incomplete', scoreA: null, reasons: [] };
  const joint = FAST31_JOINTS.find(j => j.id === f.joint)!;
  const scoreA = joint.points
    + Number(f.measuredFever === true)
    + Number(f.familyHistory === 'yes')
    + Number(f.previousArfRhd === 'yes');
  return { method: 'score', label: scoreA >= 2 ? FAST31_POSITIVE : FAST31_NEGATIVE, scoreA, reasons: [] };
}

/** The automatic step's structured questions must be answerable before the
 *  result can classify: sub-questions shown when a parent is checked, and the
 *  cardiac companions whenever breathlessness is present. */
export function fast31Validation(s: AssessmentInputs): string | null {
  const f = s.arfFast31;
  if (!f) return 'Screening answers are missing.';
  if (!f.entryReviewed) return 'Review the entry criteria before continuing.';
  if (!f.automaticReviewed) return 'Review the automatic-positive features before continuing.';
  if (f.chorea && f.choreaEpisodicBlackout == null) return 'Answer the awareness question for the choreiform movements.';
  if (f.murmur && f.murmurDocumentedInnocent == null) return 'Answer whether the murmur is a previously documented innocent murmur.';
  if (f.breathlessness === true && (f.orthopnea == null || f.edema == null || f.activityReduction == null)) {
    return 'Breathlessness is present — answer all three companion questions (orthopnea, edema, activity reduction).';
  }
  if (fast31Result(s).method === 'incomplete') return 'Answer all scoring questions before saving.';
  return null;
}

export function fast31Breakdown(s: AssessmentInputs): BreakdownRow[] {
  const f = s.arfFast31;
  const result = fast31Result(s);
  const rows: BreakdownRow[] = [{ label: 'ARF-FAST v3.1', points: result.scoreA, kind: 'subtotal' }];
  if (result.method === 'automatic') {
    rows.push(...result.reasons.map(label => ({ label, points: null })));
    rows.push({ label: 'Automatic-positive criteria met — numerical scoring not required', points: null });
  } else if (result.method === 'score' && f) {
    const joint = FAST31_JOINTS.find(j => j.id === f.joint)!;
    rows.push(
      { label: joint.name, points: joint.points },
      { label: 'Measured fever ≥38.0 °C', points: Number(f.measuredFever === true) },
      { label: 'First-degree family history', points: Number(f.familyHistory === 'yes') },
      { label: 'Previous definite ARF / established RHD', points: Number(f.previousArfRhd === 'yes') },
    );
  } else {
    rows.push({ label: 'Scoring not completed', points: null });
  }
  return rows;
}

/** v3 snapshot: no Level B, no combined score, no tier, no action strings —
 *  guidance wording renders from the result label, and the action record is
 *  the separate FastCareRecord. */
export function fast31ScoringSnapshot(s: AssessmentInputs): Pick<Encounter, 'inputs' | 'score' | 'level' | 'resultLabel' | 'range' | 'breakdown' | 'actions'> {
  const result = fast31Result(s);
  return {
    inputs: { ...s, arfFast31: { ...s.arfFast31!, result } },
    score: result.scoreA,
    level: null,
    resultLabel: result.label,
    range: result.method === 'automatic'
      ? 'Automatic-positive criteria met — numerical scoring not required'
      : 'ARF-FAST score / 7',
    breakdown: fast31Breakdown(s),
    actions: [],
  };
}

/* ─────────────────────────────────────────────────────────────────── *
 * ARF-FAST Record — actions taken after the screening result (DOCX
 * "ARF-FAST RECORD"). Saved separately from the screening answers so a
 * later Part B save never rewrites it.
 * ─────────────────────────────────────────────────────────────────── */

export type CareBpg = '' | 'given' | 'not-given' | 'contraindicated';

export const CARE_BPG_LABEL: Record<CareBpg, string> = {
  '': '—',
  given: 'BPG given',
  'not-given': 'BPG not given',
  contraindicated: 'BPG contraindicated / cannot be given safely',
};

export interface FastCareRecord {
  bpgAction: CareBpg;
  /** Mirrors the paper checkbox. The destination clinic stays the single
   *  source of truth on the encounter (referredTo / referredToClinicId). */
  referred: boolean;
  otherAction: string;
  /** When the action actually happened (ISO). Independent of save time and
   *  never refreshed by a later save unless explicitly edited. */
  actionAt: string | null;
  provider: string;
  facility: string;
  /** When this record was first saved (ISO). Frozen afterwards. */
  recordedAt: string;
}

/** Accepts "YYYY-MM-DD HH:MM" (local) or a full ISO string. Returns null when
 *  empty, an ISO string when parseable, and `invalid` when it cannot parse. */
export function parseActionAt(raw: string, fallback: Date = new Date()): string | null | 'invalid' {
  const t = raw.trim();
  if (!t) return fallback.toISOString();
  const iso = t.includes('T') ? t : t.replace(' ', 'T');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'invalid';
  return d.toISOString();
}

/** Merge a care-record edit into the stored record. First save stamps
 *  actionAt + recordedAt; later saves keep recordedAt and keep actionAt
 *  unless the editor supplied a new one. Provider/facility default to the
 *  screening sign-off / acting clinic. */
export function mergeCareRecord(
  existing: FastCareRecord | null | undefined,
  patch: Partial<Omit<FastCareRecord, 'recordedAt'>>,
  now: string,
  defaults: { provider: string; facility: string },
): FastCareRecord {
  const merged = { ...(existing ?? null), ...patch } as Partial<FastCareRecord>;
  if (!existing) {
    return {
      bpgAction: merged.bpgAction ?? '',
      referred: merged.referred ?? false,
      otherAction: merged.otherAction ?? '',
      actionAt: patch.actionAt ?? now,
      provider: merged.provider?.trim() || defaults.provider,
      facility: merged.facility?.trim() || defaults.facility,
      recordedAt: now,
    };
  }
  return {
    bpgAction: merged.bpgAction ?? existing.bpgAction,
    referred: merged.referred ?? existing.referred,
    otherAction: merged.otherAction ?? existing.otherAction,
    actionAt: patch.actionAt ?? existing.actionAt,
    provider: merged.provider?.trim() || existing.provider,
    facility: merged.facility?.trim() || existing.facility,
    recordedAt: existing.recordedAt,
  };
}

/* ─────────────────────────────────────────────────────────────────── *
 * Screening lock + amendment trail. Part A freezes on first save (CRF:
 * "Do not change Part A later"); corrections go through an amendment that
 * records who / when / before / after / reason. The FIRST saved answers are
 * kept in `screeningOriginal` so exports can carry both.
 * ─────────────────────────────────────────────────────────────────── */

export interface ScreeningAmendment {
  at: string;
  by: string;
  reason: string;
  field: string;
  before: string;
  after: string;
}

const FAST31_FIELD_LABELS: Record<string, string> = {
  'entry.joints': 'Entry: joint symptoms',
  'entry.movements': 'Entry: possible choreiform movements',
  'entry.murmur': 'Entry: murmur of concern',
  'entry.cardiac': 'Entry: cardiac symptoms of concern',
  'entry.skin': 'Entry: possible ARF skin manifestations',
  chorea: 'Automatic: possible Sydenham chorea',
  choreaEpisodicBlackout: 'Chorea — episodes only with loss of awareness',
  murmur: 'Automatic: murmur of concern',
  murmurDocumentedInnocent: 'Murmur — previously documented innocent murmur',
  breathlessness: 'Significant recent breathlessness',
  orthopnea: 'Orthopnea',
  edema: 'Edema',
  activityReduction: 'Marked activity reduction',
  em: 'Possible erythema marginatum',
  sn: 'Possible subcutaneous nodules',
  migratoryArthritis: 'Clearly migratory inflammatory polyarthritis',
  joint: 'Joint manifestation category',
  measuredFever: 'Measured fever ≥38.0 °C',
  familyHistory: 'First-degree family history',
  previousArfRhd: 'Previous definite ARF / established RHD',
};

function leafLabel(path: string): string {
  return FAST31_FIELD_LABELS[path] ?? path;
}

function leafValue(v: unknown): string {
  if (v === null || v === undefined) return 'unanswered';
  if (typeof v === 'boolean') return v ? 'present/yes' : 'absent/no';
  return String(v);
}

/** Diff two Fast31Inputs answer sets (ignores the stored result snapshot).
 *  Returns readable amendment entries; empty when nothing changed. */
export function diffFast31(before: Fast31Inputs, after: Fast31Inputs): { field: string; before: string; after: string }[] {
  const out: { field: string; before: string; after: string }[] = [];
  const keys = Object.keys(FAST31_FIELD_LABELS) as (keyof Fast31Inputs)[];
  for (const key of keys) {
    const path = key.startsWith('entry.') ? key : String(key);
    const b = key === 'joint'
      ? leafValue(before.joint)
      : key.startsWith('entry.')
        ? leafValue((before.entry as Record<string, boolean>)[key.slice(6)])
        : leafValue(before[key]);
    const a = key === 'joint'
      ? leafValue(after.joint)
      : key.startsWith('entry.')
        ? leafValue((after.entry as Record<string, boolean>)[key.slice(6)])
        : leafValue(after[key]);
    if (b !== a) out.push({ field: leafLabel(path), before: b, after: a });
  }
  return out;
}

/** Apply an amendment: append trail entries, keep the first-ever answers in
 * `screeningOriginal`, and return the corrected inputs. Pure. */
export function applyScreeningAmendment(
  prevInputs: AssessmentInputs,
  newFast: Fast31Inputs,
  reason: string,
  by: string,
  at: string,
): { inputs: AssessmentInputs; amendments: ScreeningAmendment[] } {
  const prev = prevInputs.arfFast31 ?? emptyFast31();
  const changes = diffFast31(prev, newFast);
  const amendments: ScreeningAmendment[] = changes.map(c => ({ at, by, reason, ...c }));
  return {
    inputs: {
      ...prevInputs,
      arfFast31: newFast,
      screeningOriginal: prevInputs.screeningOriginal ?? prev,
      screeningAmendments: [...(prevInputs.screeningAmendments ?? []), ...amendments],
    },
    amendments,
  };
}

/** Restore a stored v3 record for editing: fill any missing key from the
 *  default shape without ever treating a missing answer as "No". */
export function restoreFast31(s: AssessmentInputs | null | undefined): Fast31Inputs {
  const base = emptyFast31();
  const stored = s?.arfFast31;
  if (!stored) return base;
  return {
    ...base, ...stored,
    entry: { ...base.entry, ...stored.entry },
  };
}

