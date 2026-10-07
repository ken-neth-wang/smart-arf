/**
 * FastCareRecord — the ARF-FAST Record action block (v3.1 DOCX):
 * BPG given / not given / contraindicated, referred, other action,
 * date-time, provider, facility.
 *
 * Save semantics (lib/arfFast31.mergeCareRecord): the action time and the
 * first-save time are stamped once; a later save — including a Part B save —
 * never refreshes them. The "Referred" checkbox and the destination-clinic
 * picker write the SAME encounter referral fields, so the two controls
 * cannot disagree.
 */
import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useAssessment } from '@/state/AssessmentContext';
import { useRecords } from '@/state/RecordsContext';
import { CARE_BPG_LABEL, parseActionAt, type CareBpg, type FastCareRecord } from '@/lib/arfFast31';
import { Alert, Card, CardSubtitle, CardTitle, CheckboxRow, PrimaryButton, SelectField, StepBadge, TextField } from './ui/primitives';
import { Colors } from '@/constants/theme';

const BPG_OPTS = [
  { label: '— Not recorded —', value: '' },
  { label: 'BPG given', value: 'given' },
  { label: 'BPG not given', value: 'not-given' },
  { label: 'BPG contraindicated / cannot be given safely', value: 'contraindicated' },
];

/** Editable form — wizard Step 4 for v3 assessments. */
export function FastCareRecordForm() {
  const { activeEncounterId, activePatientId, signedBy, commitCareRecord } = useAssessment();
  const records = useRecords();

  const [bpgAction, setBpgAction] = useState<CareBpg>('');
  const [referred, setReferred] = useState(false);
  const [referredToClinicId, setReferredToClinicId] = useState('');
  const [otherAction, setOtherAction] = useState('');
  const [actionAt, setActionAt] = useState('');
  const [provider, setProvider] = useState('');
  const [facility, setFacility] = useState('');
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!activeEncounterId) return;
    const existing = records.encounters.find((e) => e.id === activeEncounterId);
    const care = existing?.inputs?.careRecord;
    setBpgAction(care?.bpgAction ?? '');
    setReferred(care?.referred ?? (existing?.referredToClinicId != null || !!existing?.referredTo));
    setReferredToClinicId(existing?.referredToClinicId ?? '');
    setOtherAction(care?.otherAction ?? '');
    setActionAt(care?.actionAt ? care.actionAt.slice(0, 16).replace('T', ' ') : '');
    setProvider(care?.provider ?? existing?.signedBy ?? signedBy);
    setFacility(care?.facility ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEncounterId]);

  const clinicOptions = [
    { label: '(destination not recorded)', value: '' },
    ...records.clinics.map((c) => ({ label: c.name, value: c.id })),
  ];

  const save = async () => {
    setError('');
    const parsed = parseActionAt(actionAt);
    if (parsed === 'invalid') {
      setError('Action date/time must be "YYYY-MM-DD HH:MM" (or blank to use the current time).');
      return;
    }
    if (bpgAction === '' && !referred && !otherAction.trim()) {
      setError('Record at least one action: BPG status, referral, or other action.');
      return;
    }
    const clinic = records.clinics.find((c) => c.id === referredToClinicId);
    try {
      await commitCareRecord(
        { bpgAction, referred, otherAction: otherAction.trim(), actionAt: parsed, provider, facility },
        {
          referredTo: referred ? (clinic?.name ?? '') : '',
          referredToClinicId: referred ? (referredToClinicId || null) : null,
        },
      );
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save. Please try again.');
    }
  };

  if (!activeEncounterId || !activePatientId) return null;

  return <Card>
    <StepBadge>ARF-FAST Record — Actions</StepBadge>
    <CardTitle>Action Taken</CardTitle>
    <CardSubtitle>Record what was done after this screening result. The time of the action is kept separate from the time the form was saved.</CardSubtitle>
    <SelectField label="BPG (benzathine penicillin G)" value={bpgAction} options={BPG_OPTS} onChange={(v) => setBpgAction(v as CareBpg)} />
    <CheckboxRow
      label="Referred"
      sub="Referral for definitive Jones-criteria assessment and echocardiography where available. Do not delay referral if BPG cannot be given."
      checked={referred}
      onToggle={() => setReferred(!referred)}
    />
    {referred ? (
      <SelectField label="Referred to (clinic)" value={referredToClinicId} options={clinicOptions} onChange={setReferredToClinicId} />
    ) : null}
    <TextField label="Other action" value={otherAction} onChangeText={setOtherAction} placeholder="e.g. Urgent neurological assessment arranged" />
    <TextField
      label="Action date / time"
      value={actionAt}
      onChangeText={setActionAt}
      placeholder="YYYY-MM-DD HH:MM — blank uses the current time"
      hint="When the action actually happened, not when this form was saved."
    />
    <TextField label="Healthcare provider" value={provider} onChangeText={setProvider} placeholder="Provider responsible for the action" />
    <TextField label="Facility" value={facility} onChangeText={setFacility} placeholder="Facility where the action was taken" />
    {error ? <Alert variant="warning">{error}</Alert> : null}
    <PrimaryButton title={savedFlash ? '✓ Action record saved' : 'Save Action Record'} onPress={save} />
    <CardSubtitle>
      Provider and facility default to the screening sign-off and the patient&apos;s clinic; edit them
      if a different team took the action.
    </CardSubtitle>
  </Card>;
}

/** Read-only summary — record screen. */
export function CareRecordSummary({ care, referredTo }: { care: FastCareRecord; referredTo?: string }) {
  const rows: [string, string][] = [
    ['BPG', CARE_BPG_LABEL[care.bpgAction]],
    ['Referred', care.referred ? (referredTo ? `Yes — ${referredTo}` : 'Yes') : 'No'],
    ['Other action', care.otherAction],
    ['Action at', care.actionAt ? care.actionAt.replace('T', ' ').slice(0, 16) : ''],
    ['Provider', care.provider],
    ['Facility', care.facility],
    ['Recorded at', care.recordedAt ? care.recordedAt.replace('T', ' ').slice(0, 16) : ''],
  ];
  return <Card>
    <CardTitle>ARF-FAST Record — Actions Taken</CardTitle>
    {rows.filter(([, v]) => v && v !== '—').map(([k, v]) => (
      <Text key={k} style={{ marginBottom: 5, fontSize: 14, color: Colors.text }}>{k}: {v}</Text>
    ))}
  </Card>;
}
