/**
 * PartBForm — B1 investigations + B2 final study reference classification
 * (case report form master.pdf, pages 4–6), for v3 assessments.
 *
 * Records only: no points, no combined score, no diagnosis inference. Every
 * test keeps "not done", "negative/normal", "uncertain" (echo valves), and
 * "unanswered" distinct. Validation flags contradictions and numeric-format
 * errors; unanswered fields stay allowed.
 */
import React, { useEffect, useState } from 'react';
import { useAssessment } from '@/state/AssessmentContext';
import {
  type EcgStatus, type EchoStatus, type EpisodeType, type DiagnosticBasis,
  type MicroResult, type PartBClassification, type PartBData, type PartBDiagnosis,
  type PairedRise, type ValveAnswer, emptyPartB, restorePartB,
} from '@/lib/partB';
import { Alert, Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, SectionDivider, SelectField, StepBadge, TextField } from './ui/primitives';

const NOT_ANSWERED = { label: '— Not answered —', value: '' };
const DONE_OPTS = [NOT_ANSWERED, { label: 'Done', value: 'done' }, { label: 'Not done', value: 'not-done' }];
const MICRO_OPTS = [NOT_ANSWERED, { label: 'Positive', value: 'positive' }, { label: 'Negative', value: 'negative' }, { label: 'Not done', value: 'not-done' }];
const ECG_OPTS = [NOT_ANSWERED, { label: 'Done', value: 'done' }, { label: 'Not done', value: 'not-done' }, { label: 'Not reported / not measurable', value: 'not-reported' }];
const ECHO_OPTS = [NOT_ANSWERED, { label: 'Not done', value: 'not-done' }, { label: 'Normal', value: 'normal' }, { label: 'Abnormal', value: 'abnormal' }];
const VALVE_OPTS = [NOT_ANSWERED, { label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }, { label: 'Uncertain', value: 'uncertain' }];
const YES_NO_OPTS = [NOT_ANSWERED, { label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }];
const CLASSIFICATION_OPTS = [
  NOT_ANSWERED,
  { label: 'Definite / probable ARF', value: 'definite-probable' },
  { label: 'ARF excluded', value: 'excluded' },
  { label: 'Unable to classify', value: 'unable' },
];
const BASIS_OPTS = [
  NOT_ANSWERED,
  { label: 'Two major manifestations plus evidence of preceding GAS infection', value: 'two-major-gas' },
  { label: 'One major plus two minor manifestations plus evidence of preceding GAS infection', value: 'one-major-two-minor-gas' },
  { label: 'Recurrent ARF: three minor manifestations plus preceding GAS infection, after excluding more likely causes', value: 'recurrent-three-minor-gas' },
  { label: 'Special circumstance: isolated Sydenham chorea', value: 'isolated-chorea' },
  { label: 'Special circumstance: indolent carditis', value: 'indolent-carditis' },
];
const EPISODE_OPTS = [NOT_ANSWERED, { label: 'First', value: 'first' }, { label: 'Recurrent', value: 'recurrent' }, { label: 'Uncertain', value: 'uncertain' }];

/** boolean|null done-state ↔ select value. */
function doneValue(done: boolean | null): string {
  return done == null ? '' : done ? 'done' : 'not-done';
}

export function PartBForm() {
  const { inputs, referralCode, activeEncounterId, commitPartB, goStep } = useAssessment();
  const [data, setData] = useState<PartBData>(emptyPartB().investigations);
  const [dx, setDx] = useState<PartBDiagnosis>(emptyPartB().diagnosis);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeEncounterId) return;
    const stored = restorePartB(inputs);
    setData(stored.investigations);
    setDx(stored.diagnosis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEncounterId]);

  const patch = (p: Partial<PartBData>) => setData((d) => ({ ...d, ...p }));
  const patchDx = (p: Partial<PartBDiagnosis>) => setDx((d) => ({ ...d, ...p }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      await commitPartB(data, dx);
      goStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save. Please try again.');
    } finally { setSaving(false); }
  };

  return <Card>
    <StepBadge>Part B — Definitive Assessment</StepBadge>
    <CardTitle>Investigations &amp; Final Diagnosis</CardTitle>
    <CardSubtitle>
      Complete after the diagnostic assessment is sufficiently complete. Study ID: {inputs.studyId || '(none recorded)'} · Referral code: {referralCode || '—'}
    </CardSubtitle>
    <Alert>
      If a test was repeated during this illness, record the result most relevant to the ARF
      diagnosis: the highest ESR and CRP; the highest antibody value with whether paired samples
      showed a rise; any positive microbiology result; and the ECG / echo findings used for the
      final diagnosis.
    </Alert>

    <SectionDivider label="Blood tests" />
    <SelectField label="ESR — performed?" value={doneValue(data.esrDone)} options={DONE_OPTS} onChange={(v) => patch({ esrDone: v === '' ? null : v === 'done', esrValue: v === 'not-done' ? '' : data.esrValue })} />
    {data.esrDone === true ? <TextField label="ESR result (mm/hour)" value={data.esrValue} onChangeText={(v) => patch({ esrValue: v })} keyboardType="numeric" placeholder="e.g. 42" /> : null}

    <SelectField label="CRP — performed?" value={doneValue(data.crpDone)} options={DONE_OPTS} onChange={(v) => patch({ crpDone: v === '' ? null : v === 'done', crpValue: v === 'not-done' ? '' : data.crpValue, crpUnit: v === 'not-done' ? '' : data.crpUnit })} />
    {data.crpDone === true ? <>
      <TextField label="CRP result" value={data.crpValue} onChangeText={(v) => patch({ crpValue: v })} keyboardType="numeric" placeholder="e.g. 12" />
      <SelectField label="CRP unit" value={data.crpUnit} options={[{ label: '— Select unit —', value: '' }, { label: 'mg/L', value: 'mg/L' }, { label: 'mg/dL', value: 'mg/dL' }]} onChange={(v) => patch({ crpUnit: v as PartBData['crpUnit'] })} />
    </> : null}

    {([['aso', 'ASO titre'], ['dnase', 'Anti-DNase B']] as const).map(([key, label]) => (
      <React.Fragment key={key}>
        <SelectField
          label={`${label} — performed?`}
          value={doneValue(key === 'aso' ? data.asoDone : data.dnaseDone)}
          options={DONE_OPTS}
          onChange={(v) => patch(key === 'aso'
            ? { asoDone: v === '' ? null : v === 'done', asoValue: v === 'not-done' ? '' : data.asoValue, asoUnit: v === 'not-done' ? '' : data.asoUnit, asoUpperLimit: v === 'not-done' ? '' : data.asoUpperLimit, asoPairedRise: v === 'not-done' ? '' : data.asoPairedRise }
            : { dnaseDone: v === '' ? null : v === 'done', dnaseValue: v === 'not-done' ? '' : data.dnaseValue, dnaseUnit: v === 'not-done' ? '' : data.dnaseUnit, dnaseUpperLimit: v === 'not-done' ? '' : data.dnaseUpperLimit, dnasePairedRise: v === 'not-done' ? '' : data.dnasePairedRise })}
        />
        {(key === 'aso' ? data.asoDone : data.dnaseDone) === true ? <>
          <TextField label={`${label} value`} value={key === 'aso' ? data.asoValue : data.dnaseValue} onChangeText={(v) => patch(key === 'aso' ? { asoValue: v } : { dnaseValue: v })} keyboardType="numeric" placeholder="highest value" />
          <TextField label="Unit" value={key === 'aso' ? data.asoUnit : data.dnaseUnit} onChangeText={(v) => patch(key === 'aso' ? { asoUnit: v } : { dnaseUnit: v })} placeholder="e.g. IU/mL" />
          <TextField label="Upper reference limit (same unit)" value={key === 'aso' ? data.asoUpperLimit : data.dnaseUpperLimit} onChangeText={(v) => patch(key === 'aso' ? { asoUpperLimit: v } : { dnaseUpperLimit: v })} keyboardType="numeric" placeholder="e.g. 200" />
          <SelectField
            label="Did paired samples demonstrate a rise?"
            value={key === 'aso' ? data.asoPairedRise : data.dnasePairedRise}
            options={YES_NO_OPTS}
            onChange={(v) => patch(key === 'aso' ? { asoPairedRise: v as PairedRise } : { dnasePairedRise: v as PairedRise })}
          />
        </> : null}
      </React.Fragment>
    ))}

    <SectionDivider label="Microbiology" />
    <SelectField label="Throat culture for GAS" value={data.throatCulture} options={MICRO_OPTS} onChange={(v) => patch({ throatCulture: v as MicroResult })} />
    <SelectField label="Rapid GAS antigen test" value={data.rapidGas} options={MICRO_OPTS} onChange={(v) => patch({ rapidGas: v as MicroResult })} />

    <SectionDivider label="ECG" />
    <SelectField label="ECG — status" value={data.ecgStatus} options={ECG_OPTS} onChange={(v) => patch({ ecgStatus: v as EcgStatus, ecgPrMs: v === 'done' ? data.ecgPrMs : '', ecgProlongedForAge: v === 'done' ? data.ecgProlongedForAge : '' })} />
    {data.ecgStatus === 'done' ? <>
      <TextField label="PR interval (ms)" value={data.ecgPrMs} onChangeText={(v) => patch({ ecgPrMs: v })} keyboardType="numeric" placeholder="e.g. 160" />
      <SelectField
        label="PR interval prolonged for age?"
        value={data.ecgProlongedForAge}
        options={YES_NO_OPTS}
        onChange={(v) => patch({ ecgProlongedForAge: v as PartBData['ecgProlongedForAge'] })}
      />
      <CardSubtitle>Your clinical interpretation — the app holds no age-adjusted cutoff table.</CardSubtitle>
    </> : null}

    <SectionDivider label="Echocardiography with Doppler" />
    <Alert>
      Do not classify physiological regurgitation as pathological. Established RHD alone does not
      establish current ARF.
    </Alert>
    <SelectField label="Echocardiography — result" value={data.echoStatus} options={ECHO_OPTS} onChange={(v) => patch({ echoStatus: v as EchoStatus, echoMrPathological: v === 'normal' || v === 'abnormal' ? data.echoMrPathological : '', echoArPathological: v === 'normal' || v === 'abnormal' ? data.echoArPathological : '', echoOther: v === 'normal' || v === 'abnormal' ? data.echoOther : '' })} />
    {data.echoStatus === 'normal' || data.echoStatus === 'abnormal' ? <>
      <SelectField label="Pathological mitral regurgitation?" value={data.echoMrPathological} options={VALVE_OPTS} onChange={(v) => patch({ echoMrPathological: v as ValveAnswer })} />
      <SelectField label="Pathological aortic regurgitation?" value={data.echoArPathological} options={VALVE_OPTS} onChange={(v) => patch({ echoArPathological: v as ValveAnswer })} />
      <TextField label="Other relevant cardiac finding or diagnosis (from the report)" value={data.echoOther} onChangeText={(v) => patch({ echoOther: v })} multiline placeholder="Free text from the echocardiography report" />
    </> : null}

    <TextField label="Other investigations important to the final diagnosis, if any" value={data.otherInvestigations} onChangeText={(v) => patch({ otherInvestigations: v })} multiline placeholder="Free text" />

    <SectionDivider label="B2 — Final study reference classification" />
    <Alert variant="warning">
      The final study reference classification is the treating team&apos;s diagnosis based on the
      applicable revised Jones criteria and the complete diagnostic assessment. ARF-FAST /
      SMART-ARF classification must not itself be used to establish the final diagnosis. Do not
      classify an incompletely assessed or genuinely uncertain case as &quot;ARF excluded&quot; by default.
    </Alert>
    <SelectField
      label="Diagnostic assessment completed?"
      value={dx.assessmentCompleted}
      options={YES_NO_OPTS}
      onChange={(v) => patchDx({ assessmentCompleted: v as PartBDiagnosis['assessmentCompleted'] })}
    />
    {dx.assessmentCompleted === 'no' ? (
      <TextField label="Reason the assessment was not completed" value={dx.notCompletedReason} onChangeText={(v) => patchDx({ notCompletedReason: v })} multiline placeholder="Required" />
    ) : null}
    <SelectField
      label="Final study reference classification"
      value={dx.classification}
      options={CLASSIFICATION_OPTS}
      onChange={(v) => patchDx({ classification: v as PartBClassification })}
    />
    {dx.classification === 'definite-probable' ? <>
      <SelectField label="Diagnostic basis (definite ARF)" value={dx.basis} options={BASIS_OPTS} onChange={(v) => patchDx({ basis: v as DiagnosticBasis })} />
      <SelectField label="Episode" value={dx.episode} options={EPISODE_OPTS} onChange={(v) => patchDx({ episode: v as EpisodeType })} />
    </> : null}
    {dx.classification === 'unable' ? (
      <TextField
        label="Main reason (required)"
        value={dx.unableReason}
        onChangeText={(v) => patchDx({ unableReason: v })}
        multiline
        placeholder="Incomplete assessment, or completed assessment with an uncertain / indeterminate diagnosis"
      />
    ) : null}
    <TextField label="Final treating-team diagnosis / alternative diagnosis, if established" value={dx.treatingTeamDx} onChangeText={(v) => patchDx({ treatingTeamDx: v })} multiline placeholder="Free text" />

    {error ? <Alert variant="warning">{error}</Alert> : null}
    <PrimaryButton title={saving ? 'Saving…' : 'Save Part B'} disabled={saving} onPress={save} />
    <SecondaryButton title="Back" onPress={() => goStep(4)} />
  </Card>;
}
