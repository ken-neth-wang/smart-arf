/**
 * Admin console — CLINIC-SCOPED (docs/user-clinic-management-plan.md §4.4).
 *
 * The console always manages the ACTING clinic (the same header picker the rest
 * of the app uses). Switch clinics → every card re-scopes. Cards:
 *   - Platform (platform admins only): create clinic, deactivate an account
 *   - Roster: one row per member of this clinic — role select, remove (×),
 *     last-admin guard; other-clinic memberships shown read-only
 *   - Add member by email (existing user joins; unknown email → invite)
 *   - Pending approvals: global list (pending users belong to no clinic);
 *     approving adds them HERE with the chosen role
 *   - Invite: into this clinic
 *   - Removed visits: restore (unchanged)
 *
 * All actions are RLS-gated server-side; this UI mirrors those rules.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert as AlertBox, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Alert,
  Card,
  CardTitle,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  StepBadge,
  TextField,
  type SelectOption,
} from '@/components/ui/primitives';
import { useAuth } from '@/state/AuthContext';
import { ALL_CLINICS } from '@/state/actingClinic';
import { useRecords } from '@/state/RecordsContext';
import { isAdminAnywhere, isAdminAt, isPlatformAdmin } from '@/lib/permissions';
import { describeSaveError } from '@/lib/errors';
import type { Role } from '@/lib/permissions';
import {
  addMemberByEmailCloud,
  approveUserCloud,
  createClinicCloud,
  deactivateUserCloud,
  inviteUserCloud,
  loadAllowedEmailsCloud,
  loadPendingProfilesCloud,
  loadRosterCloud,
  removeAllowedEmailCloud,
  removeMembershipCloud,
  updateMembershipRoleCloud,
  type AllowedEmail,
  type PendingProfile,
  type RosterMember,
} from '@/lib/admin';
import { Colors } from '@/constants/theme';

const ROLE_OPTS: SelectOption[] = [
  { label: 'Health Worker', value: 'health_worker' },
  { label: 'Admin', value: 'admin' },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLINIC_TYPE_OPTS: SelectOption[] = [
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Tertiary', value: 'tertiary' },
];

export default function AdminScreen() {
  const { user, activeClinicId } = useAuth();
  const { clinics, refresh: refreshRecords, encounters, getPatientById, restoreEncounter, loading: recordsLoading } = useRecords();
  const router = useRouter();

  const [allowed, setAllowed] = useState<AllowedEmail[]>([]);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // invite / add-member forms (both target the ACTING clinic)
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('health_worker');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<Role>('health_worker');
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [newClinicName, setNewClinicName] = useState('');
  const [clinicType, setClinicType] = useState('primary');

  // The console always manages a REAL clinic — "All my clinics" (view mode)
  // falls back to the user's first membership.
  const adminClinicId =
    activeClinicId === ALL_CLINICS
      ? (user && user.memberships[0]?.clinicId) ?? null
      : activeClinicId;
  const actingClinic = clinics.find((c) => c.id === adminClinicId);
  const clinicName = actingClinic?.name ?? '—';
  const platform = isPlatformAdmin(user);
  /** Manage rights at the acting clinic (roster edits, approvals, invites). */
  const manageHere = !!activeClinicId && !!user && isAdminAt(user, activeClinicId);
  const adminCountHere = roster.filter((m) => m.role === 'admin').length;

  const refresh = useCallback(async () => {
    if (!adminClinicId) {
      setAllowed([]);
      setPending([]);
      setRoster([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [a, p, r] = await Promise.all([
        loadAllowedEmailsCloud(),
        loadPendingProfilesCloud(),
        loadRosterCloud(adminClinicId),
      ]);
      setAllowed(a);
      setPending(p);
      setRoster(r);
    } catch (e) {
      setError(describeSaveError(e));
    } finally {
      setLoading(false);
    }
  }, [activeClinicId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Soft-deleted visits (admin restore). Patients are restored via SQL.
  const deletedVisits = encounters
    .filter((e) => e.inactive)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));

  const onRestore = async (encounterId: string) => {
    if (busyAction) return;
    setBusyAction(`restore:${encounterId}`);
    setError(null);
    try {
      await restoreEncounter(encounterId);
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onInvite = async () => {
    if (busyAction || !adminClinicId) return;
    const e = inviteEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return setError('Enter a valid email address.');
    setBusyAction('invite');
    setError(null);
    try {
      await inviteUserCloud(e, adminClinicId, inviteRole, inviteName);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('health_worker');
      await refresh();
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onAddMember = async () => {
    if (busyAction || !adminClinicId) return;
    const e = addEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return setError('Enter a valid email address.');
    setBusyAction('add-member');
    setError(null);
    try {
      await addMemberByEmailCloud(e, adminClinicId, addRole);
      setAddEmail('');
      setAddRole('health_worker');
      await refresh();
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onApprove = async (p: PendingProfile, role: Role) => {
    if (busyAction || !adminClinicId) return;
    setBusyAction(`approve:${p.id}`);
    setError(null);
    try {
      await approveUserCloud(p.id, adminClinicId, role);
      await refresh();
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onRoleChange = async (m: RosterMember, role: Role) => {
    if (busyAction || !adminClinicId) return;
    setBusyAction(`role:${m.userId}`);
    setError(null);
    try {
      await updateMembershipRoleCloud(m.userId, adminClinicId, role);
      await refresh();
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onRemoveMember = (m: RosterMember) => {
    const clinicIdNow = adminClinicId;
    if (busyAction || !clinicIdNow || !user) return;
    const isSelf = m.userId === user.profile.id;
    const isLastAdmin = m.role === 'admin' && adminCountHere <= 1;
    if (isSelf || (!platform && isLastAdmin)) return;
    AlertBox.alert(
      'Remove from clinic?',
      `${m.email || m.displayName || 'This member'} loses access to ${clinicName}. Records they created stay with the clinic.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyAction(`remove:${m.userId}`);
            setError(null);
            try {
              await removeMembershipCloud(m.userId, clinicIdNow);
              await refresh();
            } catch (err) {
              setError(describeSaveError(err));
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  };

  const onDeactivate = (m: RosterMember) => {
    if (busyAction || !user) return;
    AlertBox.alert(
      'Deactivate account?',
      `${m.email || 'This user'} loses access to ALL clinics (reversible — they return to Pending).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            setBusyAction(`deactivate:${m.userId}`);
            setError(null);
            try {
              await deactivateUserCloud(m.userId);
              await refresh();
            } catch (err) {
              setError(describeSaveError(err));
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
    );
  };

  const onRevokeInvite = async (email: string) => {
    if (busyAction) return;
    setBusyAction(`revoke:${email}`);
    setError(null);
    try {
      await removeAllowedEmailCloud(email);
      await refresh();
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onCreateClinic = async () => {
    if (busyAction) return;
    if (!newClinicName.trim()) return setError('Enter a clinic name.');
    setBusyAction('create-clinic');
    setError(null);
    try {
      await createClinicCloud(newClinicName, clinicType);
      setNewClinicName('');
      setClinicType('primary');
      await refreshRecords();
    } catch (err) {
      setError(describeSaveError(err));
    } finally {
      setBusyAction(null);
    }
  };

  if (!isAdminAnywhere(user)) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <Card>
          <StepBadge>Access Denied</StepBadge>
          <CardTitle>Admins only</CardTitle>
          <Text style={styles.line}>You need an admin role to view this page.</Text>
          <View style={{ marginTop: 12 }}>
            <SecondaryButton title="← Back" onPress={() => router.back()} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  const clinicInvites = allowed.filter((a) => a.clinicId === activeClinicId);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 48, maxWidth: 620, width: '100%', alignSelf: 'center' }}>
      <View style={{ marginBottom: 8 }}>
        <SecondaryButton title="← Back" onPress={() => router.back()} />
      </View>

      {error ? (
        <View style={{ marginBottom: 10 }}>
          <Alert variant="warning">{error}</Alert>
        </View>
      ) : null}

      <View style={styles.ctxStrip}>
        <Text style={styles.ctxText}>🏥 Managing {clinicName} — switch clinics in the header</Text>
      </View>

      {/* ── Platform (platform admins only) ── */}
      {platform ? (
        <Card>
          <StepBadge>Platform</StepBadge>
          <CardTitle>Cross-clinic actions</CardTitle>
          <Text style={styles.line}>Create clinics — the only action here that crosses clinic boundaries (deactivation lives in roster rows).</Text>
          <TextField label="New clinic name" value={newClinicName} onChangeText={setNewClinicName} placeholder="e.g. City Hospital" />
          <SelectField label="Type" value={clinicType} options={CLINIC_TYPE_OPTS} onChange={setClinicType} />
          <PrimaryButton title={busyAction === 'create-clinic' ? 'Creating…' : 'Create Clinic'} disabled={!newClinicName.trim() || !!busyAction} onPress={onCreateClinic} />
        </Card>
      ) : null}

      {/* ── Roster (the acting clinic's members) ── */}
      <Card>
        <StepBadge>Roster</StepBadge>
        <CardTitle>Members here</CardTitle>
        {!manageHere ? (
          <Text style={styles.line}>You're not an admin at {clinicName} — roster is read-only.</Text>
        ) : null}
        {loading && roster.length === 0 ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : roster.length === 0 ? (
          <Text style={styles.muted}>No members yet at this clinic.</Text>
        ) : (
          roster.map((m) => {
            const isSelf = !!user && m.userId === user.profile.id;
            const isLastAdmin = m.role === 'admin' && adminCountHere <= 1;
            const canManage = manageHere && !isSelf && (platform || !isLastAdmin);
            return (
              <View key={m.userId} style={styles.memberRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberEmail} numberOfLines={1}>{m.email || m.displayName || m.userId.slice(0, 8)}</Text>
                  <Text style={styles.memberSub}>
                    {m.role === 'admin' ? 'Admin' : 'Health Worker'}
                    {isSelf ? ' · you' : ''}
                    {m.otherClinics.length > 0 ? ` · also at ${m.otherClinics.length} other clinic${m.otherClinics.length > 1 ? 's' : ''}` : ''}
                  </Text>
                  {isLastAdmin && !platform ? (
                    <Text style={styles.guardText}>⚠ Last admin of {clinicName} — protected</Text>
                  ) : null}
                </View>
                {manageHere ? (
                  <View style={styles.memberActions}>
                    <SelectField
                      label=""
                      value={m.role}
                      options={ROLE_OPTS}
                      onChange={(v) => void onRoleChange(m, v as Role)}
                    />
                    <SecondaryButton
                      title={busyAction === `remove:${m.userId}` ? '…' : '✕'}
                      onPress={() => onRemoveMember(m)}
                      disabled={!canManage || !!busyAction}
                    />
                    {platform && !isSelf ? (
                      <SecondaryButton
                        title={busyAction === `deactivate:${m.userId}` ? '…' : 'Deactivate'}
                        onPress={() => onDeactivate(m)}
                        disabled={!!busyAction}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        {manageHere ? (
          <View style={styles.addForm}>
            <TextInput
              value={addEmail}
              onChangeText={setAddEmail}
              placeholder="add by email — existing user or invite"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.addInput}
              placeholderTextColor={Colors.gray}
            />
            <SelectField label="" value={addRole} options={ROLE_OPTS} onChange={(v) => setAddRole(v as Role)} />
            <SecondaryButton
              title={busyAction === 'add-member' ? '…' : 'Add'}
              onPress={onAddMember}
              disabled={!addEmail || !!busyAction}
            />
          </View>
        ) : null}
      </Card>

      {/* ── Pending approvals (global list; approve INTO the acting clinic) ── */}
      <Card>
        <StepBadge>Pending Users</StepBadge>
        <CardTitle>Awaiting approval</CardTitle>
        <Text style={styles.line}>
          Pending signups belong to no clinic yet. Approving adds them to {clinicName}.
        </Text>
        {loading && pending.length === 0 ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : pending.length === 0 ? (
          <Text style={styles.muted}>No pending users. 🎉</Text>
        ) : (
          pending.map((p) => {
            const role = pendingRoles[p.id] ?? 'health_worker';
            return (
              <View key={p.id} style={styles.memberRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberEmail} numberOfLines={1}>{p.email || p.displayName || 'Unknown user'}</Text>
                  {manageHere ? (
                    <SelectField
                      label=""
                      value={role}
                      options={ROLE_OPTS}
                      onChange={(v) => setPendingRoles((prev) => ({ ...prev, [p.id]: v as Role }))}
                    />
                  ) : null}
                </View>
                {manageHere ? (
                  <PrimaryButton
                    title={busyAction === `approve:${p.id}` ? 'Approving…' : 'Approve'}
                    color={Colors.success}
                    onPress={() => void onApprove(p, role)}
                    disabled={!!busyAction}
                  />
                ) : null}
              </View>
            );
          })
        )}
      </Card>

      {/* ── Invite (into the acting clinic) ── */}
      <Card>
        <StepBadge>Invite by Email</StepBadge>
        <CardTitle>Invite to {clinicName}</CardTitle>
        <Text style={styles.line}>
          The recipient gets an email, sets a password, and lands here with the role you choose.
        </Text>
        {manageHere ? (
          <View style={styles.form}>
            <TextField label="Name (optional)" value={inviteName} onChangeText={setInviteName} placeholder="Dr. Amina" />
            <TextField label="Email" value={inviteEmail} onChangeText={setInviteEmail} placeholder="name@clinic.org" keyboardType="email-address" autoCapitalize="none" />
            <SelectField label="Role" value={inviteRole} options={ROLE_OPTS} onChange={(v) => setInviteRole(v as Role)} />
            <PrimaryButton title={busyAction === 'invite' ? 'Sending…' : 'Send invite'} disabled={!inviteEmail || !!busyAction} onPress={onInvite} />
          </View>
        ) : (
          <Text style={styles.muted}>Only admins of {clinicName} can invite.</Text>
        )}
        {clinicInvites.length > 0 ? (
          clinicInvites.map((a) => (
            <View key={a.email} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberEmail}>{a.email}</Text>
                <Text style={styles.memberSub}>{a.role}{a.usedAt ? ' · accepted' : ' · invited'}</Text>
              </View>
              <SecondaryButton
                title={busyAction === `revoke:${a.email}` ? '…' : 'Revoke'}
                onPress={() => void onRevokeInvite(a.email)}
                disabled={!!busyAction}
              />
            </View>
          ))
        ) : null}
      </Card>

      {/* ── Deleted records (visit restore) ── */}
      <Card>
        <StepBadge>Deleted Records</StepBadge>
        <CardTitle>Removed Visits</CardTitle>
        <Text style={styles.line}>
          Visits removed by users are kept here — restore one to return it to the patient's record.
          (Removed patients are restored via the Supabase SQL Editor.)
        </Text>
        {recordsLoading && deletedVisits.length === 0 ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : deletedVisits.length === 0 ? (
          <Text style={styles.muted}>No removed visits. 🎉</Text>
        ) : (
          deletedVisits.map((e) => {
            const p = getPatientById(e.patientId);
            const name = p ? `${p.firstName} ${p.lastName}`.trim() || '(no name)' : 'Unknown patient';
            return (
              <View key={e.id} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberEmail}>
                    {name}
                    {p?.inactive ? '  ·  ⚠ patient also deleted' : ''}
                  </Text>
                  <Text style={styles.memberSub}>
                    {e.type === 'initial' ? 'Initial' : 'Follow-up'} · {e.date}
                    {e.deletedAt ? ` · removed ${new Date(e.deletedAt).toLocaleDateString()}` : ''}
                  </Text>
                  {e.deleteReason ? <Text style={styles.memberSub}>Reason: {e.deleteReason}</Text> : null}
                </View>
                <SecondaryButton
                  title={busyAction === `restore:${e.id}` ? '…' : 'Restore'}
                  disabled={!!busyAction}
                  onPress={() => void onRestore(e.id)}
                />
              </View>
            );
          })
        )}
      </Card>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: 13.5, color: Colors.textSecondary, marginBottom: 8, lineHeight: 19 },
  muted: { fontSize: 13.5, color: Colors.gray, paddingVertical: 8 },
  ctxStrip: {
    backgroundColor: Colors.primaryLight,
    borderColor: '#c3d7f0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  ctxText: { color: Colors.primaryDark, fontSize: 12.5, fontWeight: '700' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.grayLight,
  },
  memberEmail: { fontWeight: '700', fontSize: 13.5, color: Colors.text },
  memberSub: { fontSize: 12, color: Colors.gray, marginTop: 1 },
  guardText: { fontSize: 11.5, color: '#b45309', fontWeight: '700', marginTop: 3 },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addForm: { borderTopWidth: 1, borderTopColor: Colors.border, borderStyle: 'dashed', marginTop: 10, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  addInput: { flex: 1, minWidth: 140, borderWidth: 1, borderColor: Colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, backgroundColor: Colors.white, color: Colors.text },
  form: { gap: 4 },
});
