/**
 * ARF scoring algorithm. Originally ported from smart-arf-app.html; the app is
 * now the source of truth and evolves per clinical-team review (2026-08: the
 * Level-B > 6 confirmation override was retired in favour of a single
 * total-score ladder — see getInterp).
 */
import type { AssessmentInputs, BreakdownRow, FeverDuration, TierLevel } from './types';

/** 31-char unambiguous alphabet (no 0, O, 1, I, L). Mirrors CODE_ALPHABET. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generatePatientCode(): string {
  const chunk = () => {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
  };
  return 'ARF-' + chunk() + '-' + chunk();
}

export function carditisScore(s: AssessmentInputs): number {
  return s.murmur ? 5 : 0;
}
export function skinScore(s: AssessmentInputs): number {
  return (s.em ? 5 : 0) + (s.sn ? 5 : 0);
}
export function calcLevelA(s: AssessmentInputs): number {
  return s.joint + carditisScore(s) + skinScore(s) + (s.noad ? 3 : 0) + (s.choreaPositive ? 5 : 0);
}
export function bloodInflammScore(s: AssessmentInputs): number {
  return s.wbc || s.esr ? 3 : 0;
}
export function strepAntibodyScore(s: AssessmentInputs): number {
  return s.aso || s.antidnase ? 5 : 0;
}
export function echoScore(s: AssessmentInputs): number {
  return s.echo === 'suggestive' ? 5 : 0;
}
export function calcLevelB(s: AssessmentInputs): number {
  return bloodInflammScore(s) + strepAntibodyScore(s) + (s.pr ? 3 : 0) + echoScore(s);
}

export interface Interp {
  label: string;
  level: TierLevel;
  range: string;
}

/** Shared action lists (referenced by both the combined verdicts and the
 *  Level A preview verdicts so wording can't drift between them). */
const ACTIONS_AUTO_CONFIRMED: string[] = [
  'Positive ARF — known history of ARF/RHD with current fever (recurrent episode)',
  'Start Benzathine Penicillin G (BPG) prophylaxis immediately',
  'Refer to secondary care for full evaluation',
  'Initiate or continue long-term secondary prophylaxis',
  'Educate patient and family about RHD',
];
const ACTIONS_POSSIBLE: string[] = [
  'ARF is possible — do not dismiss',
  'Start Benzathine Penicillin G (BPG) prophylaxis',
  'Refer to secondary care for confirmation',
  'Document findings and initiate prophylaxis plan',
];
const ACTIONS_RULED_OUT: string[] = [
  'ARF ruled out — score below 6',
  'Consider and evaluate alternative diagnoses',
  'Treat according to the clinical picture',
  'Routine follow-up as needed',
];
const ACTIONS_LIKELY: string[] = [
  'ARF is likely — act promptly',
  'Start Benzathine Penicillin G (BPG) prophylaxis immediately',
  'Refer to secondary care for full evaluation',
  'Initiate long-term secondary prophylaxis plan',
  'Educate patient and family about RHD',
];
const ACTIONS_CONFIRMED: string[] = [
  'ARF confirmed (score ≥ 10) — initiate management protocol',
  'Start Benzathine Penicillin G (BPG) prophylaxis immediately',
  'Refer to secondary care for full evaluation',
  'Initiate long-term secondary prophylaxis plan',
  'Educate patient and family about RHD',
];

/** Hard override: a known history of ARF/RHD plus a current fever indicates a
 *  likely recurrent episode — triage as Positive ARF regardless of Jones score. */
export function isAutoConfirmed(s: AssessmentInputs): boolean {
  return s.fever === true && s.historyArf === true;
}

export function getInterp(scoreA: number, scoreB: number, feverDuration?: FeverDuration, autoConfirmed = false): Interp {
  // Known history of ARF + current fever → likely recurrence; triage as
  // Positive ARF regardless of the Jones score.
  if (autoConfirmed) {
    return { label: 'Positive ARF (history of ARF + fever)', level: 'confirmed', range: 'History of ARF + fever' };
  }
  // Final bands per clinical-team feedback (2026-08), one ladder on the
  // combined total: <6 ruled out; 6 fever-dependent; 7–9 likely; ≥10
  // confirmed. The former "Level B > 6 confirms alone" override was retired.
  const score = scoreA + scoreB;
  if (score < 6) return { label: 'ARF ruled out', level: 'unlikely', range: 'Score < 6' };
  // Score 6 is borderline: ARF stays "possible" only if the fever was ≥ 2 weeks
  // ago (timing consistent with post-strep ARF); otherwise (recent fever or no
  // fever) it is ruled out. When feverDuration is unknown (live Level A previews,
  // or not yet answered) we keep "possible" so no verdict is shown prematurely.
  if (score === 6) {
    if (feverDuration === 'none' || feverDuration === 'under2w') {
      return { label: 'ARF ruled out', level: 'unlikely', range: 'Score 6 · fever < 2 weeks ago' };
    }
    return { label: 'ARF Possible', level: 'possible', range: 'Score 6' };
  }
  if (score <= 9) return { label: 'ARF Likely', level: 'likely', range: 'Score 7–9' };
  return { label: 'ARF Confirmed', level: 'confirmed', range: 'Score ≥ 10' };
}

export function getActions(scoreA: number, scoreB: number, feverDuration?: FeverDuration, autoConfirmed = false): string[] {
  // History of ARF + fever → recurrent ARF; full management protocol.
  if (autoConfirmed) {
    return ACTIONS_AUTO_CONFIRMED;
  }
  const score = scoreA + scoreB;
  if (score < 6) return ACTIONS_RULED_OUT;
  // Score 6 + fever < 2 weeks ago (or no fever) → ARF ruled out.
  if (score === 6 && (feverDuration === 'none' || feverDuration === 'under2w')) {
    return [
      'ARF ruled out — fever was less than 2 weeks ago (or no fever)',
      'Consider and evaluate alternative diagnoses',
      'Treat according to the clinical picture',
      'Routine follow-up as needed',
    ];
  }
  if (score === 6) return ACTIONS_POSSIBLE;
  if (score <= 9) return ACTIONS_LIKELY;
  return ACTIONS_CONFIRMED;
}

/* ─────────────────────────────────────────────────────────────────── *
 * Level A preview verdicts (Steps 3–4 + Level-A-only saves)
 * ─────────────────────────────────────────────────────────────────── */

/** Level A wording per clinical-team feedback (2026-08): a Level A score
 *  below 6 rules ARF out; 6 or more keeps it Possible pending Level B —
 *  there is no "Likely" tier at Level A. The history-of-ARF + fever
 *  override still takes precedence. */
export function getLevelAInterp(scoreA: number, autoConfirmed = false): Interp {
  if (autoConfirmed) {
    return { label: 'Positive ARF (history of ARF + fever)', level: 'confirmed', range: 'History of ARF + fever' };
  }
  if (scoreA < 6) return { label: 'ARF ruled out', level: 'unlikely', range: 'Level A < 6' };
  return { label: 'ARF Possible', level: 'possible', range: 'Level A ≥ 6' };
}

/** Actions matching getLevelAInterp's tiers. */
export function getLevelAActions(scoreA: number, autoConfirmed = false): string[] {
  if (autoConfirmed) return ACTIONS_AUTO_CONFIRMED;
  if (scoreA < 6) return ACTIONS_RULED_OUT;
  return ACTIONS_POSSIBLE;
}

/** Single source of truth for joint findings: id ↔ points ↔ label. */
export interface JointDef { id: string; points: number; label: string | null; }
export const JOINT_DEFS: JointDef[] = [
  { id: 'none', points: 0, label: null },
  { id: 'mono', points: 1, label: 'Monoarthralgia' },
  { id: 'poly', points: 3, label: 'Polyarthralgia' },
  { id: 'arthritis', points: 5, label: 'Migratory Polyarthritis' },
];
export const jointPoints: Record<string, number> = Object.fromEntries(
  JOINT_DEFS.map((j) => [j.id, j.points]),
) as Record<string, number>;
export const jointIdForPoints: Record<number, string> = Object.fromEntries(
  JOINT_DEFS.map((j) => [j.points, j.id]),
) as Record<number, string>;
const jointLabel: Record<number, string | null> = Object.fromEntries(
  JOINT_DEFS.map((j) => [j.points, j.label]),
) as Record<number, string | null>;

/**
 * Level A breakdown saved to the record (mirrors buildBreakdownArray in HTML).
 * Uses the correct severity keys (sob/edema).
 */
export function buildBreakdownArray(s: AssessmentInputs): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  if (s.choreaPositive) rows.push({ label: 'Chorea (major criterion)', points: 5 });
  if (s.joint > 0 && jointLabel[s.joint]) {
    rows.push({ label: jointLabel[s.joint] as string, points: s.joint });
  }
  if (carditisScore(s)) {
    rows.push({ label: 'Heart Murmur', points: 5 });
    const sev: string[] = [];
    if (s.sob) sev.push('SOB');
    if (s.edema) sev.push('Edema');
    if (sev.length) rows.push({ label: '↳ Severity: ' + sev.join(', '), points: null, kind: 'sub' });
  }
  if (s.em) rows.push({ label: 'Erythema Marginatum', points: 5 });
  if (s.sn) rows.push({ label: 'Subcutaneous Nodules', points: 5 });
  if (s.noad) rows.push({ label: 'No Obvious Alternative Diagnosis', points: 3 });
  return rows;
}

/** Level A + Level B breakdown saved to the record (mirrors buildFullBreakdownArray). */
export function buildFullBreakdownArray(s: AssessmentInputs): BreakdownRow[] {
  const rows = buildBreakdownArray(s);
  if (!s.naBlood && (s.wbc || s.esr)) {
    const markers: string[] = [];
    if (s.wbc) markers.push('WBC');
    if (s.esr) markers.push('ESR/CRP');
    rows.push({ label: 'Inflammation markers (' + markers.join(', ') + ')', points: 3 });
  }
  if (!s.naBlood && (s.aso || s.antidnase)) {
    const antibodies: string[] = [];
    if (s.aso) antibodies.push('ASO');
    if (s.antidnase) antibodies.push('Anti-DNase B');
    rows.push({ label: 'Strep antibody (' + antibodies.join(', ') + ')', points: 5 });
  }
  if (!s.naEcg && s.pr) rows.push({ label: 'Prolonged PR interval', points: 3 });
  if (!s.naEcho && s.echo === 'suggestive') rows.push({ label: 'Echocardiogram — Suggestive', points: 5 });
  return rows;
}

/**
 * LIVE display rows for Level A on Steps 4 & 6 — mirrors the HTML's
 * renderBreakdown() / showFinalResult() inline code (L3213 / L3261). NOTE: these
 * are DIFFERENT from buildBreakdownArray (the saved breakdown shown in record
 * detail): the live display OMITS the chorea row, labels carditis
 * "Murmur / Carditis Signs" with a "↳ Murmur" sub-row (the HTML refs
 * S.dyspnea/S.exercise/S.palp which are never in state, so SOB/Edema do not
 * appear here — a quirk carried over from the original HTML port).
 */
function liveLevelARows(s: AssessmentInputs): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  if (s.joint > 0 && jointLabel[s.joint]) rows.push({ label: jointLabel[s.joint] as string, points: s.joint });
  if (carditisScore(s)) {
    rows.push({ label: 'Murmur / Carditis Signs', points: 5 });
    const syms: string[] = [];
    if (s.murmur) syms.push('Murmur');
    rows.push({ label: '↳ ' + syms.join(', '), points: null, kind: 'sub' });
  }
  if (s.em) rows.push({ label: 'Erythema Marginatum', points: 5 });
  if (s.sn) rows.push({ label: 'Subcutaneous Nodules', points: 5 });
  if (s.noad) rows.push({ label: 'No Obvious Alternative Diagnosis', points: 3 });
  return rows;
}

/**
 * Display breakdown for the Level A result card (Step 4). Mirrors HTML
 * renderBreakdown() (L3213): Level A rows + trailing Total; empty → placeholder.
 */
export function levelADisplayBreakdown(s: AssessmentInputs, total: number): BreakdownRow[] {
  const items = liveLevelARows(s);
  const rows: BreakdownRow[] =
    items.length > 0 ? items : [{ label: 'No findings selected', points: 0, kind: 'empty' }];
  rows.push({ label: 'Total', points: total, kind: 'total' });
  return rows;
}

/**
 * Display breakdown for the Final result (Step 6). Mirrors showFinalResult html:
 * Level A subtotal header → Level A rows → Level B subtotal header → Level B rows → Total.
 */
export function finalDisplayBreakdown(s: AssessmentInputs, scoreA: number, scoreB: number): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  rows.push({ label: 'Level A Subtotal', points: scoreA, kind: 'subtotal' });

  const aItems = liveLevelARows(s);
  if (aItems.length === 0) {
    rows.push({ label: 'No findings selected', points: 0, kind: 'empty' });
  } else {
    rows.push(...aItems);
  }

  if (scoreB > 0 || s.naBlood || s.naEcg || s.naEcho) {
    rows.push({ label: 'Level B', points: null, kind: 'subtotal' });
    if (s.naBlood) {
      rows.push({ label: 'Blood Tests', points: null, kind: 'na' });
    } else {
      if (s.wbc || s.esr) {
        const markers: string[] = [];
        if (s.wbc) markers.push('WBC');
        if (s.esr) markers.push('ESR/CRP');
        rows.push({ label: 'Inflammation markers (' + markers.join(', ') + ')', points: 3 });
      }
      if (s.aso || s.antidnase) {
        const antibodies: string[] = [];
        if (s.aso) antibodies.push('ASO');
        if (s.antidnase) antibodies.push('Anti-DNase B');
        rows.push({ label: 'Strep antibody (' + antibodies.join(', ') + ')', points: 5 });
      }
    }
    if (s.naEcg) {
      rows.push({ label: 'ECG', points: null, kind: 'na' });
    } else if (s.pr) {
      rows.push({ label: 'Prolonged PR Interval', points: 3 });
    }
    if (s.naEcho) {
      rows.push({ label: 'Echocardiogram', points: null, kind: 'na' });
    } else if (s.echo === 'suggestive') {
      rows.push({ label: 'Echocardiogram — Suggestive', points: 5 });
    }
  }

  rows.push({ label: 'Total', points: scoreA + scoreB, kind: 'total' });
  return rows;
}
