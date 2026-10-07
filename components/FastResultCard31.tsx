/**
 * FastResultCard31 — ARF-FAST v3.1 screening result + action guidance.
 *
 * Two completed outputs only (positive / negative). An unfinished form is a
 * workflow state, never a third classification. Guidance wording follows the
 * v3.1 document: BPG only if safe, referral never delayed for BPG, and a
 * negative screen neither rules out ARF nor cancels an independent BPG
 * indication. No Level B / combined interpretation exists on this path.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Card, CardSubtitle, CardTitle, Alert } from './ui/primitives';
import {
  BPG_SAFETY_CAUTION, FAST31_NEGATIVE_ACTION, FAST31_POSITIVE_ACTION,
  fast31Result, isFast31,
} from '@/lib/arfFast31';
import type { AssessmentInputs } from '@/lib/types';
import { Colors } from '@/constants/theme';

export function FastResultCard31({ inputs }: { inputs: AssessmentInputs }) {
  if (!isFast31(inputs)) return null;
  const result = fast31Result(inputs);
  const classified = result.method !== 'incomplete';
  const positive = result.method === 'automatic' || (result.method === 'score' && (result.scoreA ?? 0) >= 2);
  return <Card>
    <CardTitle>ARF-FAST v3.1 Screening Result</CardTitle>
    {result.method === 'score' && (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginVertical: 12 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: positive ? Colors.danger : Colors.success }}>{result.scoreA} / 7</Text>
        <CardSubtitle>ARF-FAST score</CardSubtitle>
      </View>
    )}
    {classified ? <CardTitle>{result.label}</CardTitle> : null}

    {result.method === 'automatic' ? <>
      <CardSubtitle>Qualifying findings:</CardSubtitle>
      {result.reasons.map(r => <Text key={r} style={{ color: Colors.text, marginBottom: 6 }}>{r}</Text>)}
    </> : null}
    {result.method === 'incomplete' ? (
      <Alert>Screening not yet complete. Finish the questions to classify — an unfinished form is not a negative result.</Alert>
    ) : (
      <Alert variant="warning">{positive ? FAST31_POSITIVE_ACTION : FAST31_NEGATIVE_ACTION}</Alert>
    )}
    {classified ? <Alert variant="warning">{BPG_SAFETY_CAUTION}</Alert> : null}
  </Card>;
}
