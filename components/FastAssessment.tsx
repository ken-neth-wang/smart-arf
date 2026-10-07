import React, { useState } from 'react';
import { Text } from 'react-native';
import { useAssessment } from '@/state/AssessmentContext';
import { AUTO_FEATURES, ENTRY_FEATURES, FAST_JOINTS, automaticReasons, emptyFast, fastResult, type FastInputs } from '@/lib/arfFast';
import { Alert, Card, CardSubtitle, CardTitle, CheckboxRow, PrimaryButton, RadioList, SecondaryButton, StepBadge, TextField, YesNoGroup } from './ui/primitives';
import { Colors } from '@/constants/theme';

function useFastForm() {
  const assessment = useAssessment();
  const form = assessment.inputs.arfFast ?? emptyFast();
  const patch = (change: Partial<FastInputs>) => assessment.setInputs({ arfFast: { ...form, ...change, result: undefined } });
  return { ...assessment, form, patch };
}
export function FastEntry() {
  const { form, patch, goStep } = useFastForm();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const next = () => {
    if (!Object.values(form.entry).some(Boolean) && !confirmEmpty) { setConfirmEmpty(true); return; }
    patch({ entryReviewed: true });
    goStep('urgent');
  };
  return <Card>
    <StepBadge>Step 2 — Entry Criteria</StepBadge>
    <CardTitle>Entry Criteria</CardTitle>
    <CardSubtitle>Check any that apply to this patient.</CardSubtitle>
    {ENTRY_FEATURES.map(f => <CheckboxRow key={f.id} label={f.label} sub={f.description} checked={form.entry[f.id]} onToggle={() => { patch({ entry: { ...form.entry, [f.id]: !form.entry[f.id] }, entryReviewed: false }); setConfirmEmpty(false); }} />)}
    <Alert variant="warning">Do not use isolated fever alone as an entry feature. Do not exclude ARF merely because another illness is present.</Alert>
    {confirmEmpty && <Alert variant="warning">No entry features selected. Review the checklist, or confirm to continue the assessment. This does not assign a negative result.</Alert>}
    <PrimaryButton title={confirmEmpty ? 'Confirm and Continue' : 'Continue'} onPress={next} />
    <SecondaryButton title="Back" onPress={() => goStep(1)} />
  </Card>;
}
/** Informational page for the instrument's Step 2 — wording only, no
 *  acknowledgement, nothing recorded. Shared by v2 and v3 flows. */
export function UrgentCheck() {
  const { goStep } = useAssessment();
  return <Card>
    <StepBadge>Step 3 — Urgent / Emergency Needs</StepBadge>
    <CardTitle>First Check for Urgent / Emergency Needs</CardTitle>
    <Alert variant="warning">If the child appears seriously or critically ill, or has any other condition requiring immediate treatment or urgent referral, prioritize emergency assessment, stabilization, and/or referral according to local protocols.</Alert>
    <Alert>Do not delay urgent care in order to complete ARF-FAST. The emergency pathway is a safety rule and is separate from the ARF-FAST positive/negative classification.</Alert>
    <PrimaryButton title="Next" onPress={() => goStep('automatic')} />
    <SecondaryButton title="Back" onPress={() => goStep(2)} />
  </Card>;
}
export function AutomaticFeatures() {
  const { form, patch, goStep, inputs } = useFastForm();
  const automatic = automaticReasons(inputs).length > 0;
  return <Card>
    <StepBadge>Step 4 — Automatic Positive Features</StepBadge><CardTitle>Automatic Positive Features</CardTitle>
    <CardSubtitle>If any item is present, classify as ARF-FAST positive and proceed to BPG per protocol — scoring is not needed.</CardSubtitle>
    {AUTO_FEATURES.map(f => <CheckboxRow key={f.id} label={f.label} sub={f.description} checked={form.automatic[f.id]} onToggle={() => patch({ automatic: { ...form.automatic, [f.id]: !form.automatic[f.id] }, automaticReviewed: false })} />)}
    <CardSubtitle>{automatic ? 'ARF-FAST positive. Continue to clinician sign-off; numerical scoring will be skipped.' : 'If none are present, continue to ARF-FAST scoring.'}</CardSubtitle>
    <PrimaryButton title="Continue" onPress={() => { patch({ automaticReviewed: true }); goStep('fast-score'); }} />
    <SecondaryButton title="Back" onPress={() => goStep('urgent')} />
  </Card>;
}
export function FastScore() {
  const { form, patch, inputs, signedBy, setSignedBy, commitLevelA, goStep } = useFastForm();
  const result = fastResult(inputs);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const questions = [
    { key: 'measuredFever', title: 'B. Fever', description: 'Measured temperature ≥38.0°C at any time during the current illness, at or before this assessment.' },
    { key: 'familyHistory', title: 'C. First-degree family history', description: 'Parent or sibling with medically diagnosed ARF or rheumatic heart disease.' },
    { key: 'previousArfRhd', title: 'D. Previous ARF / established RHD', description: 'Medically documented previous definite ARF or established rheumatic heart disease.' },
  ] as const;
  const save = async () => {
    setSaving(true); setError('');
    try { await commitLevelA(); goStep(4); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Please try again.'); } finally { setSaving(false); }
  };
  return <Card>
    <StepBadge>{result.method === 'automatic' ? 'Level A — Clinician Sign-Off' : 'Step 5 — Level A: ARF-FAST Score'}</StepBadge>
    <CardTitle>{result.method === 'automatic' ? 'ARF-FAST positive — automatic criteria met' : 'ARF-FAST Score'}</CardTitle>
    {result.method === 'automatic' ? <>
      <CardSubtitle>Step 5 scoring is not needed because automatic-positive criteria are met.</CardSubtitle>
      {automaticReasons(inputs).map(f => <Text key={f.id} style={{ color: Colors.text, marginBottom: 8 }}>{f.label}</Text>)}
    </> : <>
      <CardTitle>A. Joint manifestation — choose one</CardTitle>
      <RadioList options={FAST_JOINTS.map(f => ({ ...f, points: `+${f.points}` }))} selectedId={form.joint ?? ''} onSelect={id => patch({ joint: id as FastInputs['joint'] })} />
      {questions.map(q => <React.Fragment key={q.key}>
        <CardTitle>{q.title}</CardTitle><CardSubtitle>{q.description}</CardSubtitle>
        <YesNoGroup value={form[q.key]} onChange={v => patch({ [q.key]: v })} />
        <CardSubtitle>Yes +1 · No 0</CardSubtitle>
      </React.Fragment>)}
      <CardTitle>{result.scoreA == null ? 'Complete all answers to calculate the score' : `Total ARF-FAST score: ${result.scoreA} / 7`}</CardTitle>
      <CardSubtitle>{result.label} · Score ≥2 positive; 0–1 negative.</CardSubtitle>
    </>}
    <TextField label="Person Responsible — Signed by" value={signedBy} onChangeText={setSignedBy} placeholder="Clinician name" />
    {error ? <Alert variant="warning">{error}</Alert> : null}
    <PrimaryButton title={saving ? 'Saving…' : 'View Level A Results'} disabled={saving || !signedBy.trim() || result.method === 'incomplete'} onPress={save} />
    <SecondaryButton title="Back" onPress={() => goStep('automatic')} />
  </Card>;
}
