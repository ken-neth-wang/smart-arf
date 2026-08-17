/**
 * ClinicPicker — the ONE clinic control (docs plan §4.1, revised by owner).
 *
 * Header chip on every tab. Multi-clinic users only. Sets the acting clinic
 * (AuthContext.activeClinicId), which scopes the records/home lists and stamps
 * new visits. Visibility itself is membership-based (RLS) — the picker never
 * changes the security boundary.
 *
 * - `allOption` (Records tab): adds an "All my clinics" viewing entry. Selecting
 *   it is VIEW-ONLY — starting an assessment snaps back to a real clinic.
 * - LOCKED while an assessment draft is in progress (hasDraft): switching
 *   mid-assessment would silently re-stamp the clinic the visit saves under.
 *   Tap shows an explanation; clear the draft (Assess tab → restarts) or save.
 */
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/state/AuthContext';
import { useAssessment } from '@/state/AssessmentContext';
import { useRecords } from '@/state/RecordsContext';
import { roleForClinic } from '@/lib/permissions';
import { ALL_CLINICS } from '@/state/actingClinic';
import { Colors } from '@/constants/theme';

export function ClinicPicker({ allOption = false }: { allOption?: boolean }) {
  const { user, activeClinicId, setActiveClinic } = useAuth();
  const { clinics } = useRecords();
  const { hasDraft } = useAssessment();
  const [open, setOpen] = useState(false);

  const memberships = user?.memberships ?? [];
  if (!user || memberships.length <= 1) return null;

  const myClinics = clinics.filter((c) => memberships.some((m) => m.clinicId === c.id));
  const isAll = activeClinicId === ALL_CLINICS;
  const active = myClinics.find((c) => c.id === activeClinicId);

  const lock = () =>
    Alert.alert(
      'Clinic locked',
      'An assessment is in progress — the clinic can’t change while patient data is being entered (it decides where the visit is saved).\n\nFinish and save it, or clear it by tapping the Assess tab (that restarts a fresh assessment).',
    );

  return (
    <View>
      <Pressable
        onPress={() => (hasDraft ? lock() : setOpen((o) => !o))}
        style={[styles.chip, hasDraft && styles.chipLocked]}
        hitSlop={8}>
        <Text style={styles.chipText} numberOfLines={1}>
          {hasDraft ? '🔒 ' : ''}
          {isAll ? 'All my clinics' : (active?.name ?? 'Clinic')} ▾
        </Text>
      </Pressable>
      {open && !hasDraft ? (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={styles.menu}>
            <Text style={styles.hint}>Acting clinic — used for records &amp; new visits</Text>
            {myClinics.map((c) => {
              const role = roleForClinic(user, c.id);
              const isActive = c.id === activeClinicId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    setActiveClinic(c.id);
                    setOpen(false);
                  }}
                  style={[styles.item, isActive && styles.itemActive]}>
                  <Text style={[styles.itemText, isActive && styles.itemTextActive]}>
                    {c.name}
                    {role ? <Text style={styles.role}> · {role === 'admin' ? 'admin' : 'health worker'}</Text> : null}
                  </Text>
                  {isActive ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
            {allOption ? (
              <Pressable
                onPress={() => {
                  setActiveClinic(ALL_CLINICS);
                  setOpen(false);
                }}
                style={[styles.item, isAll && styles.itemActive]}>
                <Text style={[styles.itemText, isAll && styles.itemTextActive]}>
                  All my clinics<Text style={styles.role}> · view only</Text>
                </Text>
                {isAll ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const WHITE = '#ffffff';

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 11,
    paddingVertical: 4,
    marginRight: 6,
    maxWidth: 190,
  },
  chipLocked: { opacity: 0.75 },
  chipText: { color: WHITE, fontSize: 12.5, fontWeight: '700' },
  backdrop: {
    position: 'absolute',
    top: -400,
    right: -400,
    width: 1000,
    height: 1000,
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    top: 36,
    right: 0,
    width: 260,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
    zIndex: 40,
  },
  hint: {
    fontSize: 10.5,
    color: Colors.gray,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.grayLight,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemActive: { backgroundColor: Colors.primaryLight },
  itemText: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  itemTextActive: { color: Colors.primaryDark },
  role: { fontSize: 11, color: Colors.gray, fontWeight: '500' },
  check: { color: Colors.primary, fontWeight: '800' },
});
