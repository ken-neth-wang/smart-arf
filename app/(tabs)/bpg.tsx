/**
 * BPG Protocol — mirrors `#bpgScreen` in smart-arf-app.html (static 5-step
 * reference). Source of truth: smart-arf-app.html.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, CardSubtitle, CardTitle, StepBadge } from '@/components/ui/primitives';
import { Colors } from '@/constants/theme';

const STEPS: { title: string; desc: string }[] = [
  { title: 'Verify indication & allergy history', desc: 'Confirm ARF suspicion. Ask about penicillin allergy — never administer if history of severe reaction.' },
  { title: 'Prepare BPG injection', desc: 'Reconstitute according to weight-based dosing (≤27 kg: 600,000 IU; >27 kg: 1.2 million IU).' },
  { title: 'Administer deep IM injection', desc: 'Inject into upper outer quadrant of gluteus or vastus lateralis (children). Use Z-track technique.' },
  { title: 'Observe patient for 30 minutes', desc: 'Monitor for anaphylaxis or other reactions before discharge.' },
  { title: 'Schedule follow-up dose', desc: 'Repeat every 3–4 weeks. Provide patient with referral code & written schedule.' },
];

export default function BpgScreen() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>BPG Protocol</StepBadge>
        <CardTitle>Benzathine Penicillin G — 5-Step Protocol</CardTitle>
        <CardSubtitle>Quick reference for administering BPG to suspected ARF patients.</CardSubtitle>

        {STEPS.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.disclaimer}>⚕️ Detailed protocol with reference photos pending — content will be inserted here. This is a quick reference only and does not replace local clinical guidelines.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, marginBottom: 10 },
  num: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  stepTitle: { fontWeight: '800', fontSize: 15, marginBottom: 4, color: Colors.text },
  stepDesc: { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  disclaimer: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginTop: 14, paddingHorizontal: 6 },
});
