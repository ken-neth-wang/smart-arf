/**
 * Result/summary components — ports of `.chorea-banner`, `.result-card`,
 * `.score-breakdown`, `.patient-code-card`, `.live-score-card` from
 * smart-arf-app.html. Source of truth: smart-arf-app.html.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, tierColor } from '@/constants/theme';
import type { BreakdownRow, TierLevel } from '@/lib/types';

/**
 * Chorea banner — exact per-step text from smart-arf-app.html:
 *   step3 (L1226): "Start Benzathine Penicillin G (BPG) and refer urgently.
 *                   Continue the assessment below for record-keeping.
 *                   Chorea automatically adds +5 to the score."
 *   step4 (L1361): "Start BPG and refer urgently regardless of total score."
 *   step5 (L1412): "Continue documenting Level B findings for the record."
 *   step6 (L1534): "BPG must be started and patient referred urgently regardless of total score."
 */
const CHOREA_BODIES: Record<3 | 4 | 5 | 6, string> = {
  3: 'Start Benzathine Penicillin G (BPG) and refer urgently. Continue the assessment below for record-keeping. Chorea automatically adds +5 to the score.',
  4: 'Start BPG and refer urgently regardless of total score.',
  5: 'Continue documenting Level B findings for the record.',
  6: 'BPG must be started and patient referred urgently regardless of total score.',
};
export function ChoreaBanner({ step }: { step: 3 | 4 | 5 | 6 }) {
  return (
    <View style={choreaStyles.wrap}>
      <Text style={choreaStyles.title}>⚠ Chorea Confirmed — ARF Positive (major criterion)</Text>
      <Text style={choreaStyles.body}>{CHOREA_BODIES[step]}</Text>
    </View>
  );
}
const choreaStyles = StyleSheet.create({
  wrap: { backgroundColor: Colors.urgentBg, borderWidth: 2, borderColor: Colors.urgent, borderRadius: 10, padding: 12, marginBottom: 14 },
  title: { color: Colors.urgent, fontSize: 14.5, fontWeight: '800', marginBottom: 3 },
  body: { color: Colors.urgent, fontSize: 13.5, lineHeight: 19 },
});

/* ---- Tier result card ---- */
const tierBg: Record<string, string> = {
  unlikely: Colors.successBg,
  possible: Colors.warningBg,
  likely: Colors.dangerBg,
  urgent: Colors.urgentBg,
  confirmed: Colors.urgentBg,
};
const tierBorder: Record<string, string> = {
  unlikely: Colors.success,
  possible: Colors.warning,
  likely: Colors.danger,
  urgent: Colors.urgent,
  confirmed: Colors.urgent,
};

export function ResultCard({
  level,
  scoreA,
  scoreB,
  label,
  actions,
}: {
  level: TierLevel;
  scoreA: number;
  scoreB?: number;
  label: string;
  actions: string[];
}) {
  const color = tierColor[level] ?? Colors.gray;
  return (
    <View style={[resultStyles.card, { backgroundColor: tierBg[level] ?? Colors.grayLight, borderColor: tierBorder[level] ?? Colors.border }]}>
      <View style={resultStyles.scoreRow}>
        <View style={resultStyles.scoreCol}>
          <Text style={[resultStyles.score, { color }]}>{scoreA}</Text>
          <Text style={[resultStyles.scoreCaption, { color }]}>Level A</Text>
        </View>
        {scoreB !== undefined ? (
          <View style={resultStyles.scoreCol}>
            <Text style={[resultStyles.score, { color }]}>{scoreB}</Text>
            <Text style={[resultStyles.scoreCaption, { color }]}>Level B</Text>
          </View>
        ) : null}
      </View>
      <Text style={[resultStyles.label, { color }]}>{label}</Text>

      <View style={resultStyles.actionBox}>
        <Text style={resultStyles.actionHeading}>Recommended Actions</Text>
        {actions.map((a, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            <Text style={{ color: Colors.text, fontWeight: '800' }}>•</Text>
            <Text style={resultStyles.actionText}>{a}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const resultStyles = StyleSheet.create({
  card: { borderRadius: 14, padding: 22, marginBottom: 14, borderWidth: 2, alignItems: 'center' },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 32, marginBottom: 8 },
  scoreCol: { alignItems: 'center' },
  score: { fontSize: 48, fontWeight: '900', lineHeight: 52 },
  scoreCaption: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  label: { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  actionBox: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: 14, alignSelf: 'stretch' },
  actionHeading: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, color: Colors.text },
  actionText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 19 },
});

/* ---- Score breakdown ---- */
export function ScoreBreakdown({ title, rows }: { title?: string; rows: BreakdownRow[] }) {
  return (
    <View style={bdStyles.box}>
      {title ? <Text style={bdStyles.heading}>{title}</Text> : null}
      {rows.map((r, i) => {
        if (r.kind === 'subtotal') {
          return (
            <View key={i} style={bdStyles.subtotalRow}>
              <Text style={bdStyles.subtotalLabel}>{r.label}</Text>
              {r.points !== null ? <Text style={bdStyles.subtotalPts}>{r.points}</Text> : null}
            </View>
          );
        }
        if (r.kind === 'total') {
          return (
            <View key={i} style={bdStyles.totalRow}>
              <Text style={bdStyles.totalLabel}>{r.label}</Text>
              <Text style={bdStyles.totalPts}>{r.points}</Text>
            </View>
          );
        }
        if (r.kind === 'sub') {
          return (
            <View key={i} style={[bdStyles.row, { paddingLeft: 16 }]}>
              <Text style={{ fontSize: 12.5, color: Colors.textSecondary }}>{r.label}</Text>
            </View>
          );
        }
        if (r.kind === 'na') {
          return (
            <View key={i} style={bdStyles.row}>
              <Text style={bdStyles.label}>{r.label}</Text>
              <Text style={{ color: Colors.gray, fontSize: 12.5 }}>Not Available</Text>
            </View>
          );
        }
        if (r.kind === 'empty') {
          return (
            <View key={i} style={bdStyles.row}>
              <Text style={{ color: Colors.gray }}>{r.label}</Text>
              <Text style={bdStyles.pts}>0</Text>
            </View>
          );
        }
        // item
        return (
          <View key={i} style={bdStyles.row}>
            <Text style={bdStyles.label}>{r.label}</Text>
            {r.points !== null ? <Text style={bdStyles.pts}>+{r.points}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
const bdStyles = StyleSheet.create({
  box: { backgroundColor: Colors.white, borderRadius: 11, padding: 16, marginBottom: 14 },
  heading: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.grayLight },
  label: { fontSize: 14, color: Colors.text, flex: 1 },
  pts: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.grayLight, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 6, marginVertical: 4 },
  subtotalLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  subtotalPts: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: Colors.text },
  totalPts: { fontSize: 16, fontWeight: '800', color: Colors.primary },
});

/* ---- Patient code card ---- */
/**
 * Hints from smart-arf-app.html:
 *   step4 (L1513): "Write this code on the patient's referral slip. The receiving clinic can use it to view this assessment and add follow-up."
 *   step6 (L1731): "Receiving clinic can look up this code to view the full assessment and add follow-up."
 */
export function PatientCodeCard({ code, step = 4 }: { code: string; step?: 4 | 6 }) {
  const router = useRouter();
  const hint = step === 6
    ? 'Receiving clinic can look up this code to view the full assessment and add follow-up.'
    : "Write this code on the patient's referral slip. The receiving clinic can use it to view this assessment and add follow-up.";
  return (
    <View style={codeStyles.wrap}>
      <Text style={codeStyles.label}>Patient Referral Code</Text>
      <Text style={codeStyles.code}>{code}</Text>
      <Pressable onPress={() => router.push('/(tabs)/bpg')} style={({ pressed }) => [codeStyles.bpgBtn, pressed && { opacity: 0.85 }]}>
        <Text style={codeStyles.bpgText}>💊 View BPG Protocol</Text>
      </Pressable>
      <Text style={codeStyles.hint}>{hint}</Text>
    </View>
  );
}
const codeStyles = StyleSheet.create({
  wrap: { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, color: Colors.textSecondary, marginBottom: 8 },
  code: { fontFamily: 'Courier', fontSize: 27, fontWeight: '900', letterSpacing: 2, color: Colors.primary, marginBottom: 8 },
  bpgBtn: { backgroundColor: Colors.primary, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', marginTop: 10 },
  bpgText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  hint: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 10, textAlign: 'center' },
});

/* ---- Live score mini card ---- */
/**
 * label: when provided, rendered as the tier-tinted interpretation line (HTML
 * updateScore colours interp by tier). Empty string hides the line (Step 5 in
 * the HTML shows no interp — only number + label).
 */
export function LiveScoreCard({ score, label, subtitle }: { score: number; label: string; subtitle?: string }) {
  const interpColor = score <= 5 ? Colors.success : score <= 9 ? Colors.warning : score <= 14 ? Colors.danger : Colors.urgent;
  return (
    <View style={liveStyles.box}>
      <Text style={liveStyles.label}>{subtitle ?? 'Current Level A Score'}</Text>
      <Text style={liveStyles.num}>{score}</Text>
      {label ? <Text style={[liveStyles.interp, { color: interpColor }]}>{label}</Text> : null}
    </View>
  );
}
const liveStyles = StyleSheet.create({
  box: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.textSecondary, marginBottom: 3 },
  num: { fontSize: 42, fontWeight: '900', color: Colors.primary, lineHeight: 46 },
  interp: { fontSize: 13.5, marginTop: 3, fontWeight: '600', color: Colors.text },
});
