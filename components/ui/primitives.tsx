/**
 * SMART-ARF UI primitives — React Native ports of the CSS component classes in
 * smart-arf-app.html (`.card`, `.step-badge`, `.yn-btn`, `.radio-item`,
 * `.sym-item`, `.na-toggle`, `.btn`, `.alert`, `.cat-block`, etc.).
 * smart-arf-app.html is the source of truth for styling.
 */
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
  type TextStyle,
  type KeyboardTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

const TAP = 52;

/* ---------------- Card ---------------- */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});

/* ---------------- Step badge ---------------- */
export function StepBadge({ children }: { children: React.ReactNode }) {
  return <View style={badgeStyles.wrap}><Text style={badgeStyles.text}>{children}</Text></View>;
}
const badgeStyles = StyleSheet.create({
  wrap: { backgroundColor: Colors.primaryLight, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 10 },
  text: { color: Colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
});

/* ---------------- Headings ---------------- */
export function CardTitle({ children }: { children: React.ReactNode }) {
  return <Text style={headingStyles.h2}>{children}</Text>;
}
export function CardSubtitle({ children }: { children: React.ReactNode }) {
  return <Text style={headingStyles.sub}>{children}</Text>;
}
const headingStyles = StyleSheet.create({
  h2: { fontSize: 17, fontWeight: '800', marginBottom: 5, lineHeight: 21, color: Colors.text },
  sub: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16, lineHeight: 19 },
});

/* ---------------- Field label ---------------- */
export function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Text style={fieldStyles.label}>
      {children}
      {required ? <Text style={{ color: Colors.danger }}> *</Text> : null}
    </Text>
  );
}
const fieldStyles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6, color: Colors.text },
});

/* ---------------- Text field ---------------- */
interface TextFieldProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  style?: TextStyle;
  label?: React.ReactNode;
  required?: boolean;
  hint?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}
export function TextField({ value, onChangeText, placeholder, keyboardType, multiline, style, label, required, hint, autoCapitalize }: TextFieldProps) {
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[inputStyles.input, style]}
      />
      {hint ? <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: -10, marginBottom: 16 }}>{hint}</Text> : null}
    </View>
  );
}
const inputStyles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.white,
    minHeight: 50,
  },
});

/* ---------------- Select field (modal picker) ---------------- */
export interface SelectOption {
  label: string;
  value: string;
}
export function SelectField({
  label,
  value,
  options,
  placeholder = 'Select…',
  onChange,
  required,
  style,
}: {
  label?: React.ReactNode;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  required?: boolean;
  style?: ViewStyle;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <Pressable style={[selectStyles.trigger, style]} onPress={() => setOpen(true)}>
        <Text style={[selectStyles.triggerText, !selected && { color: Colors.gray }]}>{selected ? selected.label : placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={Colors.gray} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={selectStyles.overlay} onPress={() => setOpen(false)}>
          <View style={selectStyles.sheet}>
            <View style={selectStyles.sheetBar} />
            <ScrollView>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  style={({ pressed }) => [selectStyles.option, pressed && { backgroundColor: Colors.grayLight }, o.value === value && { backgroundColor: Colors.primaryLight }]}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[selectStyles.optionText, o.value === value && { color: Colors.primary, fontWeight: '800' }]}>{o.label}</Text>
                  {o.value === value ? <Ionicons name="checkmark" size={20} color={Colors.primary} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
const selectStyles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: Colors.white,
    minHeight: 50,
  },
  triggerText: { fontSize: 16, color: Colors.text, flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 30, maxHeight: '60%' },
  sheetBar: { width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.border, alignSelf: 'center', marginVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.grayLight },
  optionText: { fontSize: 16, color: Colors.text },
});

/* ---------------- Yes / No group ---------------- */
export function YesNoGroup({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={ynStyles.wrap}>
      <Pressable
        style={[ynStyles.btn, value === true && ynStyles.btnYes]}
        onPress={() => onChange(true)}
      >
        <Text style={[ynStyles.btnText, value === true && { color: Colors.success }]}>Yes</Text>
      </Pressable>
      <Pressable
        style={[ynStyles.btn, value === false && ynStyles.btnNo]}
        onPress={() => onChange(false)}
      >
        <Text style={[ynStyles.btnText, value === false && { color: Colors.primary }]}>No</Text>
      </Pressable>
    </View>
  );
}
const ynStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.white, alignItems: 'center', minHeight: TAP },
  btnYes: { borderColor: Colors.success, backgroundColor: Colors.successBg },
  btnNo: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  btnText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
});

/* ---------------- Radio list (single select with points) ---------------- */
interface RadioOption {
  id: string;
  name: string;
  desc?: string;
  points?: string;
}
export function RadioList({
  options,
  selectedId,
  onSelect,
}: {
  options: RadioOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View>
      {options.map((o) => {
        const selected = o.id === selectedId;
        return (
          <Pressable
            key={o.id}
            style={[radioStyles.item, selected && radioStyles.itemSelected]}
            onPress={() => onSelect(o.id)}
          >
            <View style={[radioStyles.dot, selected && { borderColor: Colors.primary }]}>
              {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[radioStyles.name, selected && { color: Colors.primaryDark }]}>{o.name}</Text>
              {o.desc ? <Text style={radioStyles.desc}>{o.desc}</Text> : null}
            </View>
            {o.points ? (
              <View style={[radioStyles.pts, selected && { backgroundColor: Colors.primaryDark }]}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{o.points}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
const radioStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, marginBottom: 8, backgroundColor: Colors.white, minHeight: TAP },
  itemSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  desc: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  pts: { backgroundColor: Colors.primary, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
});

/* ---------------- Checkbox row ---------------- */
/**
 * pointsBadge: shown verbatim (e.g. "+5", "no score").
 * group: when true the badge renders the literal text "group" with the indigo
 *   group color — mirrors the HTML inflammation markers (L1438–1456).
 */
export function CheckboxRow({
  label,
  sub,
  checked,
  onToggle,
  pointsBadge,
  muted,
  group,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onToggle: () => void;
  pointsBadge?: string;
  muted?: boolean;
  group?: boolean;
}) {
  const badgeText = group ? 'group' : pointsBadge;
  return (
    <Pressable
      style={[chkStyles.item, checked && chkStyles.itemChecked]}
      onPress={onToggle}
    >
      <View style={[chkStyles.box, checked && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}>
        {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={chkStyles.label}>{label}</Text>
        {sub ? <Text style={chkStyles.sub}>{sub}</Text> : null}
      </View>
      {badgeText ? (
        <View style={[chkStyles.pts, muted && { backgroundColor: Colors.gray }, group && { backgroundColor: Colors.groupBadge }]}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{badgeText}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
const chkStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 9, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white, marginBottom: 7, minHeight: TAP },
  itemChecked: { borderColor: Colors.primary, backgroundColor: Colors.symChecked },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14.5, fontWeight: '600', color: Colors.text, lineHeight: 19 },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  pts: { backgroundColor: Colors.primary, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
});

/* ---------------- Not-Available toggle ---------------- */
export function NAToggle({ active, onToggle, label = 'Not Available' }: { active: boolean; onToggle: () => void; label?: string }) {
  return (
    <Pressable
      style={[naStyles.wrap, active && { borderColor: Colors.warning, backgroundColor: Colors.warningBg }]}
      onPress={onToggle}
    >
      <View style={[naStyles.box, active && { backgroundColor: Colors.warning, borderColor: Colors.warning }]}>
        {active ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
      </View>
      <Text style={[naStyles.text, active && { color: Colors.warning }]}>{label}</Text>
    </Pressable>
  );
}
const naStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', backgroundColor: Colors.white, marginBottom: 14, minHeight: TAP },
  box: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
});

/* ---------------- Buttons ---------------- */
export function PrimaryButton({ title, onPress, color = Colors.primary }: { title: string; onPress: () => void; color?: string }) {
  return (
    <Pressable style={({ pressed }) => [btnStyles.primary, { backgroundColor: color }, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <Text style={btnStyles.primaryText}>{title}</Text>
    </Pressable>
  );
}
export function SecondaryButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [btnStyles.secondary, pressed && { backgroundColor: Colors.border }]} onPress={onPress}>
      <Text style={btnStyles.secondaryText}>{title}</Text>
    </Pressable>
  );
}
const btnStyles = StyleSheet.create({
  primary: { paddingVertical: 15, borderRadius: 11, alignItems: 'center', justifyContent: 'center', minHeight: TAP },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  secondary: { paddingVertical: 15, borderRadius: 11, alignItems: 'center', justifyContent: 'center', minHeight: TAP, backgroundColor: Colors.grayLight, borderWidth: 1.5, borderColor: Colors.border, marginTop: 10 },
  secondaryText: { color: Colors.textSecondary, fontSize: 16, fontWeight: '800', textAlign: 'center' },
});

/* ---------------- Alert ---------------- */
export function Alert({ variant = 'info', children }: { variant?: 'info' | 'warning'; children: React.ReactNode }) {
  const isWarn = variant === 'warning';
  return (
    <View style={{ borderLeftWidth: 4, borderLeftColor: isWarn ? Colors.warning : Colors.primary, backgroundColor: isWarn ? Colors.warningBg : Colors.primaryLight, borderRadius: 10, padding: 13, marginBottom: 14 }}>
      <Text style={{ color: isWarn ? '#92400e' : Colors.primaryDark, fontSize: 13.5, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

/* ---------------- Section divider ---------------- */
export function SectionDivider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 }}>
      <View style={{ flex: 1, height: 1.5, backgroundColor: Colors.border }} />
      <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
      <View style={{ flex: 1, height: 1.5, backgroundColor: Colors.border }} />
    </View>
  );
}

/* ---------------- Category block ---------------- */
export function CategoryBlock({
  title,
  titleSuffix,
  description,
  points,
  active,
  children,
}: {
  title: string;
  titleSuffix?: string; // e.g. "(max +8)" — smaller, regular weight (HTML L1422)
  description?: string;
  points: number;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[catStyles.block, active && { borderColor: Colors.primary, backgroundColor: Colors.primaryLight }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: description ? 6 : 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flex: 1, gap: 6 }}>
          <Text style={catStyles.title}>{title}</Text>
          {titleSuffix ? <Text style={{ fontSize: 11.5, fontWeight: '400', color: Colors.textSecondary }}>{titleSuffix}</Text> : null}
        </View>
        <View style={{ backgroundColor: points > 0 ? Colors.success : Colors.primary, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>+{points}</Text>
        </View>
      </View>
      {description ? <Text style={catStyles.desc}>{description}</Text> : null}
      {children}
    </View>
  );
}
const catStyles = StyleSheet.create({
  block: { backgroundColor: Colors.grayLight, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: Colors.border },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text, flex: 1 },
  desc: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10, fontStyle: 'italic' },
});

/* ---------------- Severity descriptors header ---------------- */
/** The dashed "Severity descriptors (documentation only, no score)" label above
 *  the carditis severity checkboxes — HTML L1364. */
export function SeverityHeader({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 }}>
      <View style={{ flex: 1, height: 1.5, backgroundColor: Colors.border }} />
      <Text style={{ fontSize: 11, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
      <View style={{ flex: 1, height: 1.5, backgroundColor: Colors.border }} />
    </View>
  );
}
