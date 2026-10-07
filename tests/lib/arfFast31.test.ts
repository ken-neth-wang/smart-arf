import {
  ALT_EXPLANATION_RULE, FAST31_JOINTS, automatic31Reasons,
  applyScreeningAmendment, diffFast31, emptyFast31, fast31Breakdown, fast31Result,
  fast31ScoringSnapshot, fast31Validation, isFast31, mergeCareRecord, parseActionAt,
  restoreFast31,
} from '@/lib/arfFast31';
import { newAssessmentInputs, restoreAssessmentInputs } from '@/lib/arfFast';
import type { AssessmentInputs } from '@/lib/types';
import type { Fast31Inputs } from '@/lib/arfFast31';

function complete(patch: Partial<Fast31Inputs> = {}): AssessmentInputs {
  const s = newAssessmentInputs();
  Object.assign(s.arfFast31!, {
    entryReviewed: true, urgentAcknowledged: true, automaticReviewed: true,
    joint: 'none', measuredFever: false, familyHistory: 'no', previousArfRhd: 'no',
    ...patch,
  });
  return s;
}

describe('ARF-FAST v3.1 wording constants', () => {
  it('states the alternative-explanation rule as the document does', () => {
    expect(ALT_EXPLANATION_RULE).toMatch(/clearly and sufficiently explained/);
    expect(ALT_EXPLANATION_RULE).toMatch(/does not itself exclude ARF/);
    expect(ALT_EXPLANATION_RULE).toMatch(/keep the finding/i);
  });
  it('describes arthralgia as without objective arthritis, not as no swelling', () => {
    for (const j of FAST31_JOINTS.filter(j => j.id.includes('arthralgia'))) {
      expect(j.desc).toMatch(/without objective arthritis/);
      expect(j.desc ?? '').not.toMatch(/no swelling/);
    }
  });
});

describe('ARF-FAST v3.1 scoring', () => {
  for (const joint of FAST31_JOINTS) {
    for (const fever of [false, true]) for (const family of ['no', 'unknown', 'yes'] as const) for (const prev of ['no', 'unknown', 'yes'] as const) {
      it(`${joint.id}, fever=${fever}, family=${family}, prev=${prev}`, () => {
        const s = complete({ joint: joint.id, measuredFever: fever, familyHistory: family, previousArfRhd: prev });
        const score = joint.points + Number(fever) + Number(family === 'yes') + Number(prev === 'yes');
        expect(fast31Result(s)).toMatchObject({
          method: 'score', scoreA: score,
          label: score >= 2 ? 'ARF-FAST positive — suspected ARF' : 'ARF-FAST negative — ARF treatment/referral threshold not met',
        });
        expect(fast31Validation(s)).toBeNull();
      });
    }
  }
  it('unknown family history and previous ARF/RHD score zero without becoming "no"', () => {
    const s = complete({ familyHistory: 'unknown', previousArfRhd: 'unknown' });
    expect(fast31Result(s).scoreA).toBe(0);
    expect(s.arfFast31!.familyHistory).toBe('unknown');
  });
  it('treats an unfinished form as a workflow state, never a third classification', () => {
    const s = complete({ joint: null });
    expect(fast31Result(s)).toMatchObject({ method: 'incomplete', scoreA: null });
    expect(fast31Result(s).label).toBe('Assessment incomplete');
    expect(fast31Validation(s)).toMatch(/Answer all scoring questions/);
  });
});

describe('automatic-positive features (definitions with carve-outs)', () => {
  it('chorea qualifies only with preserved awareness', () => {
    const s = complete({ chorea: true, choreaEpisodicBlackout: false, joint: null });
    expect(automatic31Reasons(s.arfFast31).map(r => r.id)).toEqual(['chorea']);
    expect(fast31Result(s).method).toBe('automatic');
    expect(fast31Result(s).scoreA).toBeNull();
  });
  it('episodic loss of awareness disqualifies chorea and demands the neurological pathway', () => {
    const s = complete({ chorea: true, choreaEpisodicBlackout: true });
    expect(automatic31Reasons(s.arfFast31).map(r => r.id)).toEqual([]);
    expect(fast31Result(s).method).toBe('score');
  });
  it('an unanswered awareness question blocks saving, not silently qualifying', () => {
    const s = complete({ chorea: true, choreaEpisodicBlackout: null });
    expect(fast31Validation(s)).toMatch(/awareness/);
  });
  it('murmur qualifies unless it is a documented innocent murmur alone', () => {
    expect(automatic31Reasons(complete({ murmur: true, murmurDocumentedInnocent: false }).arfFast31).map(r => r.id)).toEqual(['murmur']);
    expect(automatic31Reasons(complete({ murmur: true, murmurDocumentedInnocent: true }).arfFast31).map(r => r.id)).toEqual([]);
    expect(fast31Validation(complete({ murmur: true, murmurDocumentedInnocent: null }))).toMatch(/innocent murmur/);
  });
  it('breathlessness alone never qualifies; each companion finding does', () => {
    expect(automatic31Reasons(complete({ breathlessness: true, orthopnea: false, edema: false, activityReduction: false }).arfFast31).map(r => r.id)).toEqual([]);
    for (const companion of [
      { orthopnea: true, edema: false, activityReduction: false },
      { orthopnea: false, edema: true, activityReduction: false },
      { orthopnea: false, edema: false, activityReduction: true },
    ] as const) {
      expect(automatic31Reasons(complete({ breathlessness: true, ...companion }).arfFast31).map(r => r.id)).toEqual(['carditis']);
    }
    expect(fast31Validation(complete({ breathlessness: true, orthopnea: null, edema: null, activityReduction: null }))).toMatch(/companion/);
  });
  it('skin manifestations qualify individually', () => {
    expect(automatic31Reasons(complete({ em: true }).arfFast31).map(r => r.id)).toEqual(['skin']);
    expect(automatic31Reasons(complete({ sn: true }).arfFast31).map(r => r.id)).toEqual(['skin']);
  });
  it('migratory polyarthritis qualifies and is never double-counted in the joint score', () => {
    const s = complete({ migratoryArthritis: true, joint: 'none' });
    expect(fast31Result(s)).toMatchObject({ method: 'automatic', scoreA: null });
  });
  it('scoring features and legacy fields never act as automatic positives', () => {
    const s = complete({ joint: 'polyarthritis' });
    s.choreaPositive = true; s.murmur = true; s.em = true; s.echo = 'suggestive'; s.aso = true;
    expect(automatic31Reasons(s.arfFast31)).toEqual([]);
    expect(fast31Result(s).method).toBe('score');
  });
});

describe('v3 snapshot — no Level B, no combined interpretation', () => {
  it('stores the score, null level, and no action strings', () => {
    const s = complete({ joint: 'polyarthralgia' });
    const snap = fast31ScoringSnapshot(s);
    expect(snap).toMatchObject({ score: 2, level: null, resultLabel: 'ARF-FAST positive — suspected ARF', actions: [] });
    expect(snap.range).toBe('ARF-FAST score / 7');
    expect(snap.breakdown!.some(r => r.label.includes('Level B'))).toBe(false);
    expect(snap.breakdown!.some(r => r.kind === 'total')).toBe(false);
  });
  it('uses the no-scoring-required range for automatic positives', () => {
    const snap = fast31ScoringSnapshot(complete({ chorea: true, choreaEpisodicBlackout: false, joint: null }));
    expect(snap.score).toBeNull();
    expect(snap.range).toBe('Automatic-positive criteria met — numerical scoring not required');
    expect(fast31Breakdown(complete({ chorea: true, choreaEpisodicBlackout: false, joint: null })).some(r => r.label.includes('numerical scoring not required'))).toBe(true);
  });
});

describe('restore keeps v3 answers exactly as saved', () => {
  it('fills missing keys without converting unanswered to no', () => {
    const s = newAssessmentInputs();
    s.arfFast31!.familyHistory = 'unknown';
    const restored = restoreAssessmentInputs(JSON.parse(JSON.stringify(s)));
    expect(restored.assessmentVersion).toBe(3);
    expect(isFast31(restored)).toBe(true);
    expect(restored.arfFast31!.familyHistory).toBe('unknown');
    expect(restored.arfFast31!.measuredFever).toBeNull();
    expect(restoreFast31(null)).toEqual(emptyFast31());
  });
});

describe('urgent check is informational, never a gate', () => {
  it('v3 saves without the urgent acknowledgement ticked', () => {
    const s = complete({ urgentAcknowledged: false });
    expect(fast31Validation(s)).toBeNull();
  });
});

describe('care record stamping', () => {
  it('stamps action time and recorded time on first save, with defaults', () => {
    const care = mergeCareRecord(null, { bpgAction: 'given', referred: true }, '2026-09-01T08:00:00.000Z', { provider: 'Dr A', facility: 'Clinic X' });
    expect(care).toMatchObject({ bpgAction: 'given', referred: true, actionAt: '2026-09-01T08:00:00.000Z', recordedAt: '2026-09-01T08:00:00.000Z', provider: 'Dr A', facility: 'Clinic X' });
  });
  it('a later Part B save does not refresh the action time; an explicit edit does', () => {
    const first = mergeCareRecord(null, { bpgAction: 'given' }, '2026-09-01T08:00:00.000Z', { provider: 'Dr A', facility: 'Clinic X' });
    const later = mergeCareRecord(first, { bpgAction: 'not-given' }, '2026-10-01T00:00:00.000Z', { provider: '', facility: '' });
    expect(later.actionAt).toBe('2026-09-01T08:00:00.000Z');
    expect(later.recordedAt).toBe('2026-09-01T08:00:00.000Z');
    expect(later.bpgAction).toBe('not-given');
    const edited = mergeCareRecord(first, { actionAt: '2026-09-02T09:00:00.000Z' }, '2026-10-01T00:00:00.000Z', { provider: '', facility: '' });
    expect(edited.actionAt).toBe('2026-09-02T09:00:00.000Z');
    expect(edited.recordedAt).toBe('2026-09-01T08:00:00.000Z');
  });
  it('parses action times as local date-time or ISO, and rejects garbage', () => {
    expect(parseActionAt('', new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-01T00:00:00.000Z');
    expect(parseActionAt('2026-09-01 08:30')).toBe(new Date('2026-09-01T08:30:00').toISOString());
    expect(parseActionAt('not a date')).toBe('invalid');
  });
});

describe('screening lock + amendment trail', () => {
  it('records who/when/before/after with the reason, and freezes the first original', () => {
    const saved = complete({ joint: 'monoarthralgia' });
    const corrected = { ...saved.arfFast31!, joint: 'polyarthralgia' as const };
    const { inputs, amendments } = applyScreeningAmendment(saved, corrected, 'typo at entry', 'Dr A', '2026-09-05T00:00:00.000Z');
    expect(amendments).toEqual([{
      at: '2026-09-05T00:00:00.000Z', by: 'Dr A', reason: 'typo at entry',
      field: 'Joint manifestation category', before: 'monoarthralgia', after: 'polyarthralgia',
    }]);
    expect(inputs.arfFast31!.joint).toBe('polyarthralgia');
    expect(inputs.screeningOriginal!.joint).toBe('monoarthralgia');
    expect(inputs.screeningAmendments).toHaveLength(1);
  });
  it('appends a second amendment but keeps the first-ever answers', () => {
    const base = complete({ familyHistory: 'unknown' });
    const first = applyScreeningAmendment(base, { ...base.arfFast31!, familyHistory: 'yes' as const }, 'r1', 'Dr A', '2026-09-05T00:00:00.000Z');
    const second = applyScreeningAmendment(first.inputs, { ...first.inputs.arfFast31!, previousArfRhd: 'yes' as const }, 'r2', 'Dr B', '2026-09-06T00:00:00.000Z');
    expect(second.inputs.screeningAmendments).toHaveLength(2);
    expect(second.inputs.screeningOriginal!.familyHistory).toBe('unknown');
    expect(second.inputs.screeningOriginal!.previousArfRhd).toBe('no');
  });
  it('reports no changes when answers are identical', () => {
    const saved = complete();
    expect(diffFast31(saved.arfFast31!, saved.arfFast31!)).toEqual([]);
    expect(applyScreeningAmendment(saved, saved.arfFast31!, 'r', 'Dr', 'now').amendments).toEqual([]);
  });
});
