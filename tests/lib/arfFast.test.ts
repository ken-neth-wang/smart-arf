import { AUTO_FEATURES, FAST_JOINTS, automaticReasons, emptyFast, fastBreakdown, fastResult, fastScoringSnapshot, fastValidation, isFast, newAssessmentInputs, restoreAssessmentInputs } from '@/lib/arfFast';
import { isFast31 } from '@/lib/arfFast31';
import { calcLevelA, getInterp, getLevelAInterp } from '@/lib/scoring';
import { emptyInputs, type AssessmentInputs } from '@/lib/types';

/** Version-2 inputs are no longer the wizard default (new = v3); saved v2
 *  records keep this shape, so tests build it explicitly. */
function v2(): AssessmentInputs {
  return { ...emptyInputs(), assessmentVersion: 2, arfFast: emptyFast() };
}

function complete() {
  const s = v2();
  Object.assign(s.arfFast!, { entryReviewed: true, urgentAcknowledged: true, automaticReviewed: true, joint: 'none', measuredFever: false, familyHistory: false, previousArfRhd: false });
  return s;
}

describe('assessment versions', () => {
  it('starts new assessments at v3 and restores each saved version as saved', () => {
    expect(newAssessmentInputs().assessmentVersion).toBe(3);
    expect(isFast31(newAssessmentInputs())).toBe(true);
    expect(isFast(newAssessmentInputs())).toBe(true);
    const savedV2 = v2();
    expect(isFast(savedV2)).toBe(true);
    expect(isFast31(savedV2)).toBe(false);
    const original = { ...emptyInputs(), joint: 3, aso: true };
    const restored = restoreAssessmentInputs(JSON.parse(JSON.stringify(original)));
    expect(restored.assessmentVersion).toBe(1);
    expect(restored.arfFast).toBeUndefined();
    expect(restored.arfFast31).toBeUndefined();
    expect(calcLevelA(restored)).toBe(3);
    expect(getLevelAInterp(calcLevelA(restored)).label).toBe('ARF ruled out');
    expect(getInterp(calcLevelA(restored), 5).label).toBe('ARF Likely');
    expect(original).not.toHaveProperty('assessmentVersion');
  });
  it('round trips new answers and automatic reasons without converting missing answers to no', () => {
    const s = v2();
    s.arfFast!.automatic.murmur = true;
    const restored = restoreAssessmentInputs(JSON.parse(JSON.stringify(s)));
    expect(restored).toEqual(s);
    expect(restored.arfFast!.measuredFever).toBeNull();
    expect(automaticReasons(restored).map(f => f.id)).toEqual(['murmur']);
  });
});

describe('ARF-FAST rules', () => {
  for (const joint of FAST_JOINTS) {
    for (const fever of [false, true]) for (const family of [false, true]) for (const history of [false, true]) {
      it(`${joint.id}, fever=${fever}, family=${family}, history=${history}`, () => {
        const s = complete();
        Object.assign(s.arfFast!, { joint: joint.id, measuredFever: fever, familyHistory: family, previousArfRhd: history });
        const score = joint.points + Number(fever) + Number(family) + Number(history);
        expect(fastResult(s)).toMatchObject({ method: 'score', scoreA: score, label: score >= 2 ? 'ARF-FAST positive' : 'ARF-FAST negative' });
        expect(fastValidation(s)).toBeNull();
      });
    }
  }
  it.each(AUTO_FEATURES)('bypasses scoring for $id, with no artificial zero', ({ id }) => {
    const s = complete();
    s.arfFast!.joint = null;
    s.arfFast!.automatic[id] = true;
    expect(fastResult(s)).toMatchObject({ method: 'automatic', scoreA: null, label: 'ARF-FAST positive' });
    expect(fastScoringSnapshot(s, false).score).toBeNull();
    expect(fastValidation(s)).toBeNull();
  });
  it('does not use screening findings or old scoring fields as automatic positives', () => {
    const s = complete();
    s.arfFast!.entry.murmur = true;
    s.choreaPositive = true; s.joint = 5; s.murmur = true;
    expect(fastResult(s)).toMatchObject({ method: 'score', scoreA: 0, label: 'ARF-FAST negative' });
  });
  it('does not classify an unanswered numerical assessment as negative', () => {
    const s = complete();
    s.arfFast!.measuredFever = null;
    expect(fastResult(s)).toMatchObject({ method: 'incomplete', scoreA: null });
    expect(fastValidation(s)).toMatch(/Answer all/);
  });
  it('requires reviewed entry/automatic checks; the urgent acknowledgement is informational, not a gate', () => {
    const s = complete();
    s.arfFast!.urgentAcknowledged = false;
    expect(fastValidation(s)).toBeNull();
    s.arfFast!.automaticReviewed = false;
    expect(fastValidation(s)).toMatch(/automatic/);
    s.arfFast!.entryReviewed = false;
    expect(fastValidation(s)).toMatch(/entry/);
  });
  it('removes the automatic override when its last feature is deselected', () => {
    const s = complete();
    s.arfFast!.automatic.skin = true;
    expect(fastResult(s).method).toBe('automatic');
    s.arfFast!.automatic.skin = false;
    expect(fastResult(s)).toMatchObject({ method: 'score', scoreA: 0 });
  });
});

describe('separate Level B results', () => {
  it('keeps the two subtotals but never creates a combined score, tier, or recommendations', () => {
    const s = complete(); s.arfFast!.joint = 'polyarthralgia'; s.aso = true;
    const saved = fastScoringSnapshot(s, true);
    expect(saved).toMatchObject({ score: null, level: null, resultLabel: 'ARF-FAST positive', actions: [] });
    expect(saved.inputs!.arfFast!.result).toMatchObject({ scoreA: 2, scoreB: 5, combinedInterpretation: 'pending' });
    expect(saved.breakdown!.some(r => r.label === 'Total')).toBe(false);
  });
  it('does not double count grouped tests, and excludes unavailable tests', () => {
    const s = complete();
    Object.assign(s, { wbc: true, esr: true, aso: true, antidnase: true, pr: true, echo: 'suggestive' });
    expect(fastResult(s, true).scoreB).toBe(16);
    Object.assign(s, { naBlood: true, naEcg: true, naEcho: true });
    expect(fastResult(s, true).scoreB).toBe(0);
    expect(fastBreakdown(s, true).filter(r => r.label.includes('not available')).every(r => r.points === null)).toBe(true);
  });
  it('retains Level B points for an unscored automatic positive', () => {
    const s = complete(); s.arfFast!.automatic.carditis = true; s.pr = true;
    expect(fastScoringSnapshot(s, true).inputs!.arfFast!.result).toMatchObject({ method: 'automatic', scoreA: null, scoreB: 3, combinedInterpretation: 'pending' });
  });
});
