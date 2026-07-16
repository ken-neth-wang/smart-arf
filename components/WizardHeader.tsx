/**
 * WizardHeader — the assessment header (`.header` + `.progress-wrap` +
 * `.patient-banner` + `.score-tally` from smart-arf-app.html). Shown at the top
 * of the assessment wizard. Source of truth: smart-arf-app.html.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAssessment } from '@/state/AssessmentContext';
import { Colors } from '@/constants/theme';
import { ageFromDateOfBirth } from '@/lib/types';
import { maskMRN, maskPhone } from '@/lib/format';

export function WizardHeader() {
  const { patient, step, scoreA, referralCode } = useAssessment();
  const top = useSafeAreaInsets().top;
  const age = ageFromDateOfBirth(patient.dateOfBirth);

  const fill = step >= 6 ? 100 : ((step - 1) / 4) * 100;
  const label = step >= 6 ? 'Complete' : `Step ${step} of 5`;
  const showTally = step === 3;

  const name = `${patient.firstName} ${patient.lastName}`.trim();
  const meta = [
    patient.gender,
    age ? `${age}y` : '',
    patient.mrn ? `MRN: ${maskMRN(patient.mrn)}` : '',
    patient.phone1 ? `📞 ${maskPhone(patient.phone1)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const showBanner = Boolean(name);

  return (
    <View>
      <View style={[styles.header, { paddingTop: top + 14 }]}>
        <Text style={styles.title}>SMART-ARF</Text>
        <Text style={styles.subtitle}>ARF Clinical Decision Support & Triage</Text>
      </View>
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${fill}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{label}</Text>
      </View>
      {showBanner ? (
        <View style={styles.banner}>
          <Text style={styles.bannerName}>{name}</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.bannerMeta}>{meta}</Text>
            {referralCode ? (
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginTop: 2 }}>Referral Code: {referralCode}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {showTally ? (
        <View style={styles.tally}>
          <Text style={styles.tallyText}>
            Level A Score: <Text style={styles.tallyNum}>{scoreA}</Text> / 23
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingBottom: 14 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 12, textAlign: 'center', marginTop: 2 },
  progressWrap: { backgroundColor: Colors.primaryDark, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressBg: { flex: 1, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 99, height: 5 },
  progressFill: { backgroundColor: '#fff', height: 5, borderRadius: 99 },
  progressLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontWeight: '600' },
  banner: { backgroundColor: Colors.patientBannerBg, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  bannerName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bannerMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  tally: { backgroundColor: Colors.primaryDark, paddingVertical: 7, alignItems: 'center' },
  tallyText: { color: '#fff', fontSize: 13.5, fontWeight: '600' },
  tallyNum: { fontSize: 17, fontWeight: '900' },
});
