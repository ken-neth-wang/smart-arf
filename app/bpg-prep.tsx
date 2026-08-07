/**
 * BPG injection preparation — step-by-step reconstitution guide. Pushed from
 * the BPG Protocol tab. New screen (no smart-arf-app.html mirror).
 *
 * Reference photos: bpg_prep_1–4.jpg in assets/images/ (one per step).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Card } from '@/components/ui/primitives';
import { Colors } from '@/constants/theme';

const STEPS: { text: string; image: ImageSourcePropType; aspectRatio: number }[] = [
  { text: 'Inject diluent into the BPG vial (ensure the diluent is not cold).', image: require('@/assets/images/bpg_prep_1.jpg'), aspectRatio: 652 / 788 },
  { text: 'Mix until fully dissolved.', image: require('@/assets/images/bpg_prep_2.jpg'), aspectRatio: 623 / 794 },
  { text: 'Draw 5 ml into the syringe.', image: require('@/assets/images/bpg_prep_3.jpg'), aspectRatio: 623 / 935 },
  { text: 'Replace the syringe needle with a large-bore 18-gauge needle.', image: require('@/assets/images/bpg_prep_4.jpg'), aspectRatio: 605 / 794 },
];

export default function BpgPrepScreen() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Card>
        <Text style={styles.intro}>Follow each step in order to reconstitute BPG for intramuscular injection.</Text>

        {STEPS.map((s, i) => (
          <View key={i} style={styles.step}>
            <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepText}>{s.text}</Text>
              <View style={styles.figure}>
                <ExpoImage source={s.image} style={[styles.figureImg, { aspectRatio: s.aspectRatio }]} contentFit="contain" transition={120} />
              </View>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 14 },
  step: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, marginBottom: 10 },
  num: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  stepText: { fontWeight: '700', fontSize: 15, color: Colors.text, lineHeight: 20 },
  figure: { width: '100%', marginTop: 10, borderRadius: 8, overflow: 'hidden' },
  figureImg: { width: '100%' },
});
