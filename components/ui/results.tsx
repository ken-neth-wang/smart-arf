/**
 * Result/summary components — ports of `.chorea-banner`, `.result-card`,
 * `.score-breakdown`, `.patient-code-card`, `.live-score-card` from
 * smart-arf-app.html. Source of truth: smart-arf-app.html.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Colors, tierColor } from '@/constants/theme';
import type { BreakdownRow, TierLevel } from '@/lib/types';

/* ---- Chorea banner (Steps 3–6) ---- */
export function ChoreaBanner({ step3 = false }: { step3?: boolean }) {
  return (
    <View style={choreaStyles.wrap}>
      <Text style={choreaStyles.title}>⚠ Chorea Confirmed — ARF Positive (major criterion)</Text>
      <Text style={choreaStyles.body}>
        Start Benzathine Penicillin G (BPG) and refer urgently regardless of total score.
        {step3 ? '\nChorea automatically adds +5 to the score.' : ''}
      </Text>
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
};
const tierBorder: Record<string, string> = {
  unlikely: Colors.success,
  possible: Colors.warning,
  likely: Colors.danger,
  urgent: Colors.urgent,
};

export function ResultCard({
  level,
  score,
  label,
  rangeLine,
  actions,
}: {
  level: TierLevel;
  score: number;
  label: string;
  rangeLine: React.ReactNode;
  actions: string[];
}) {
  const color = tierColor[level] ?? Colors.gray;
  return (
    <View style={[resultStyles.card, { backgroundColor: tierBg[level] ?? Colors.grayLight, borderColor: tierBorder[level] ?? Colors.border }]}>
      <Text style={[resultStyles.score, { color }]}>{score}</Text>
      <Text style={[resultStyles.label, { color }]}>{label}</Text>
      <Text style={[resultStyles.range, { color }]}>{rangeLine}</Text>

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
  score: { fontSize: 52, fontWeight: '900', lineHeight: 56, marginBottom: 5 },
  label: { fontSize: 18, fontWeight: '800', marginBottom: 3 },
  range: { fontSize: 12.5, marginBottom: 16, textAlign: 'center', lineHeight: 18 },
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
export function PatientCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <View style={codeStyles.wrap}>
      <Text style={codeStyles.label}>Patient Referral Code</Text>
      <Text style={codeStyles.code}>{code}</Text>
      <Pressable onPress={copy} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={16} color={Colors.primary} />
          <Text style={codeStyles.copy}>{copied ? 'Copied!' : 'Copy code'}</Text>
        </View>
      </Pressable>
      <Text style={codeStyles.hint}>Share this code with the referred facility for continuity of care.</Text>
    </View>
  );
}
const codeStyles = StyleSheet.create({
  wrap: { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.primary, borderStyle: 'dashed', borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, color: Colors.textSecondary, marginBottom: 8 },
  code: { fontFamily: 'Courier', fontSize: 27, fontWeight: '900', letterSpacing: 2, color: Colors.primary, marginBottom: 8 },
  copy: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 10, textAlign: 'center' },
});

/* ---- Live score mini card ---- */
export function LiveScoreCard({ score, label, total = 23, subtitle }: { score: number; label: string; total?: number; subtitle?: string }) {
  return (
    <View style={liveStyles.box}>
      <Text style={liveStyles.label}>{subtitle ?? 'Current Level A Score'}</Text>
      <Text style={liveStyles.num}>{score}</Text>
      <Text style={liveStyles.interp}>{label}</Text>
    </View>
  );
}
const liveStyles = StyleSheet.create({
  box: { backgroundColor: Colors.white, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: Colors.textSecondary, marginBottom: 3 },
  num: { fontSize: 42, fontWeight: '900', color: Colors.primary, lineHeight: 46 },
  interp: { fontSize: 13.5, marginTop: 3, fontWeight: '600', color: Colors.text },
});
