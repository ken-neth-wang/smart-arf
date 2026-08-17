/**
 * Assessment wizard — Steps 1–6, a faithful port of the `step1`–`step6` sections
 * and their handlers in smart-arf-app.html. Driven by AssessmentContext.
 * Source of truth: smart-arf-app.html.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WizardHeader } from '@/components/WizardHeader';
import { PhotoCard } from '@/components/PhotoCard';
import { AudioCard } from '@/components/AudioCard';
import { VoiceFillCard } from '@/components/VoiceFillCard';
import {
  Alert,
  Card,
  CardSubtitle,
  CardTitle,
  CategoryBlock,
  CheckboxRow,
  FieldLabel,
  NAToggle,
  PrimaryButton,
  RadioList,
  SecondaryButton,
  SectionDivider,
  SelectField,
  SeverityHeader,
  StepBadge,
  TextField,
  YesNoGroup,
} from '@/components/ui/primitives';
import {
  ChoreaBanner,
  HistoryArfBanner,
  LiveScoreCard,
  PatientCodeCard,
  ResultCard,
  ScoreBreakdown,
} from '@/components/ui/results';
import { useAssessment } from '@/state/AssessmentContext';
import { useRecords } from '@/state/RecordsContext';
import { useAuth } from '@/state/AuthContext';
import { Colors } from '@/constants/theme';
import { getActions, getInterp, isAutoConfirmed, jointIdForPoints, jointPoints, levelADisplayBreakdown, finalDisplayBreakdown } from '@/lib/scoring';
import type { EchoValue, FacilityType, FeverDuration, Gender, Setting } from '@/lib/types';
import { approxDobFromAge, ageFromDateOfBirth, maskDobInput, normalizeDobEntry } from '@/lib/types';
import { validatePatientFields } from '@/lib/validation';

const GENDER_OPTS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other / Not specified', value: 'other' },
];
const SETTING_OPTS = [
  { label: 'RHD Endemic Area', value: 'endemic' },
  { label: 'Non-Endemic Area', value: 'nonendemic' },
  { label: 'Unknown', value: 'unknown' },
];

export default function AssessScreen() {
  const { step } = useAssessment();
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  return (
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 50 }}>
      <WizardHeader />
      <View style={styles.container}>
        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 />}
        {step === 5 && <Step5 />}
        {step === 6 && <Step6 />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { maxWidth: 560, width: '100%', alignSelf: 'center', padding: 12, paddingTop: 16 },
  disclaimer: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginTop: 10, paddingHorizontal: 10 },
  hintAbove: { fontSize: 12.5, fontWeight: '400', color: Colors.textSecondary, marginTop: -2, marginBottom: 8 },
});

/* ============== STEP 1 — Patient ============== */
function Step1() {
  const { patient, setPatient, goStep } = useAssessment();
  const records = useRecords();
  const { user } = useAuth();
  const [err, setErr] = useState('');
  // Field-level feedback: the DOB is optional but must be WELL-FORMED. Red is
  // shown only after the field is blurred (or Continue fails) — never while
  // typing, where partial values like "2015-0" are legitimate intermediate state.
  const [dobTouched, setDobTouched] = useState(false);
  const dobMalformed = !!patient.dateOfBirth && normalizeDobEntry(patient.dateOfBirth) === null;
  const dobShowError = dobTouched && dobMalformed;
  // Age is always derived from the DOB. When only the age is known, an
  // approximate DOB (Jan 1 of the birth year) is stored with dobApproximate = true.
  // The two are mutually exclusive: entering one takes over from the other.
  const derivedAge = ageFromDateOfBirth(patient.dateOfBirth);
  const ageLocked = !patient.dobApproximate && patient.dateOfBirth !== null;
  // Digits only, dashes auto-inserted (lib/types.ts maskDobInput) — garbage is
  // untypeable; impossible dates still caught by validatePatientFields at Continue.
  const onDobChange = (v: string) => setPatient({ dateOfBirth: maskDobInput(v) || null, dobApproximate: false });
  const onAgeChange = (v: string) => {
    const years = parseInt(v.replace(/[^0-9]/g, ''), 10);
    if (isNaN(years) || years <= 0 || years > 125) {
      setPatient({ dateOfBirth: null, dobApproximate: false });
      return;
    }
    setPatient({ dateOfBirth: approxDobFromAge(years), dobApproximate: true });
  };

  // Every rule here mirrors a server-side rejection (Postgres 22007/23505 or
  // RLS 42501) — see lib/validation.ts. Bad input stops at Step 1, never at save.
  const next = () => {
    const v = validatePatientFields(patient, records.patients, user?.memberships[0]?.clinicId ?? null);
    if (!v.ok) {
      setDobTouched(true); // surface field-level red if the DOB is the offender
      return setErr(v.error);
    }
    if (v.dateOfBirth !== patient.dateOfBirth || v.dobApproximate !== patient.dobApproximate) {
      setPatient({ dateOfBirth: v.dateOfBirth, dobApproximate: v.dobApproximate });
    }
    setErr('');
    goStep(2);
  };

  return (
    <Card>
      <StepBadge>Step 1 — Patient</StepBadge>
      <CardTitle>Patient Information</CardTitle>
      <CardSubtitle>Enter patient identification and basic details to begin the ARF triage assessment.</CardSubtitle>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <FieldLabel required>First Name</FieldLabel>
          <TextField value={patient.firstName} onChangeText={(v) => setPatient({ firstName: v })} placeholder="First name" />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel required>Last Name</FieldLabel>
          <TextField value={patient.lastName} onChangeText={(v) => setPatient({ lastName: v })} placeholder="Last name" />
        </View>
      </View>

      <TextField label="MRN / Patient ID" value={patient.mrn} onChangeText={(v) => setPatient({ mrn: v })} placeholder="e.g. 00123456" />

      <TextField label="Primary Phone" required value={patient.phone1} onChangeText={(v) => setPatient({ phone1: v })} placeholder="e.g. +249 91 234 5678" keyboardType="phone-pad" />

      <TextField label="Secondary Phone" value={patient.phone2} onChangeText={(v) => setPatient({ phone2: v })} placeholder="Alternate contact number" keyboardType="phone-pad" />

      <TextField label="Date of Birth (YYYY-MM-DD)" value={!patient.dobApproximate ? (patient.dateOfBirth ?? '') : ''} onChangeText={onDobChange} onBlur={() => setDobTouched(true)} placeholder="e.g. 2015-06-15" keyboardType="number-pad" error={dobShowError} hint={dobShowError ? 'Check the date — use a full date like 2015-06-15, a 4-digit year like 1998, or leave it blank.' : "Digits only, auto-formatted. Full date, or just a 4-digit birth year if that's all you know."} />
      <TextField label="Age (years)" value={derivedAge !== null ? String(derivedAge) : ''} onChangeText={onAgeChange} placeholder="e.g. 14 — enter if exact DOB is unknown" keyboardType="number-pad" editable={!ageLocked} hint="Auto-filled from date of birth; enter an age instead when the exact date is unknown." />

      <SelectField label="Patient Gender" value={patient.gender} options={GENDER_OPTS} onChange={(v) => setPatient({ gender: v as Gender })} />

      <SelectField label="Setting" value={patient.setting} options={SETTING_OPTS} onChange={(v) => setPatient({ setting: v as Setting })} />

      <Pressable
        style={({ pressed }) => [testStyles.wrap, patient.isTest && testStyles.active, pressed && { opacity: 0.9 }]}
        onPress={() => setPatient({ isTest: !patient.isTest })}
      >
        <View style={[testStyles.box, patient.isTest && { backgroundColor: Colors.warning, borderColor: Colors.warning }]}>
          {patient.isTest ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
        </View>
        <Text style={[testStyles.text, patient.isTest && { color: Colors.warning }]}>This is a test / training entry</Text>
      </Pressable>

      {err ? <Alert variant="warning">{err}</Alert> : null}

      <PrimaryButton title="Continue" onPress={next} />
      <Text style={styles.disclaimer}>SMART-ARF targets children &amp; adolescents aged 3–18 in RHD-endemic settings.</Text>
    </Card>
  );
}

/* ============== STEP 2 — Entry Criteria ============== */
function Step2() {
  const { inputs, setEntry, setInputs, goStep } = useAssessment();
  const [warn, setWarn] = useState('');

  const next = () => {
    if (inputs.fever === null || inputs.chorea === null || inputs.altCause === null || inputs.historyArf === null) {
      return setWarn('Please answer all four questions before continuing.');
    }
    setWarn('');
    // Mirrors evalEntry(): chorea positive sets the flag (adds +5 in scoring).
    setInputs({ choreaPositive: inputs.chorea === true });
    goStep(3);
  };

  return (
    <Card>
      <StepBadge>Step 2 — Entry Criteria</StepBadge>
      <CardTitle>Is This an ARF Triage Case?</CardTitle>
      <CardSubtitle>Answer all four questions before scoring.</CardSubtitle>

      <FieldLabel>{'1. Does the patient currently have a fever?'}</FieldLabel>
      <YesNoGroup value={inputs.fever} onChange={(v) => setEntry('fever', v)} />

      <FieldLabel>{'2. Does the patient have a past history of ARF or RHD?'}</FieldLabel>
      <YesNoGroup value={inputs.historyArf} onChange={(v) => setEntry('historyArf', v)} />

      <FieldLabel>{'3. Are abnormal involuntary movements (chorea) present?'}</FieldLabel>
      <YesNoGroup value={inputs.chorea} onChange={(v) => setEntry('chorea', v)} />

      <View style={{ marginBottom: 6 }}>
        <FieldLabel>{'4. Is there an obvious cause for the fever?'}</FieldLabel>
        <Text style={styles.hintAbove}>e.g. cough &amp; runny nose (URI), diarrhea or vomiting (GI illness)</Text>
      </View>
      <YesNoGroup value={inputs.altCause} onChange={(v) => setEntry('altCause', v)} />

      {warn ? <Alert variant="warning">{warn}</Alert> : null}

      <PrimaryButton title="Continue to Scoring" onPress={next} />
      <SecondaryButton title="Back" onPress={() => goStep(2)} />
    </Card>
  );
}

/* ============== STEP 3 — Level A ============== */
const JOINT_OPTS = [
  { id: 'none', name: 'None', desc: 'No joint symptoms' },
  { id: 'mono', name: 'Monoarthralgia', desc: 'Pain in ONE joint only — no swelling or tenderness' },
  { id: 'poly', name: 'Polyarthralgia', desc: 'Pain in MULTIPLE joints — no swelling or tenderness' },
  { id: 'arthritis', name: 'Migratory Polyarthritis', desc: 'Swelling AND tenderness in joints, moves between joints' },
].map((o) => ({ ...o, points: '+' + jointPoints[o.id] }));

function Step3() {
  const { inputs, setInputs, scoreA, goStep, commitLevelA, signedBy, setSignedBy } = useAssessment();
  const interp = getInterp(scoreA, 0, undefined, isAutoConfirmed(inputs));
  const choreaPositive = inputs.chorea === true;
  const autoConfirmed = isAutoConfirmed(inputs);

  return (
    <>
      {choreaPositive ? <ChoreaBanner step={3} /> : null}
      {autoConfirmed ? <HistoryArfBanner step={3} /> : null}
      <VoiceFillCard />
      <Card>
        <StepBadge>Step 3 — Level A: Clinical Assessment</StepBadge>
        <CardTitle>Signs &amp; Symptoms Checklist</CardTitle>
        <CardSubtitle>Check every finding that is present in this patient. For joint symptoms, select the most severe category that applies.</CardSubtitle>

        <CategoryBlock title="Joint Symptoms" description="Select the highest applicable joint finding (arthritis > polyarthralgia > monoarthralgia)" points={inputs.joint} active={inputs.joint > 0}>
          <RadioList options={JOINT_OPTS} selectedId={jointIdForPoints[inputs.joint] ?? 'none'} onSelect={(id) => setInputs({ joint: jointPoints[id] })} />
        </CategoryBlock>

        <CategoryBlock title="Heart / Carditis" description="Check the heart murmur first. If present, document severity findings below." points={inputs.murmur ? 5 : 0} active={inputs.murmur}>
          <View style={{ gap: 7 }}>
            <CheckboxRow label="Heart murmur" sub="Heard on auscultation" checked={inputs.murmur} onToggle={() => setInputs({ murmur: !inputs.murmur })} pointsBadge="+5" />
            <SeverityHeader label="Severity descriptors (documentation only, no score)" />
            <CheckboxRow label="Shortness of breath" sub="At rest or on exertion" checked={inputs.sob} onToggle={() => setInputs({ sob: !inputs.sob })} pointsBadge="no score" muted />
            <CheckboxRow label="Edema" sub="Swelling of feet, legs, or face" checked={inputs.edema} onToggle={() => setInputs({ edema: !inputs.edema })} pointsBadge="no score" muted />
            {(inputs.sob || inputs.edema) && !inputs.murmur ? (
              <View style={{ backgroundColor: Colors.warningBg, borderWidth: 1.5, borderColor: Colors.warning, borderRadius: 10, padding: 12 }}>
                <Text style={{ color: Colors.warning, fontSize: 13.5, fontWeight: '700', lineHeight: 19 }}>
                  ⚠ Shortness of breath and edema usually accompany a heart murmur. Please re-auscultate to confirm whether a murmur is present.
                </Text>
              </View>
            ) : null}
          </View>
        </CategoryBlock>

        <AudioCard />

        <CategoryBlock title="Skin Findings" points={(inputs.em ? 5 : 0) + (inputs.sn ? 5 : 0)} active={inputs.em || inputs.sn}>
          <View style={{ gap: 7 }}>
            <CheckboxRow label="Erythema marginatum" sub="Pink/red ring-shaped rash on trunk or limbs (rarely on face)" checked={inputs.em} onToggle={() => setInputs({ em: !inputs.em })} pointsBadge="+5" image={require('@/assets/images/erythema-marginatum.png')} imageLabel="Erythema marginatum" />
            <CheckboxRow label="Subcutaneous nodules" sub="Firm, painless lumps over elbows, wrists, knees, or spine" checked={inputs.sn} onToggle={() => setInputs({ sn: !inputs.sn })} pointsBadge="+5" image={require('@/assets/images/subcutaneous-nodules.png')} imageLabel="Subcutaneous nodules" />
          </View>
        </CategoryBlock>

        <PhotoCard />

        <CategoryBlock title="Alternative Diagnosis" points={inputs.noad ? 3 : 0} active={inputs.noad}>
          <CheckboxRow
            label="No obvious alternative diagnosis"
            sub="Sickle cell disease, congenital heart disease, and septic arthritis have been considered and are unlikely"
            checked={inputs.noad}
            onToggle={() => setInputs({ noad: !inputs.noad })}
            pointsBadge="+3"
          />
        </CategoryBlock>

        <LiveScoreCard score={scoreA} label={interp.label} subtitle="Current Level A Score" />

        <Card>
          <StepBadge>Sign</StepBadge>
          <CardTitle>Person Responsible</CardTitle>
          <CardSubtitle>Confirm or edit the name of the clinician responsible for this encounter.</CardSubtitle>
          <TextField label="Signed by" value={signedBy} onChangeText={setSignedBy} placeholder="e.g. Dr. Amina" />
        </Card>

        <PrimaryButton
          title="View Result & Recommendations"
          disabled={!signedBy.trim()}
          onPress={async () => {
            // Mirrors goToResult() → renderLevelAResult(): persist the patient
            // + initial encounter (generates referral code) then show the result.
            try {
              await commitLevelA();
              goStep(4);
            } catch {
              // Save failed — RecordsContext alerted with the cause; stay on
              // this step so the entries can be retried.
            }
          }}
        />
        <SecondaryButton title="Back" onPress={() => goStep(2)} />
      </Card>
    </>
  );
}

/* ============== STEP 4 — Level A Result ============== */
function Step4() {
  const { inputs, scoreA, referralCode, activeEncounterId, goStep, reset } = useAssessment();
  const records = useRecords();
  const router = useRouter();
  const interp = getInterp(scoreA, 0, undefined, isAutoConfirmed(inputs));
  const choreaPositive = inputs.chorea === true;
  const autoConfirmed = isAutoConfirmed(inputs);
  const [referredToClinicId, setReferredToClinicId] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const clinics = records.clinics;
  const clinicOptions = [{ label: '(no referral)', value: '' }, ...clinics.map((c) => ({ label: c.name, value: c.id }))];

  useEffect(() => {
    const existing = activeEncounterId ? records.encounters.find((e) => e.id === activeEncounterId) : undefined;
    setReferredToClinicId(existing?.referredToClinicId ?? '');
  }, [activeEncounterId, records]);

  return (
    <>
      {choreaPositive ? <ChoreaBanner step={4} /> : null}
      {autoConfirmed ? <HistoryArfBanner step={4} /> : null}
      <ResultCard level={interp.level} scoreA={scoreA} label={interp.label} actions={getActions(scoreA, 0, undefined, isAutoConfirmed(inputs))} />

      {referralCode ? <PatientCodeCard code={referralCode} step={4} /> : null}

      <Card>
        <StepBadge>Referral</StepBadge>
        <CardTitle>Refer Patient</CardTitle>
        <CardSubtitle>Record where the patient is being referred for follow-up evaluation.</CardSubtitle>
        <SelectField label="Referred To (clinic)" value={referredToClinicId} options={clinicOptions} onChange={setReferredToClinicId} />
        <PrimaryButton title={savedFlash ? '✓ Referral saved' : 'Save Referral'} onPress={async () => {
          if (!activeEncounterId) return;
          const c = clinics.find((x) => x.id === referredToClinicId);
          try {
            await records.setReferral(activeEncounterId, c?.name ?? '', referredToClinicId || null);
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
          } catch {
            // Save failed — RecordsContext alerted with the cause; no success flash.
          }
        }} />
      </Card>

      <ScoreBreakdown title="Level A Score Breakdown" rows={levelADisplayBreakdown(inputs, scoreA)} />

      <Card>
        <StepBadge>Optional — Level B</StepBadge>
        <CardTitle>Add Enhanced Findings?</CardTitle>
        <CardSubtitle>If laboratory tests, ECG, or handheld echo results are available, proceed to Level B for a refined Jones Criteria assessment.</CardSubtitle>
        <PrimaryButton title="Add Level B Findings" onPress={() => goStep(5)} />
        <SecondaryButton title="Start New Assessment" onPress={() => { reset(); router.navigate('/'); }} />
      </Card>
    </>
  );
}

/* ============== STEP 5 — Level B ============== */
const FACILITY_OPTS = [
  { label: '— Not specified —', value: '' },
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
];

function Step5() {
  const { inputs, setInputs, scoreA, scoreB, goStep, commitFinal } = useAssessment();
  const choreaPositive = inputs.chorea === true;
  const autoConfirmed = isAutoConfirmed(inputs);
  const total = scoreA + scoreB;
  const feverRequired = total === 6 && !inputs.feverDuration;

  const setNA = (section: 'naBlood' | 'naEcg' | 'naEcho', on: boolean) => {
    if (on) {
      if (section === 'naBlood') setInputs({ naBlood: true, wbc: false, aso: false, esr: false, antidnase: false });
      if (section === 'naEcg') setInputs({ naEcg: true, pr: false });
      if (section === 'naEcho') setInputs({ naEcho: true, echo: null });
    } else {
      if (section === 'naBlood') setInputs({ naBlood: false });
      if (section === 'naEcg') setInputs({ naEcg: false });
      if (section === 'naEcho') setInputs({ naEcho: false });
    }
  };

  return (
    <>
      {choreaPositive ? <ChoreaBanner step={5} /> : null}
      {autoConfirmed ? <HistoryArfBanner step={5} /> : null}
      <Card>
        <StepBadge>Step 5 — Level B: Jones Criteria</StepBadge>
        <CardTitle>Enhanced Findings</CardTitle>
        <CardSubtitle>Check all available investigation results. Mark a section as <Text style={{ fontWeight: '800' }}>Not Available</Text> if the test was not performed.</CardSubtitle>

        <FieldLabel>How long ago did the patient have a fever?</FieldLabel>
        <RadioList
          options={[
            { id: 'over2w', name: '> 2 weeks ago', desc: 'More than 2 weeks have passed since the fever' },
            { id: 'under2w', name: '< 2 weeks ago', desc: 'Less than 2 weeks have passed since the fever' },
            { id: 'none', name: 'No fever', desc: 'Patient has not had a fever' },
          ]}
          selectedId={inputs.feverDuration}
          onSelect={(id) => setInputs({ feverDuration: id as FeverDuration })}
        />

        <SelectField
          label="Facility type of today's assessment"
          value={inputs.facilityType ?? ''}
          options={FACILITY_OPTS}
          onChange={(v) => setInputs({ facilityType: v === '' ? null : (v as FacilityType) })}
        />

        <CategoryBlock title="Blood Tests" titleSuffix="(max +8)" points={((inputs.wbc || inputs.esr) ? 3 : 0) + ((inputs.aso || inputs.antidnase) ? 5 : 0)} active={!inputs.naBlood && (inputs.wbc || inputs.esr || inputs.aso || inputs.antidnase)}>
          <NAToggle active={inputs.naBlood} onToggle={() => setNA('naBlood', !inputs.naBlood)} label="Not Available — blood tests were not done" />
          <View pointerEvents={inputs.naBlood ? 'none' : 'auto'} style={{ opacity: inputs.naBlood ? 0.4 : 1, gap: 7 }}>
            <SectionDivider label="Non-specific inflammation markers (any one or more = +3)" />
            <CheckboxRow label="Elevated WBC" sub="White blood cell count above normal range for age" checked={inputs.wbc} onToggle={() => setInputs({ wbc: !inputs.wbc })} pointsBadge="+3" />
            <CheckboxRow label="Elevated ESR or CRP" sub="Raised inflammatory markers" checked={inputs.esr} onToggle={() => setInputs({ esr: !inputs.esr })} pointsBadge="+3" />
            <SectionDivider label="Specific Strep antibody (ASO or Anti-DNase = +5)" />
            <CheckboxRow label="Elevated ASO" sub="Anti-streptolysin O titer raised" checked={inputs.aso} onToggle={() => setInputs({ aso: !inputs.aso })} pointsBadge="+5" />
            <CheckboxRow label="Anti-DNase B positive" sub="Specific antibody confirming recent Group A Strep infection" checked={inputs.antidnase} onToggle={() => setInputs({ antidnase: !inputs.antidnase })} pointsBadge="+5" />
          </View>
        </CategoryBlock>

        <CategoryBlock title="ECG (Electrocardiogram)" points={inputs.pr ? 3 : 0} active={!inputs.naEcg && inputs.pr}>
          <NAToggle active={inputs.naEcg} onToggle={() => setNA('naEcg', !inputs.naEcg)} label="Not Available — ECG was not done" />
          <View pointerEvents={inputs.naEcg ? 'none' : 'auto'} style={{ opacity: inputs.naEcg ? 0.4 : 1 }}>
            <CheckboxRow label="Prolonged PR interval" sub="PR interval prolonged for age on 12-lead ECG" checked={inputs.pr} onToggle={() => setInputs({ pr: !inputs.pr })} pointsBadge="+3" />
          </View>
        </CategoryBlock>

        <CategoryBlock title="Echocardiogram" points={inputs.echo === 'suggestive' ? 5 : 0} active={!inputs.naEcho && inputs.echo === 'suggestive'}>
          <NAToggle active={inputs.naEcho} onToggle={() => setNA('naEcho', !inputs.naEcho)} label="Not Available — echo was not performed" />
          <View pointerEvents={inputs.naEcho ? 'none' : 'auto'} style={{ opacity: inputs.naEcho ? 0.4 : 1 }}>
            <CheckboxRow
              label="Suggestive of RHD"
              sub="Mitral or aortic regurgitation, or subclinical RHD features"
              checked={inputs.echo === 'suggestive'}
              onToggle={() => setInputs({ echo: inputs.echo === 'suggestive' ? null : 'suggestive' })}
              pointsBadge="+5"
            />
          </View>
        </CategoryBlock>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <LiveScoreCard score={scoreA} label="" subtitle="Level A" />
          </View>
          <View style={{ flex: 1 }}>
            <LiveScoreCard score={scoreB} label="" subtitle="Level B" />
          </View>
        </View>

        <PrimaryButton title="View Final Result" disabled={feverRequired} onPress={async () => {
          try {
            await commitFinal();
            goStep(6);
          } catch {
            // Save failed — RecordsContext alerted with the cause; stay on
            // this step so the entries can be retried.
          }
        }} />
        {feverRequired ? (
          <Text style={{ color: Colors.warning, fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 8, paddingHorizontal: 4 }}>
            Answer the fever question above to determine the result.
          </Text>
        ) : null}
        <SecondaryButton title="Back" onPress={() => goStep(4)} />
      </Card>
    </>
  );
}

/* ============== STEP 6 — Final Result ============== */
function Step6() {
  const { inputs, scoreA, scoreB, referralCode, reset } = useAssessment();
  const router = useRouter();
  const interp = getInterp(scoreA, scoreB, inputs.feverDuration, isAutoConfirmed(inputs));
  const choreaPositive = inputs.chorea === true;
  const autoConfirmed = isAutoConfirmed(inputs);

  return (
    <>
      {choreaPositive ? <ChoreaBanner step={6} /> : null}
      {autoConfirmed ? <HistoryArfBanner step={6} /> : null}
      <ResultCard level={interp.level} scoreA={scoreA} scoreB={scoreB} label={interp.label} actions={getActions(scoreA, scoreB, inputs.feverDuration, isAutoConfirmed(inputs))} />
      {referralCode ? <PatientCodeCard code={referralCode} step={6} /> : null}
      <ScoreBreakdown title="Complete Score Breakdown" rows={finalDisplayBreakdown(inputs, scoreA, scoreB)} />
      <PrimaryButton title="Start New Assessment" onPress={() => { reset(); router.navigate('/'); }} />
      <Text style={styles.disclaimer}>⚕️ SMART-ARF is a clinical decision-support tool. All findings must be interpreted by a qualified healthcare provider. This tool does not replace clinical judgment or the Jones Criteria.</Text>
    </>
  );
}

const testStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', backgroundColor: Colors.white, marginBottom: 16, minHeight: 52 },
  active: { borderColor: Colors.warning, backgroundColor: Colors.warningBg },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
});
