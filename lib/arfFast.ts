/** Version 2 screening. Legacy Jones scoring remains in scoring.ts unchanged. */
import { calcLevelB } from './scoring';
import { emptyInputs, type AssessmentInputs, type BreakdownRow, type Encounter } from './types';

export const ENTRY_FEATURES = [
  { id: 'joints', label: 'Joint symptoms', description: 'Pain, swelling, or painful restriction in one or more joints, especially large joints.' },
  { id: 'movements', label: 'Possible choreiform movements', description: 'New irregular involuntary movements, or new clumsiness in handwriting, feeding, dressing, or walking.' },
  { id: 'murmur', label: 'Murmur of concern', description: 'Any diastolic murmur, or a pansystolic/holosystolic murmur best heard at the apex.' },
  { id: 'cardiac', label: 'Cardiac symptoms of concern', description: 'Breathlessness at rest or with activity, orthopnoea, leg swelling, or reduced exercise tolerance.' },
  { id: 'skin', label: 'Possible ARF skin manifestations', description: 'Ring-shaped rash with central clearing, or small firm painless nodules under the skin.' },
] as const;
export const AUTO_FEATURES = [
  { id: 'chorea', label: 'A. Possible Sydenham chorea', description: 'New irregular, non-rhythmic involuntary movements with preserved awareness.' },
  { id: 'murmur', label: 'B1. Murmur suggestive of valvular involvement', description: 'Diastolic murmur, or pansystolic/holosystolic murmur at the apex.' },
  { id: 'carditis', label: 'B2. Pattern concerning for carditis / heart failure', description: 'New breathlessness at rest or usual activity, plus orthopnoea, edema, or reduced activity.' },
  { id: 'skin', label: 'C. Characteristic ARF skin manifestations', description: 'Erythema marginatum or subcutaneous nodules.' },
  { id: 'arthritis', label: 'D. Clearly migratory inflammatory polyarthritis', description: 'Arthritis moving from one joint to another during the same illness.' },
] as const;
export const FAST_JOINTS = [
  { id: 'none', name: 'No joint pain or objective arthritis', desc: '', points: 0 },
  { id: 'monoarthralgia', name: 'Monoarthralgia', desc: 'Pain in one joint, no swelling', points: 1 },
  { id: 'polyarthralgia', name: 'Polyarthralgia', desc: 'Pain in 2+ joints, no swelling', points: 2 },
  { id: 'monoarthritis', name: 'Monoarthritis', desc: 'Objective arthritis, one joint', points: 3 },
  { id: 'polyarthritis', name: 'Non-migratory polyarthritis', desc: 'Objective arthritis, 2+ joints', points: 4 },
] as const;
export interface FastInputs {
  entry: Record<typeof ENTRY_FEATURES[number]['id'], boolean>;
  entryReviewed: boolean;
  urgentAcknowledged: boolean;
  automatic: Record<typeof AUTO_FEATURES[number]['id'], boolean>;
  automaticReviewed: boolean;
  joint: typeof FAST_JOINTS[number]['id'] | null;
  measuredFever: boolean | null;
  familyHistory: boolean | null;
  previousArfRhd: boolean | null;
  result?: FastResult;
}
export interface FastResult {
  method: 'automatic' | 'score' | 'incomplete';
  label: string;
  scoreA: number | null;
  scoreB: number | null;
  combinedInterpretation: 'pending' | null;
}
export function isFast(s: AssessmentInputs | null | undefined): boolean {
  return s?.assessmentVersion === 2;
}
export function emptyFast(): FastInputs {
  return {
    entry: { joints: false, movements: false, murmur: false, cardiac: false, skin: false },
    entryReviewed: false, urgentAcknowledged: false,
    automatic: { chorea: false, murmur: false, carditis: false, skin: false, arthritis: false },
    automaticReviewed: false, joint: null, measuredFever: null, familyHistory: null, previousArfRhd: null,
  };
}
export function newAssessmentInputs(): AssessmentInputs {
  return { ...emptyInputs(), assessmentVersion: 2, arfFast: emptyFast() };
}
/** Never infer version 2 for an unversioned legacy record. */
export function restoreAssessmentInputs(s: AssessmentInputs | null): AssessmentInputs {
  const restored = { ...emptyInputs(), ...s, assessmentVersion: s?.assessmentVersion ?? 1 };
  if (isFast(s)) restored.arfFast = { ...emptyFast(), ...s?.arfFast, entry: { ...emptyFast().entry, ...s?.arfFast?.entry }, automatic: { ...emptyFast().automatic, ...s?.arfFast?.automatic } };
  return restored;
}
export function automaticReasons(s: AssessmentInputs) {
  return AUTO_FEATURES.filter(f => s.arfFast?.automatic[f.id]);
}
export function fastResult(s: AssessmentInputs, withLevelB = false): FastResult {
  const f = s.arfFast;
  const base = { scoreB: withLevelB ? calcLevelB({ ...s, wbc: !s.naBlood && s.wbc, esr: !s.naBlood && s.esr, aso: !s.naBlood && s.aso, antidnase: !s.naBlood && s.antidnase, pr: !s.naEcg && s.pr, echo: s.naEcho ? null : s.echo }) : null, combinedInterpretation: withLevelB ? 'pending' as const : null };
  if (automaticReasons(s).length) return { ...base, method: 'automatic', label: 'ARF-FAST positive', scoreA: null };
  const joint = FAST_JOINTS.find(j => j.id === f?.joint);
  if (!joint || typeof f?.measuredFever !== 'boolean' || typeof f.familyHistory !== 'boolean' || typeof f.previousArfRhd !== 'boolean') {
    return { ...base, method: 'incomplete', label: 'Assessment incomplete', scoreA: null };
  }
  const scoreA = joint.points + Number(f.measuredFever) + Number(f.familyHistory) + Number(f.previousArfRhd);
  return { ...base, method: 'score', label: scoreA >= 2 ? 'ARF-FAST positive' : 'ARF-FAST negative', scoreA };
}
export function fastValidation(s: AssessmentInputs): string | null {
  if (!s.arfFast?.entryReviewed) return 'Review the entry criteria before continuing.';
  if (!s.arfFast.urgentAcknowledged) return 'Confirm that urgent needs have been assessed and addressed.';
  if (!s.arfFast.automaticReviewed) return 'Review automatic-positive features before continuing.';
  if (fastResult(s).method === 'incomplete') return 'Answer all Level A scoring questions before continuing.';
  return null;
}
export const COMBINED_PENDING = 'Combined interpretation pending clinical review';
export function fastBreakdown(s: AssessmentInputs, withLevelB = false): BreakdownRow[] {
  const f = s.arfFast;
  const result = fastResult(s, withLevelB);
  const rows: BreakdownRow[] = [{ label: 'Level A · ARF-FAST', points: result.scoreA, kind: 'subtotal' }];
  if (result.method === 'automatic') {
    rows.push(...automaticReasons(s).map(r => ({ label: r.label, points: null })));
    rows.push({ label: 'Automatic criteria met — Step 5 scoring not required', points: null });
  } else if (result.method === 'score' && f) {
    const joint = FAST_JOINTS.find(j => j.id === f.joint)!;
    rows.push({ label: joint.name, points: joint.points },
      { label: 'Measured fever', points: Number(f.measuredFever) },
      { label: 'First-degree family history', points: Number(f.familyHistory) },
      { label: 'Previous ARF / established RHD', points: Number(f.previousArfRhd) });
  } else rows.push({ label: 'Scoring not completed', points: null });
  if (withLevelB) {
    rows.push({ label: 'Level B subtotal', points: result.scoreB, kind: 'subtotal' },
      { label: s.naBlood ? 'Blood tests — not available' : 'WBC / ESR / CRP', points: s.naBlood ? null : (s.wbc || s.esr ? 3 : 0) },
      { label: s.naBlood ? 'Strep antibodies — not available' : 'ASO / anti-DNase B', points: s.naBlood ? null : (s.aso || s.antidnase ? 5 : 0) },
      { label: s.naEcg ? 'ECG — not available' : 'Prolonged PR interval', points: s.naEcg ? null : (s.pr ? 3 : 0) },
      { label: s.naEcho ? 'Echo — not available' : 'Suggestive echo', points: s.naEcho ? null : (s.echo === 'suggestive' ? 5 : 0) });
  }
  return rows;
}
/** No combined score/tier is assigned. Both subtotals remain in the JSON snapshot. */
export function fastScoringSnapshot(s: AssessmentInputs, withLevelB: boolean): Pick<Encounter, 'inputs' | 'score' | 'level' | 'resultLabel' | 'range' | 'breakdown' | 'actions'> {
  const result = fastResult(s, withLevelB);
  return {
    inputs: { ...s, arfFast: { ...s.arfFast!, result } },
    score: withLevelB ? null : result.scoreA,
    level: null,
    resultLabel: result.label,
    range: withLevelB ? COMBINED_PENDING : result.method === 'automatic' ? 'Automatic criteria met — Step 5 scoring not required' : 'Level A / 7',
    breakdown: fastBreakdown(s, withLevelB), actions: [],
  };
}
