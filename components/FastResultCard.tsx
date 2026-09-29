import React from 'react';
import { Text, View } from 'react-native';
import { Card, CardSubtitle, CardTitle, Alert } from './ui/primitives';
import { automaticReasons, COMBINED_PENDING, fastResult } from '@/lib/arfFast';
import type { AssessmentInputs } from '@/lib/types';
import { Colors } from '@/constants/theme';

export function FastResultCard({ inputs, withLevelB = false }: { inputs: AssessmentInputs; withLevelB?: boolean }) {
  const result = fastResult(inputs, withLevelB);
  const automatic = result.method === 'automatic';
  return <Card>
    <CardTitle>{withLevelB ? 'Level A + Level B Results' : 'Level A Results'}</CardTitle>
    {automatic && <CardTitle>ARF-FAST positive — automatic criteria met</CardTitle>}
    {(result.scoreA !== null || withLevelB) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginVertical: 12 }}>
      {result.scoreA !== null && <View><Text style={{ fontSize: 26, fontWeight: '800', color: Colors.primary }}>{result.scoreA} / 7</Text><CardSubtitle>Level A · ARF-FAST</CardSubtitle></View>}
      {withLevelB && <View><Text style={{ fontSize: 26, fontWeight: '800', color: Colors.primary }}>{result.scoreB}</Text><CardSubtitle>Level B</CardSubtitle></View>}
    </View>}
    {!automatic && <CardTitle>{result.label}</CardTitle>}
    {automatic ? <>
      <CardSubtitle>Qualifying findings:</CardSubtitle>
      {automaticReasons(inputs).map(f => <Text key={f.id} style={{ color: Colors.text, marginBottom: 6 }}>{f.label}</Text>)}
      <CardSubtitle>Step 5 scoring was not needed because these findings establish an automatic-positive screening result.</CardSubtitle>
    </> : <CardSubtitle>{result.method === 'incomplete' ? 'Complete all Level A answers to calculate the score.' : 'Level A screening result · score ≥2 positive; 0–1 negative.'}</CardSubtitle>}
    {withLevelB && <Alert variant="warning">{COMBINED_PENDING}. Level A and Level B points are shown separately. Combined thresholds and resulting recommendations have not yet been agreed.</Alert>}
  </Card>;
}
