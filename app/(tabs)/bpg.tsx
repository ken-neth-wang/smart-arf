/**
 * BPG Protocol — mirrors `#bpgScreen` in smart-arf-app.html (static 5-step
 * reference). Source of truth: smart-arf-app.html.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardSubtitle, CardTitle, StepBadge } from '@/components/ui/primitives';
import { Colors } from '@/constants/theme';

const STEPS: { title: string; desc: string; image?: ImageSourcePropType; aspectRatio?: number }[] = [
  { title: 'Verify indication & allergy history', desc: 'Confirm ARF suspicion. Ask about penicillin allergy — never administer if history of severe reaction.' },
  { title: 'Prepare BPG injection', desc: 'Reconstitute according to weight-based dosing (≤27 kg: 600,000 IU; >27 kg: 1.2 million IU).', image: require('@/assets/images/bpg_step2.png'), aspectRatio: 960 / 720 },
  { title: 'Administer deep IM injection', desc: 'Ask the patient to take a glass of fluid and lie down for two minutes before injection. Using Z-track technique, inject into upper outer quadrant of gluteus or vastus lateralis. Inject slowly and avoid veins.', image: require('@/assets/images/z_injection.png'), aspectRatio: 400 / 491 },
  { title: 'Observe patient for 15 minutes', desc: 'Monitor for anaphylaxis, rash, swelling, or difficulty swallowing before discharge.' },
  { title: 'Schedule follow-up dose', desc: 'Repeat every 3–4 weeks. Provide patient with referral code & written schedule.' },
];

export default function BpgScreen() {
  const router = useRouter();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <StepBadge>BPG Protocol</StepBadge>
        <CardTitle>Benzathine Penicillin G — 5-Step Protocol</CardTitle>
        <CardSubtitle>Quick reference for administering BPG to suspected ARF patients. Detailed steps and reference photos will be added.</CardSubtitle>

        {STEPS.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
              {s.image ? (
                <View style={styles.figure}>
                  <ExpoImage source={s.image} style={[styles.figureImg, s.aspectRatio ? { aspectRatio: s.aspectRatio } : null]} contentFit="contain" transition={120} />
                </View>
              ) : null}
              {i === 1 ? (
                <Pressable onPress={() => router.push('/bpg-prep')} style={({ pressed }) => [styles.guideLink, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.guideLinkText}>View step-by-step BPG preparation guide</Text>
                  <Ionicons name="chevron-forward" size={15} color={Colors.primary} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
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
  figure: { width: '100%', marginTop: 10, borderRadius: 8, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  figureImg: { width: '100%' },
  guideLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6, alignSelf: 'flex-start' },
  guideLinkText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
});
