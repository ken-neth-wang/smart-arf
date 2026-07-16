/**
 * Admin console — manage the pre-approved email allowlist + approve pending
 * users. Reachable from Settings; guarded by `isAdmin`. Both data sources are
 * RLS-gated to admins server-side (is_admin()), so this is belt-and-suspenders.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { useRecords } from '@/state/RecordsContext';
import { isAdmin } from '@/lib/permissions';
import type { Role } from '@/lib/permissions';
import {
  addAllowedEmailCloud,
  approveUserCloud,
  createClinicCloud,
  deactivateUserCloud,
  loadActiveUsersCloud,
  loadAllowedEmailsCloud,
  loadPendingProfilesCloud,
  removeAllowedEmailCloud,
  type ActiveUser,
  type AllowedEmail,
  type PendingProfile,
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
  const { user } = useAuth();
  const { clinics, refresh: refreshRecords } = useRecords();
  const router = useRouter();

  const [allowed, setAllowed] = useState<AllowedEmail[]>([]);
  const [pending, setPending] = useState<PendingProfile[]>([]);
  const [active, setActive] = useState<ActiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // allowlist add form
  const [email, setEmail] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [role, setRole] = useState<Role>('health_worker');

  // pending approval form
  const [approveUserId, setApproveUserId] = useState('');
  const [approveClinicId, setApproveClinicId] = useState('');
  const [approveRole, setApproveRole] = useState<Role>('health_worker');

  // create-clinic form
  const [newClinicName, setNewClinicName] = useState('');
  const [clinicType, setClinicType] = useState('primary');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, p, act] = await Promise.all([
        loadAllowedEmailsCloud(),
        loadPendingProfilesCloud(),
        loadActiveUsersCloud(),
      ]);
      setAllowed(a);
      setPending(p);
      setActive(act);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clinicName = (id: string) => clinics.find((c) => c.id === id)?.name ?? '—';
  const clinicOptions = clinics.map((c) => ({ label: c.name, value: c.id }));
  const clinicPlaceholder = clinicOptions.length ? 'Select…' : 'Loading clinics…';
  const others = active.filter((u) => u.id !== user?.profile.id);

  const onAdd = async () => {
    if (busyAction) return;
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return setError('Enter a valid email address.');
    if (!clinicId) return setError('Pick a clinic.');
    setBusyAction('add');
    setError(null);
    try {
      await addAllowedEmailCloud(e, clinicId, role);
      setEmail('');
      setClinicId('');
      setRole('health_worker');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onRemove = async (mail: string) => {
    if (busyAction) return;
    setBusyAction(`remove:${mail}`);
    setError(null);
    try {
      await removeAllowedEmailCloud(mail);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onApprove = async () => {
    if (busyAction) return;
    if (!approveUserId) return setError('Pick a user to approve.');
    if (!approveClinicId) return setError('Pick a clinic.');
    setBusyAction(`approve:${approveUserId}`);
    setError(null);
    try {
      await approveUserCloud(approveUserId, approveClinicId, approveRole);
      setApproveUserId('');
      setApproveClinicId('');
      setApproveRole('health_worker');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const onDeactivate = async (userId: string) => {
    if (busyAction) return;
    setBusyAction(`deactivate:${userId}`);
    setError(null);
    try {
      await deactivateUserCloud(userId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  if (!isAdmin(user)) {
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

      {/* ── Clinics ── */}
      <Card>
        <StepBadge>Clinics</StepBadge>
        <CardTitle>Facilities</CardTitle>
        <Text style={styles.line}>
          Create a clinic so it's available in pickers and for user/patient assignment.
        </Text>
        <View style={styles.form}>
          <TextField label="Clinic name" value={newClinicName} onChangeText={setNewClinicName} placeholder="e.g. City Hospital" />
          <SelectField label="Type" value={clinicType} options={CLINIC_TYPE_OPTS} onChange={setClinicType} />
          <PrimaryButton title={busyAction === 'create-clinic' ? 'Creating…' : 'Create Clinic'} disabled={!newClinicName.trim() || !!busyAction} onPress={onCreateClinic} />
        </View>
        {clinics.length === 0 ? (
          <Text style={styles.muted}>No clinics yet.</Text>
        ) : (
          clinics.map((c) => (
            <View key={c.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryEmail}>{c.name}</Text>
                <Text style={styles.entrySub}>{c.type || '—'}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* ── Allowlist ── */}
      <Card>
        <StepBadge>Pre-approved Emails</StepBadge>
        <CardTitle>Allowlist</CardTitle>
        <Text style={styles.line}>
          A user who signs up with one of these emails is auto-approved and assigned a clinic/role —
          no manual step.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@clinic.org"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <SelectField label="Clinic" value={clinicId} options={clinicOptions} placeholder={clinicPlaceholder} onChange={setClinicId} />
          <SelectField label="Role" value={role} options={ROLE_OPTS} onChange={(v) => setRole(v as Role)} />
          <PrimaryButton title={busyAction === 'add' ? 'Adding…' : 'Add to Allowlist'} disabled={!email || !clinicId || !!busyAction} onPress={onAdd} />
        </View>

        {allowed.length === 0 ? (
          <Text style={styles.muted}>No entries yet.</Text>
        ) : (
          allowed.map((a) => (
            <View key={a.email} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryEmail}>{a.email}</Text>
                <Text style={styles.entrySub}>
                  {clinicName(a.clinicId)} · {a.role}
                  {a.usedAt ? ' · ✓ used' : ''}
                </Text>
              </View>
              <SecondaryButton title={busyAction === `remove:${a.email}` ? '…' : 'Remove'} onPress={() => onRemove(a.email)} />
            </View>
          ))
        )}
      </Card>

      {/* ── Pending approvals ── */}
      <Card>
        <StepBadge>Pending Users</StepBadge>
        <CardTitle>Awaiting Approval</CardTitle>
        <Text style={styles.line}>
          Users who signed up without being on the allowlist. Pick one, assign a clinic + role, and approve.
        </Text>

        {loading && pending.length === 0 ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : pending.length === 0 ? (
          <Text style={styles.muted}>No pending users. 🎉</Text>
        ) : (
          <View style={styles.form}>
            <SelectField
              label="User"
              value={approveUserId}
              options={pending.map((p) => ({ label: p.email || p.displayName || 'Unknown user', value: p.id }))}
              placeholder="Select user…"
              onChange={setApproveUserId}
            />
            <SelectField label="Clinic" value={approveClinicId} options={clinicOptions} placeholder={clinicPlaceholder} onChange={setApproveClinicId} />
            <SelectField label="Role" value={approveRole} options={ROLE_OPTS} onChange={(v) => setApproveRole(v as Role)} />
            <PrimaryButton
              title={busyAction === `approve:${approveUserId}` ? 'Approving…' : 'Approve'}
              color={Colors.success}
              disabled={!approveUserId || !approveClinicId || !!busyAction}
              onPress={onApprove}
            />
          </View>
        )}
      </Card>

      {/* ── Active users (deactivate / soft delete) ── */}
      <Card>
        <StepBadge>Active Users</StepBadge>
        <CardTitle>Current Access</CardTitle>
        <Text style={styles.line}>
          Approved users with clinic access. Deactivate to revoke access — reversible (they return to Pending).
        </Text>
        {others.length === 0 ? (
          <Text style={styles.muted}>No other active users.</Text>
        ) : (
          others.map((u) => (
            <View key={u.id} style={styles.entry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.entryEmail}>{u.email || u.displayName || 'Unknown'}</Text>
                <Text style={styles.entrySub}>
                  {u.memberships.map((m) => `${clinicName(m.clinicId)} · ${m.role}`).join(', ') || 'no clinic'}
                </Text>
              </View>
              <PrimaryButton
                title={busyAction === `deactivate:${u.id}` ? '…' : 'Deactivate'}
                color={Colors.danger}
                disabled={!!busyAction}
                onPress={() => onDeactivate(u.id)}
              />
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: 13.5, color: Colors.textSecondary, marginBottom: 8, lineHeight: 19 },
  muted: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  form: { marginTop: 8, gap: 10 },
  entry: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.grayLight, gap: 10 },
  entryEmail: { fontSize: 14, fontWeight: '700', color: Colors.text },
  entrySub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
});
