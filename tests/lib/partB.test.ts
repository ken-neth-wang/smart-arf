import {
  emptyPartB, emptyPartBData, emptyPartBDiagnosis, normalizePartB, restorePartB, validatePartB,
  type PartBData, type PartBDiagnosis,
} from '@/lib/partB';
import { newAssessmentInputs } from '@/lib/arfFast';

function form(inv: Partial<PartBData> = {}, dx: Partial<PartBDiagnosis> = {}): { investigations: PartBData; diagnosis: PartBDiagnosis } {
  return { investigations: { ...emptyPartBData(), ...inv }, diagnosis: { ...emptyPartBDiagnosis(), ...dx } };
}

describe('Part B validation — unanswered is allowed everywhere', () => {
  it('accepts a completely empty form (the printed form has no digital-only required fields)', () => {
    const { investigations, diagnosis } = form();
    expect(validatePartB(investigations, diagnosis)).toBeNull();
  });
  it('keeps not done, negative/normal, uncertain, and unanswered distinct', () => {
    const { investigations } = form({ esrDone: false, throatCulture: 'not-done', rapidGas: 'negative', echoStatus: 'abnormal', echoMrPathological: 'uncertain' });
    expect(investigations.esrDone).toBe(false);
    expect(investigations.esrValue).toBe('');
    expect(investigations.throatCulture).toBe('not-done');
    expect(investigations.rapidGas).toBe('negative');
    expect(investigations.echoMrPathological).toBe('uncertain');
    expect(investigations.ecgStatus).toBe('');
  });
});

describe('Part B validation — contradictions and formats', () => {
  it('rejects a value entered for a test marked not done', () => {
    const esr = form({ esrDone: false, esrValue: '42' });
    expect(validatePartB(esr.investigations, esr.diagnosis)).toMatch(/ESR/);
    const crp = form({ crpDone: false, crpValue: '5' });
    expect(validatePartB(crp.investigations, crp.diagnosis)).toMatch(/CRP/);
    const aso = form({ asoDone: false, asoPairedRise: 'yes' });
    expect(validatePartB(aso.investigations, aso.diagnosis)).toMatch(/ASO/);
  });
  it('requires numbers where the field is numeric', () => {
    const esr = form({ esrDone: true, esrValue: 'forty' });
    expect(validatePartB(esr.investigations, esr.diagnosis)).toMatch(/ESR must be a number/);
    const pr = form({ ecgStatus: 'done', ecgPrMs: 'long' });
    expect(validatePartB(pr.investigations, pr.diagnosis)).toMatch(/PR interval/);
    const uln = form({ dnaseDone: true, dnaseUpperLimit: 'high' });
    expect(validatePartB(uln.investigations, uln.diagnosis)).toMatch(/upper reference limit/);
  });
  it('requires the CRP unit when a CRP value is present', () => {
    const crp = form({ crpDone: true, crpValue: '12' });
    expect(validatePartB(crp.investigations, crp.diagnosis)).toMatch(/unit/);
    const ok = form({ crpDone: true, crpValue: '12', crpUnit: 'mg/L' });
    expect(validatePartB(ok.investigations, ok.diagnosis)).toBeNull();
  });
  it('PR answers apply only when the ECG was done', () => {
    const notDone = form({ ecgStatus: 'not-done', ecgPrMs: '160', ecgProlongedForAge: 'yes' });
    expect(validatePartB(notDone.investigations, notDone.diagnosis)).toMatch(/only when the ECG was done/);
    const notReported = form({ ecgStatus: 'not-reported', ecgProlongedForAge: 'no' });
    expect(validatePartB(notReported.investigations, notReported.diagnosis)).toMatch(/only when the ECG was done/);
  });
  it('valve and report answers apply only when echo was performed', () => {
    const no = form({ echoStatus: 'not-done', echoMrPathological: 'yes' });
    expect(validatePartB(no.investigations, no.diagnosis)).toMatch(/only when echocardiography was performed/);
    const unanswered = form({ echoStatus: '', echoOther: 'mild MR' });
    expect(validatePartB(unanswered.investigations, unanswered.diagnosis)).toMatch(/only when echocardiography was performed/);
    const ok = form({ echoStatus: 'normal', echoMrPathological: 'no', echoArPathological: 'no' });
    expect(validatePartB(ok.investigations, ok.diagnosis)).toBeNull();
  });
});

describe('B2 — final study reference classification', () => {
  it('requires a reason for Unable to classify — completed but uncertain is valid', () => {
    const missing = form({}, { assessmentCompleted: 'yes', classification: 'unable' });
    expect(validatePartB(missing.investigations, missing.diagnosis)).toMatch(/Unable to classify requires a main reason/);
    const uncertain = form({}, { assessmentCompleted: 'yes', classification: 'unable', unableReason: 'completed but indeterminate' });
    expect(validatePartB(uncertain.investigations, uncertain.diagnosis)).toBeNull();
  });
  it('requires a reason for Unable to classify when the assessment is incomplete too', () => {
    const incomplete = form({}, { assessmentCompleted: 'no', notCompletedReason: 'echo pending', classification: 'unable', unableReason: 'workup unfinished' });
    expect(validatePartB(incomplete.investigations, incomplete.diagnosis)).toBeNull();
    const noReason = form({}, { assessmentCompleted: 'no', notCompletedReason: 'echo pending', classification: 'unable' });
    expect(validatePartB(noReason.investigations, noReason.diagnosis)).toMatch(/Unable to classify requires/);
  });
  it('requires the reason when the diagnostic assessment is marked not completed', () => {
    const missing = form({}, { assessmentCompleted: 'no' });
    expect(validatePartB(missing.investigations, missing.diagnosis)).toMatch(/not completed/);
  });
  it('never infers a classification from investigation values', () => {
    const strongLabs = form({ esrDone: true, esrValue: '120', crpDone: true, crpValue: '180', crpUnit: 'mg/L', asoDone: true, asoValue: '1200', throatCulture: 'positive', ecgStatus: 'done', ecgPrMs: '220', ecgProlongedForAge: 'yes', echoStatus: 'abnormal', echoMrPathological: 'yes' });
    expect(validatePartB(strongLabs.investigations, strongLabs.diagnosis)).toBeNull();
    expect(strongLabs.diagnosis.classification).toBe('');
  });
});

describe('normalize + restore', () => {
  it('trims free text and drops basis/episode when the classification is not definite/probable', () => {
    const { investigations, diagnosis } = normalizePartB(
      { ...emptyPartBData(), echoOther: '  mild MR  ', otherInvestigations: ' x ' },
      { ...emptyPartBDiagnosis(), classification: 'excluded', basis: 'two-major-gas', episode: 'first', treatingTeamDx: ' viral ' },
    );
    expect(investigations.echoOther).toBe('mild MR');
    expect(investigations.otherInvestigations).toBe('x');
    expect(diagnosis.basis).toBe('');
    expect(diagnosis.episode).toBe('');
    expect(diagnosis.treatingTeamDx).toBe('viral');
  });
  it('keeps basis/episode for definite/probable', () => {
    const { diagnosis } = normalizePartB(emptyPartBData(), { ...emptyPartBDiagnosis(), classification: 'definite-probable', basis: 'isolated-chorea', episode: 'recurrent' });
    expect(diagnosis.basis).toBe('isolated-chorea');
    expect(diagnosis.episode).toBe('recurrent');
  });
  it('restore fills missing keys without inventing answers', () => {
    const inputs = newAssessmentInputs();
    inputs.partB = { investigations: { ...emptyPartBData(), esrDone: true }, diagnosis: emptyPartBDiagnosis(), savedAt: '', savedBy: '' };
    const restored = restorePartB(inputs);
    expect(restored.investigations.esrValue).toBe('');
    expect(restored.investigations.crpDone).toBeNull();
    expect(restorePartB(null)).toEqual(emptyPartB());
  });
});
