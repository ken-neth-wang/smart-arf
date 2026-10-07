/**
 * ARF-FAST v3.1 wizard screens (assessment version 3).
 *
 * v2 screens in FastAssessment.tsx stay frozen for saved version-2 records.
 * v3 differences: intended-use + alternative-explanation wording, structured
 * automatic-positive sub-questions, tri-state history answers, and the
 * screening lock — a saved v3 screening is read-only until an amendment
 * with a stated reason opens it.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useAssessment } from '@/state/AssessmentContext';
import {
  ALT_EXPLANATION_RULE, ENTRY31_FEATURES, FAST31_JOINTS,
  automatic31Reasons, emptyFast31, fast31Result,
  type Fast31Inputs, type Fast31Tri,
} from '@/lib/arfFast31';
import { formatAge } from '@/lib/types';
import { Alert, Card, CardSubtitle, CardTitle, CheckboxRow, FieldLabel, PrimaryButton, RadioList, SecondaryButton, StepBadge, TextField, YesNoGroup } from './ui/primitives';
import { Colors } from '@/constants/theme';

function useFast31Form() {
  const assessment = useAssessment();
  const form = assessment.inputs.arfFast31 ?? emptyFast31();
  const patch = (change: Partial<Fast31Inputs>) => assessment.setInputs({ arfFast31: { ...form, ...change, result: undefined } });
  return { ...assessment, form, patch };
}

/** Lock banner + amendment opener, shared by every v3 screening step. */
export function ScreeningLockBanner() {
  const { screeningLocked, amendReason, startAmend, cancelAmend } = useAssessment();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!screeningLocked && !amendReason) return null;
  return <Card>
    {screeningLocked ? <>
      <Alert variant="warning">
        This screening was saved and is locked. Part A must not be changed after definitive
        investigations. To correct a data-entry error, amend with a reason — the change and the
        original answers stay on the record.
      </Alert>
      <SecondaryButton title="Amend answers…" onPress={() => { setReason(''); setOpen(true); }} />
    </> : <>
      <Alert>
        Amendment in progress — reason: {amendReason}. Save from the scoring step to record the
        correction and its audit trail, or cancel to discard the change.
      </Alert>
      <SecondaryButton title="Cancel amendment" onPress={cancelAmend} />
    </>}
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={lockStyles.bg} onPress={() => setOpen(false)}>
        <Pressable style={lockStyles.box} onPress={() => undefined}>
          <Text style={lockStyles.title}>Amend Screening Answers</Text>
          <Text style={lockStyles.body}>
            State the reason for this correction. The reason, your name, the time, and the
            before/after values are kept on the record and in exports.
          </Text>
          <TextField label="Reason for amendment" value={reason} onChangeText={setReason} placeholder="e.g. Joint category mistyped at entry" multiline />
          <PrimaryButton title="Unlock answers" disabled={reason.trim().length < 3} onPress={() => { startAmend(reason.trim()); setOpen(false); }} />
          <SecondaryButton title="Cancel" onPress={() => setOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  </Card>;
}

export function FastEntry31() {
  const { form, patch, goStep, patient, screeningLocked } = useFast31Form();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const age = formatAge(patient.dateOfBirth, patient.dobApproximate);
  const ageNote = age && (parseInt(age.replace('~', ''), 10) < 3 || parseInt(age.replace('~', ''), 10) > 18)
    ? `Recorded age ${age} is outside the intended 3–18 range. This is context only — it does not block the assessment.`
    : null;
  const next = () => {
    if (!Object.values(form.entry).some(Boolean) && !confirmEmpty) { setConfirmEmpty(true); return; }
    patch({ entryReviewed: true });
    goStep('urgent');
  };
  return <Card>
    <StepBadge>Step 2 — Entry Criteria · ARF-FAST v3.1</StepBadge>
    <CardTitle>Entry Criteria</CardTitle>
    <CardSubtitle>Check any that apply. Entry features say when to use ARF-FAST — they do not by themselves mean ARF-FAST positive.</CardSubtitle>
    {ageNote ? <Alert variant="warning">{ageNote}</Alert> : null}
    {patient.setting === 'nonendemic' ? (
      <Alert variant="warning">Recorded setting is a low-risk (non-endemic) area. ARF-FAST is intended for endemic or moderate/high-risk populations — recorded as context only.</Alert>
    ) : null}
    <Alert variant="warning">{ALT_EXPLANATION_RULE}</Alert>
    {ENTRY31_FEATURES.map(f => (
      <CheckboxRow
        key={f.id}
        label={f.label}
        sub={f.description}
        checked={form.entry[f.id]}
        disabled={screeningLocked}
        onToggle={() => { patch({ entry: { ...form.entry, [f.id]: !form.entry[f.id] }, entryReviewed: false }); setConfirmEmpty(false); }}
      />
    ))}
    <Alert variant="warning">Do not use isolated fever alone as an entry feature. Do not exclude ARF merely because another illness is present — apply the alternative-explanation rule to each finding.</Alert>
    {confirmEmpty && <Alert variant="warning">No entry features selected. Review the checklist, or confirm to continue the assessment. This does not assign a negative result.</Alert>}
    <PrimaryButton title={confirmEmpty ? 'Confirm and Continue' : 'Continue'} onPress={next} />
    <SecondaryButton title="Back" onPress={() => goStep(1)} />
  </Card>;
}

const TRI_OPTS = [
  { id: 'yes', name: 'Yes', desc: '' },
  { id: 'no', name: 'No', desc: '' },
  { id: 'unknown', name: 'Unknown', desc: '' },
];

export function AutomaticFeatures31() {
  const { form, patch, goStep, screeningLocked } = useFast31Form();
  const cardiacPositive = form.breathlessness === true
    && (form.orthopnea === true || form.edema === true || form.activityReduction === true);
  return <Card>
    <StepBadge>Step 4 — Automatic-Positive Features</StepBadge>
    <CardTitle>Automatic-Positive Features</CardTitle>
    <CardSubtitle>If ANY ONE is present and meets its definition, classify as ARF-FAST positive — numerical scoring is not required.</CardSubtitle>
    <Alert variant="warning">{ALT_EXPLANATION_RULE}</Alert>

    <CheckboxRow
      label="A. Possible Sydenham chorea"
      sub="New irregular, unpredictable, non-rhythmic involuntary movements that appear to flow from one body part to another, with preserved awareness — especially with new clumsiness or deterioration in handwriting, feeding, dressing, or walking."
      checked={form.chorea}
      disabled={screeningLocked}
      onToggle={() => patch({ chorea: !form.chorea, choreaEpisodicBlackout: null })}
    />
    {form.chorea ? <>
      <FieldLabel>Do the movements occur ONLY as discrete episodes with loss of awareness, sustained unresponsiveness, or a postictal state?</FieldLabel>
      <YesNoGroup value={form.choreaEpisodicBlackout} disabled={screeningLocked} onChange={v => patch({ choreaEpisodicBlackout: v })} />
      {form.choreaEpisodicBlackout === true ? (
        <Alert variant="warning">Episodes with loss of awareness do NOT fulfill the chorea trigger and require urgent neurological assessment.</Alert>
      ) : null}
    </> : null}

    <CheckboxRow
      label="B1. Murmur suggestive of mitral/aortic valvular involvement"
      sub="Any diastolic murmur, or a clearly pansystolic/holosystolic murmur best heard at the apex (especially if radiating toward the left axilla)."
      checked={form.murmur}
      disabled={screeningLocked}
      onToggle={() => patch({ murmur: !form.murmur, murmurDocumentedInnocent: null })}
    />
    {form.murmur ? <>
      <FieldLabel>Is this a previously evaluated and documented innocent murmur (and nothing more)?</FieldLabel>
      <YesNoGroup value={form.murmurDocumentedInnocent} disabled={screeningLocked} onChange={v => patch({ murmurDocumentedInnocent: v })} />
      {form.murmurDocumentedInnocent === true ? (
        <Alert variant="warning">A previously evaluated and documented innocent murmur alone does not fulfill this trigger.</Alert>
      ) : null}
    </> : null}

    <FieldLabel>B2. Significant recent breathlessness — new or clearly worsened, at rest or with usual activity</FieldLabel>
    <YesNoGroup value={form.breathlessness} disabled={screeningLocked} onChange={v => patch({ breathlessness: v })} />
    {form.breathlessness === true ? <>
      <FieldLabel>1. Orthopnea — worse lying flat, relieved sitting up or propped up</FieldLabel>
      <YesNoGroup value={form.orthopnea} disabled={screeningLocked} onChange={v => patch({ orthopnea: v })} />
      <FieldLabel>2. Edema — bilateral swelling of feet, ankles, or legs, or generalized body swelling</FieldLabel>
      <YesNoGroup value={form.edema} disabled={screeningLocked} onChange={v => patch({ edema: v })} />
      <FieldLabel>3. Marked reduction in walking, playing, or physical activity because of breathlessness or fatigue</FieldLabel>
      <YesNoGroup value={form.activityReduction} disabled={screeningLocked} onChange={v => patch({ activityReduction: v })} />
      {cardiacPositive ? (
        <Alert variant="warning">Cardiac automatic-positive pattern met — breathlessness plus at least one companion finding.</Alert>
      ) : null}
    </> : null}

    <CardSubtitle>C. Characteristic ARF skin manifestations — either one qualifies</CardSubtitle>
    <CheckboxRow
      label="Suspected erythema marginatum"
      sub="Non-itchy, non-painful ring-shaped or serpiginous rash with central clearing, usually on the trunk or proximal limbs, typically sparing the face. It may be subtle on darker skin."
      checked={form.em}
      disabled={screeningLocked}
      onToggle={() => patch({ em: !form.em })}
    />
    <CheckboxRow
      label="Suspected subcutaneous nodules"
      sub="Small, firm, painless nodules under the skin, usually over extensor surfaces, joints/tendons, spine, or occiput, without inflamed overlying skin."
      checked={form.sn}
      disabled={screeningLocked}
      onToggle={() => patch({ sn: !form.sn })}
    />

    <CheckboxRow
      label="D. Clearly migratory inflammatory polyarthritis"
      sub="Objective arthritis involving two or more joints, with inflammation improving or resolving in one joint while appearing in another during the same illness."
      checked={form.migratoryArthritis}
      disabled={screeningLocked}
      onToggle={() => patch({ migratoryArthritis: !form.migratoryArthritis })}
    />

    <CardSubtitle>
      {automatic31Reasons(form).length
        ? 'ARF-FAST positive criteria met — continue to clinician sign-off.'
        : 'If none are present, continue to ARF-FAST scoring.'}
    </CardSubtitle>
    {(() => {
      // Follow-up questions gate HERE, where they are asked — not later at save.
      const pending: string[] = [];
      if (form.chorea && form.choreaEpisodicBlackout == null) pending.push('the awareness question for the choreiform movements');
      if (form.murmur && form.murmurDocumentedInnocent == null) pending.push('whether the murmur is a previously documented innocent murmur');
      if (form.breathlessness === true && (form.orthopnea == null || form.edema == null || form.activityReduction == null)) pending.push('the three companion questions (orthopnea, edema, activity reduction)');
      if (!pending.length) return null;
      return <Alert variant="warning">Answer {pending.join(' and ')} before continuing — these answers decide whether the finding qualifies.</Alert>;
    })()}
    <PrimaryButton
      title="Continue"
      disabled={
        (form.chorea && form.choreaEpisodicBlackout == null)
        || (form.murmur && form.murmurDocumentedInnocent == null)
        || (form.breathlessness === true && (form.orthopnea == null || form.edema == null || form.activityReduction == null))
      }
      onPress={() => { patch({ automaticReviewed: true }); goStep('fast-score'); }}
    />
    <SecondaryButton title="Back" onPress={() => goStep('urgent')} />
  </Card>;
}

export function FastScore31() {
  const { form, patch, inputs, signedBy, setSignedBy, commitLevelA, goStep, screeningLocked } = useFast31Form();
  const result = fast31Result(inputs);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setError('');
    try { await commitLevelA(); goStep(4); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Please try again.'); } finally { setSaving(false); }
  };
  return <Card>
    <StepBadge>{result.method === 'automatic' ? 'Screening — Clinician Sign-Off' : 'Step 5 — ARF-FAST Score'}</StepBadge>
    <CardTitle>{result.method === 'automatic' ? 'ARF-FAST positive — automatic criteria met' : 'ARF-FAST Score'}</CardTitle>
    {result.method === 'automatic' ? <>
      <CardSubtitle>Numerical scoring is not required because automatic-positive criteria are met.</CardSubtitle>
      {result.reasons.map(r => <Text key={r} style={{ color: Colors.text, marginBottom: 8 }}>{r}</Text>)}
    </> : <>
      <CardTitle>A. Joint manifestation — choose one</CardTitle>
      <CardSubtitle>Arthralgia = joint pain without objective arthritis. Arthritis = joint pain with visible swelling and/or clear painful restriction. Clearly migratory polyarthritis is handled above and is not scored here.</CardSubtitle>
      <RadioList
        options={FAST31_JOINTS.map(f => ({ ...f, points: `+${f.points}` }))}
        selectedId={form.joint ?? ''}
        disabled={screeningLocked}
        onSelect={id => patch({ joint: id as Fast31Inputs['joint'] })}
      />
      <CardTitle>B. Fever</CardTitle>
      <CardSubtitle>Measured temperature ≥38.0 °C at any time during the current illness, at or before this assessment. Subjective fever without a measurement does not score.</CardSubtitle>
      <YesNoGroup value={form.measuredFever} disabled={screeningLocked} onChange={v => patch({ measuredFever: v })} />
      <CardSubtitle>Yes +1 · No 0</CardSubtitle>
      <CardTitle>C. First-degree family history of ARF/RHD</CardTitle>
      <CardSubtitle>Parent or sibling with medically diagnosed ARF or rheumatic heart disease. Unknown scores 0.</CardSubtitle>
      <RadioList options={TRI_OPTS} selectedId={form.familyHistory ?? ''} disabled={screeningLocked} onSelect={id => patch({ familyHistory: id as Fast31Tri })} />
      <CardSubtitle>Yes +1 · No 0 · Unknown 0</CardSubtitle>
      <CardTitle>D. Previous definite ARF or established RHD</CardTitle>
      <CardSubtitle>Medically documented previous definite ARF or established rheumatic heart disease. Unknown scores 0.</CardSubtitle>
      <RadioList options={TRI_OPTS} selectedId={form.previousArfRhd ?? ''} disabled={screeningLocked} onSelect={id => patch({ previousArfRhd: id as Fast31Tri })} />
      <CardSubtitle>Yes +1 · No 0 · Unknown 0</CardSubtitle>
      <CardTitle>{result.scoreA == null ? 'Complete all answers to calculate the score' : `Total ARF-FAST score: ${result.scoreA} / 7`}</CardTitle>
      <CardSubtitle>Score ≥2 positive · 0–1 negative. Automatic-positive features bypass scoring.</CardSubtitle>
    </>}
    <TextField label="Person Responsible — Signed by" value={signedBy} onChangeText={setSignedBy} placeholder="Clinician name" editable={!screeningLocked} />
    {error ? <Alert variant="warning">{error}</Alert> : null}
    {screeningLocked ? (
      <PrimaryButton title="Continue to Results" onPress={() => goStep(4)} />
    ) : (
      <PrimaryButton title={saving ? 'Saving…' : 'View Screening Results'} disabled={saving || !signedBy.trim() || result.method === 'incomplete'} onPress={save} />
    )}
    <SecondaryButton title="Back" onPress={() => goStep('automatic')} />
  </Card>;
}

const lockStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 22 },
  box: { backgroundColor: Colors.white, borderRadius: 14, padding: 18 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  body: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 19, marginBottom: 14 },
});
