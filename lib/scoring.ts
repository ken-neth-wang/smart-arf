/**
 * ARF scoring algorithm. Originally ported from smart-arf-app.html; the app is
 * now the source of truth and evolves per clinical-team review (e.g. the
 * Level-B > 6 confirmation rule was added deliberately, diverging from the HTML).
 */
import type { AssessmentInputs, BreakdownRow, TierLevel } from './types';

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
  return s.wbc || s.aso || s.esr ? 3 : 0;
}
export function echoScore(s: AssessmentInputs): number {
  return s.echo === 'suggestive' ? 5 : 0;
}
export function calcLevelB(s: AssessmentInputs): number {
  return bloodInflammScore(s) + (s.antidnase ? 5 : 0) + (s.pr ? 3 : 0) + echoScore(s);
}

export interface Interp {
  label: string;
  level: TierLevel;
  range: string;
}

export function getInterp(scoreA: number, scoreB: number): Interp {
  // Level B > 6 independently confirms ARF (clinical-team note); takes precedence
  // over the combined-total tiers below.
  if (scoreB > 6) return { label: 'Positive ARF (Level B confirmed)', level: 'confirmed', range: 'Level B > 6' };
  const score = scoreA + scoreB;
  if (score <= 5) return { label: 'ARF Unlikely', level: 'unlikely', range: 'Score 0–5' };
  if (score <= 9) return { label: 'ARF Possible', level: 'possible', range: 'Score 6–9' };
  if (score <= 14) return { label: 'ARF Likely', level: 'likely', range: 'Score 10–14' };
  return { label: 'ARF Highly Likely', level: 'urgent', range: 'Score ≥15' };
}

export function getActions(scoreA: number, scoreB: number): string[] {
  // Level B > 6 confirms ARF — initiate the full management protocol.
  if (scoreB > 6) {
    return [
      'Positive ARF confirmed (Level B > 6) — initiate management protocol',
      'Start Benzathine Penicillin G (BPG) prophylaxis',
      'Refer to secondary care for full evaluation',
      'Initiate long-term secondary prophylaxis plan',
      'Educate patient and family about RHD',
    ];
  }
  const score = scoreA + scoreB;
  if (score <= 5) {
    return [
      'Treat according to clinical diagnosis',
      'Arrange appropriate follow-up',
      'Reassess if fever persists or symptoms change',
    ];
  }
  if (score <= 9) {
    return [
      'ARF is possible — do not dismiss',
      'Start Benzathine Penicillin G (BPG) prophylaxis',
      'Refer to secondary care for confirmation',
      'Document findings and initiate prophylaxis plan',
    ];
  }
  if (score <= 14) {
    return [
      'ARF is likely — act promptly',
      'Start Benzathine Penicillin G (BPG) prophylaxis immediately',
      'Refer to secondary care for full evaluation',
      'Initiate long-term secondary prophylaxis plan',
      'Educate patient and family about RHD',
    ];
  }
  return [
    'ARF is highly likely — urgent action required',
    'Start Benzathine Penicillin G (BPG) prophylaxis now',
    'Urgent referral to secondary care',
    'Monitor for cardiac complications',
    'Initiate long-term secondary prophylaxis plan',
  ];
}

const jointLabel: Record<number, string | null> = {
  0: null,
  2: 'Monoarthralgia',
  3: 'Polyarthralgia',
  5: 'Migratory Polyarthritis',
};

/**
 * Level A breakdown saved to the record (mirrors buildBreakdownArray in HTML).
 * Uses the correct severity keys (sob/edema/chestpain/walking).
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
    if (s.chestpain) sev.push('Chest pain');
    if (s.walking) sev.push("Can't walk normal distances");
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
  if (!s.naBlood && (s.wbc || s.aso || s.esr)) {
    const markers: string[] = [];
    if (s.wbc) markers.push('WBC');
    if (s.aso) markers.push('ASO');
    if (s.esr) markers.push('ESR/CRP');
    rows.push({ label: 'Inflammation markers (' + markers.join(', ') + ')', points: 3 });
  }
  if (!s.naBlood && s.antidnase) rows.push({ label: 'Anti-DNase B positive', points: 5 });
  if (!s.naEcg && s.pr) rows.push({ label: 'Prolonged PR interval', points: 3 });
  if (!s.naEcho && s.echo === 'suggestive') rows.push({ label: 'Echocardiogram — Suggestive', points: 5 });
  return rows;
}

/**
 * LIVE display rows for Level A on Steps 4 & 6 — mirrors the HTML's
 * renderBreakdown() / showFinalResult() inline code (L3213 / L3261). NOTE: these
 * are DIFFERENT from buildBreakdownArray (the saved breakdown shown in record
 * detail): the live display OMITS the chorea row, labels carditis
 * "Murmur / Carditis Signs", and the severity sub-row only ever lists
 * "Murmur" / "Chest pain" (the HTML refs S.dyspnea/S.exercise/S.palp which are
 * never in state, so SOB/Edema/walking do not appear here — a quirk carried
 * over from the original HTML port).
 */
function liveLevelARows(s: AssessmentInputs): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  if (s.joint > 0 && jointLabel[s.joint]) rows.push({ label: jointLabel[s.joint] as string, points: s.joint });
  if (carditisScore(s)) {
    rows.push({ label: 'Murmur / Carditis Signs', points: 5 });
    const syms: string[] = [];
    if (s.murmur) syms.push('Murmur');
    if (s.chestpain) syms.push('Chest pain');
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
      if (s.wbc || s.aso || s.esr) {
        const markers: string[] = [];
        if (s.wbc) markers.push('WBC');
        if (s.aso) markers.push('ASO');
        if (s.esr) markers.push('ESR/CRP');
        rows.push({ label: 'Inflammation markers (' + markers.join(', ') + ')', points: 3 });
      }
      if (s.antidnase) rows.push({ label: 'Anti-DNase B positive', points: 5 });
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
