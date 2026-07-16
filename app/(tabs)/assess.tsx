/**
 * Assessment wizard — Steps 1–6, a faithful port of the `step1`–`step6` sections
 * and their handlers in smart-arf-app.html. Driven by AssessmentContext.
 * Source of truth: smart-arf-app.html.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WizardHeader } from '@/components/WizardHeader';
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
  LiveScoreCard,
  PatientCodeCard,
  ResultCard,
  ScoreBreakdown,
} from '@/components/ui/results';
import { useAssessment } from '@/state/AssessmentContext';
import { useRecords } from '@/state/RecordsContext';
import { Colors } from '@/constants/theme';
import { getActions, getInterp, levelADisplayBreakdown, finalDisplayBreakdown } from '@/lib/scoring';
import type { EchoValue, Gender, Setting } from '@/lib/types';

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
  const [err, setErr] = useState('');

  const next = () => {
    if (!patient.firstName.trim() || !patient.lastName.trim()) return setErr('First and last name are required.');
    if (!patient.phone1.trim()) return setErr('Primary phone is required.');
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

      <TextField label="Date of Birth (YYYY-MM-DD)" value={patient.dateOfBirth ?? ''} onChangeText={(v) => setPatient({ dateOfBirth: v || null })} placeholder="e.g. 2015-06-15" />

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
    if (inputs.fever === null || inputs.chorea === null || inputs.altCause === null) {
      return setWarn('Please answer all three questions before continuing.');
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
      <CardSubtitle>Answer all three questions before scoring.</CardSubtitle>

      <FieldLabel>{'1. Does the patient currently have a fever?'}</FieldLabel>
      <YesNoGroup value={inputs.fever} onChange={(v) => setEntry('fever', v)} />

      <FieldLabel>{'2. Are abnormal involuntary movements (chorea) present?'}</FieldLabel>
      <YesNoGroup value={inputs.chorea} onChange={(v) => setEntry('chorea', v)} />

      <View style={{ marginBottom: 6 }}>
        <FieldLabel>{'3. Is there an obvious cause for the fever?'}</FieldLabel>
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
  { id: 'none', name: 'None', desc: 'No joint symptoms', points: '+0' },
  { id: 'mono', name: 'Monoarthralgia', desc: 'Pain in ONE joint only — no swelling or tenderness', points: '+2' },
  { id: 'poly', name: 'Polyarthralgia', desc: 'Pain in MULTIPLE joints — no swelling or tenderness', points: '+3' },
  { id: 'arthritis', name: 'Migratory Polyarthritis', desc: 'Swelling AND tenderness in joints, moves between joints', points: '+5' },
];
const JOINT_VAL: Record<string, number> = { none: 0, mono: 2, poly: 3, arthritis: 5 };
const VAL_JOINT: Record<number, string> = { 0: 'none', 2: 'mono', 3: 'poly', 5: 'arthritis' };

function Step3() {
  const { inputs, setInputs, scoreA, goStep, commitLevelA } = useAssessment();
  const interp = getInterp(scoreA, 0);
  const choreaPositive = inputs.chorea === true;

  return (
    <>
      {choreaPositive ? <ChoreaBanner step={3} /> : null}
      <Card>
        <StepBadge>Step 3 — Level A: Clinical Assessment</StepBadge>
        <CardTitle>Signs &amp; Symptoms Checklist</CardTitle>
        <CardSubtitle>Check every finding that is present in this patient. For joint symptoms, select the most severe category that applies.</CardSubtitle>

        <CategoryBlock title="Joint Symptoms" description="Select the highest applicable joint finding (arthritis > polyarthralgia > monoarthralgia)" points={inputs.joint} active={inputs.joint > 0}>
          <RadioList options={JOINT_OPTS} selectedId={VAL_JOINT[inputs.joint] ?? 'none'} onSelect={(id) => setInputs({ joint: JOINT_VAL[id] })} />
        </CategoryBlock>

        <CategoryBlock title="Heart / Carditis" description="Check the heart murmur first. If present, document severity findings below." points={inputs.murmur ? 5 : 0} active={inputs.murmur}>
          <View style={{ gap: 7 }}>
            <CheckboxRow label="Heart murmur" sub="Heard on auscultation" checked={inputs.murmur} onToggle={() => setInputs({ murmur: !inputs.murmur })} pointsBadge="+5" />
            <SeverityHeader label="Severity descriptors (documentation only, no score)" />
            <CheckboxRow label="Shortness of breath" sub="At rest or on exertion" checked={inputs.sob} onToggle={() => setInputs({ sob: !inputs.sob })} pointsBadge="no score" muted />
            <CheckboxRow label="Edema" sub="Swelling of feet, legs, or face" checked={inputs.edema} onToggle={() => setInputs({ edema: !inputs.edema })} pointsBadge="no score" muted />
            <CheckboxRow label="Chest discomfort or chest pain" sub="Any chest pain reported by patient" checked={inputs.chestpain} onToggle={() => setInputs({ chestpain: !inputs.chestpain })} pointsBadge="no score" muted />
            <CheckboxRow label="Unable to walk normal distances" sub="Due to pain or fatigue" checked={inputs.walking} onToggle={() => setInputs({ walking: !inputs.walking })} pointsBadge="no score" muted />
          </View>
        </CategoryBlock>

        <CategoryBlock title="Skin Findings" points={(inputs.em ? 5 : 0) + (inputs.sn ? 5 : 0)} active={inputs.em || inputs.sn}>
          <View style={{ gap: 7 }}>
            <CheckboxRow label="Erythema marginatum" sub="Pink/red ring-shaped rash on trunk or limbs (rarely on face)" checked={inputs.em} onToggle={() => setInputs({ em: !inputs.em })} pointsBadge="+5" />
            <CheckboxRow label="Subcutaneous nodules" sub="Firm, painless lumps over elbows, wrists, knees, or spine" checked={inputs.sn} onToggle={() => setInputs({ sn: !inputs.sn })} pointsBadge="+5" />
          </View>
        </CategoryBlock>

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

        <PrimaryButton
          title="View Result & Recommendations"
          onPress={async () => {
            // Mirrors goToResult() → renderLevelAResult(): persist the patient
            // + initial encounter (generates referral code) then show the result.
            await commitLevelA();
            goStep(4);
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
  const interp = getInterp(scoreA, 0);
  const choreaPositive = inputs.chorea === true;
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
      <ResultCard level={interp.level} scoreA={scoreA} label={interp.label} actions={getActions(scoreA, 0)} />

      {referralCode ? <PatientCodeCard code={referralCode} step={4} /> : null}

      <Card>
        <StepBadge>Referral</StepBadge>
        <CardTitle>Refer Patient (optional)</CardTitle>
        <CardSubtitle>Record where the patient is being referred for follow-up evaluation.</CardSubtitle>
        <SelectField label="Referred To (clinic)" value={referredToClinicId} options={clinicOptions} onChange={setReferredToClinicId} />
        <PrimaryButton title={savedFlash ? '✓ Referral saved' : 'Save Referral'} onPress={() => { if (activeEncounterId) { const c = clinics.find((x) => x.id === referredToClinicId); records.setReferral(activeEncounterId, c?.name ?? '', referredToClinicId || null); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); } }} />
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
function Step5() {
  const { inputs, setInputs, scoreA, scoreB, goStep, commitFinal } = useAssessment();
  const choreaPositive = inputs.chorea === true;

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
      <Card>
        <StepBadge>Step 5 — Level B: Jones Criteria</StepBadge>
        <CardTitle>Enhanced Findings</CardTitle>
        <CardSubtitle>Check all available investigation results. Mark a section as <Text style={{ fontWeight: '800' }}>Not Available</Text> if the test was not performed.</CardSubtitle>

        <CategoryBlock title="Blood Tests" titleSuffix="(max +8)" points={(inputs.wbc || inputs.aso || inputs.esr ? 3 : 0) + (inputs.antidnase ? 5 : 0)} active={!inputs.naBlood && ((inputs.wbc || inputs.aso || inputs.esr) || inputs.antidnase)}>
          <NAToggle active={inputs.naBlood} onToggle={() => setNA('naBlood', !inputs.naBlood)} label="Not Available — blood tests were not done" />
          <View pointerEvents={inputs.naBlood ? 'none' : 'auto'} style={{ opacity: inputs.naBlood ? 0.4 : 1, gap: 7 }}>
            <SectionDivider label="Non-specific inflammation markers (any one or more = +3)" />
            <CheckboxRow label="Elevated WBC" sub="White blood cell count above normal range for age" checked={inputs.wbc} onToggle={() => setInputs({ wbc: !inputs.wbc })} pointsBadge="+3" />
            <CheckboxRow label="Elevated ASO" sub="Anti-streptolysin O titer raised" checked={inputs.aso} onToggle={() => setInputs({ aso: !inputs.aso })} pointsBadge="+3" />
            <CheckboxRow label="Elevated ESR or CRP" sub="Raised inflammatory markers" checked={inputs.esr} onToggle={() => setInputs({ esr: !inputs.esr })} pointsBadge="+3" />
            <SectionDivider label="Specific Strep antibody" />
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

        <PrimaryButton title="View Final Result" onPress={async () => { await commitFinal(); goStep(6); }} />
        <SecondaryButton title="Back" onPress={() => goStep(4)} />
      </Card>
    </>
  );
}

/* ============== STEP 6 — Final Result ============== */
function Step6() {
  const { inputs, scoreA, scoreB, referralCode, reset } = useAssessment();
  const router = useRouter();
  const interp = getInterp(scoreA, scoreB);
  const choreaPositive = inputs.chorea === true;

  return (
    <>
      {choreaPositive ? <ChoreaBanner step={6} /> : null}
      <ResultCard level={interp.level} scoreA={scoreA} scoreB={scoreB} label={interp.label} actions={getActions(scoreA, scoreB)} />
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
