/**
 * PartBResult — read-only summary of a stored Part B record (record screen
 * and the wizard's final step). Labeled explicitly as the STUDY REFERENCE
 * classification so it is never confused with the follow-up visit diagnosis
 * vocabulary (ruled out / possible / likely / confirmed).
 */
import React from 'react';
import { Text } from 'react-native';
import {
  BASIS_LABEL, CLASSIFICATION_LABEL, ECG_STATUS_LABEL, EPISODE_LABEL,
  ECHO_STATUS_LABEL, MICRO_LABEL, PAIRED_RISE_LABEL, VALVE_LABEL,
  type PartBRecord,
} from '@/lib/partB';
import { Card, CardTitle } from './ui/primitives';
import { Colors } from '@/constants/theme';

function Row({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return <Text style={{ marginBottom: 5, fontSize: 14, color: Colors.text, lineHeight: 19 }}>{k}: {v}</Text>;
}

export function PartBResult({ record }: { record: PartBRecord }) {
  const d = record.investigations;
  const dz = record.diagnosis;
  return <Card>
    <CardTitle>Part B — Definitive Assessment</CardTitle>
    <Text style={{ fontSize: 12.5, color: Colors.textSecondary, marginBottom: 10 }}>
      Study reference classification entered by the treating team — separate from the ARF-FAST
      screening result above.
    </Text>
    <Row k="ESR" v={d.esrDone === false ? 'Not done' : d.esrDone === true && d.esrValue ? `${d.esrValue} mm/hour` : ''} />
    <Row k="CRP" v={d.crpDone === false ? 'Not done' : d.crpDone === true && d.crpValue ? `${d.crpValue} ${d.crpUnit}` : ''} />
    {(['aso', 'dnase'] as const).map((key) => {
      const done = key === 'aso' ? d.asoDone : d.dnaseDone;
      if (done !== true) return done === false ? <Row key={key} k={key === 'aso' ? 'ASO titre' : 'Anti-DNase B'} v="Not done" /> : null;
      const value = key === 'aso' ? d.asoValue : d.dnaseValue;
      const unit = key === 'aso' ? d.asoUnit : d.dnaseUnit;
      const uln = key === 'aso' ? d.asoUpperLimit : d.dnaseUpperLimit;
      const rise = key === 'aso' ? d.asoPairedRise : d.dnasePairedRise;
      const parts = [
        value ? `${value}${unit ? ` ${unit}` : ''}` : '',
        uln ? `upper limit ${uln}` : '',
        rise ? `paired rise: ${PAIRED_RISE_LABEL[rise]}` : '',
      ].filter(Boolean).join(' · ');
      return <Row key={key} k={key === 'aso' ? 'ASO titre' : 'Anti-DNase B'} v={parts} />;
    })}
    <Row k="Throat culture for GAS" v={MICRO_LABEL[d.throatCulture]} />
    <Row k="Rapid GAS antigen test" v={MICRO_LABEL[d.rapidGas]} />
    <Row k="ECG" v={ECG_STATUS_LABEL[d.ecgStatus]} />
    {d.ecgStatus === 'done' ? <>
      <Row k="PR interval" v={d.ecgPrMs ? `${d.ecgPrMs} ms` : ''} />
      <Row k="PR prolonged for age" v={d.ecgProlongedForAge === 'yes' ? 'Yes' : d.ecgProlongedForAge === 'no' ? 'No' : ''} />
    </> : null}
    <Row k="Echocardiography" v={ECHO_STATUS_LABEL[d.echoStatus]} />
    {d.echoStatus === 'normal' || d.echoStatus === 'abnormal' ? <>
      <Row k="Pathological mitral regurgitation" v={VALVE_LABEL[d.echoMrPathological]} />
      <Row k="Pathological aortic regurgitation" v={VALVE_LABEL[d.echoArPathological]} />
      <Row k="Other echo finding" v={d.echoOther} />
    </> : null}
    <Row k="Other investigations" v={d.otherInvestigations} />

    <Row k="Diagnostic assessment completed" v={dz.assessmentCompleted === 'yes' ? 'Yes' : dz.assessmentCompleted === 'no' ? `No — ${dz.notCompletedReason}` : ''} />
    <Row k="Study reference classification" v={CLASSIFICATION_LABEL[dz.classification]} />
    {dz.classification === 'definite-probable' ? <>
      <Row k="Diagnostic basis" v={BASIS_LABEL[dz.basis]} />
      <Row k="Episode" v={EPISODE_LABEL[dz.episode]} />
    </> : null}
    {dz.classification === 'unable' ? <Row k="Main reason" v={dz.unableReason} /> : null}
    <Row k="Treating-team diagnosis" v={dz.treatingTeamDx} />
    {record.savedAt ? (
      <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 6 }}>
        Part B saved {record.savedAt.replace('T', ' ').slice(0, 16)}{record.savedBy ? ` by ${record.savedBy}` : ''}
      </Text>
    ) : null}
  </Card>;
}
