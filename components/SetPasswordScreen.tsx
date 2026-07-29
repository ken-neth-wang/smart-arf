/**
 * SetPasswordScreen — full-screen interstitial shown when the current user
 * must set or reset their password before reaching the app. Two triggers:
 *
 *  • `must_set_password` metadata flag (set at invite time) — the invited user
 *    was auto-logged-in by their invite link but has NO password yet.
 *  • PASSWORD_RECOVERY event — the user clicked a "reset password" email link.
 *
 * On success, `setPassword` clears the flags → the app gate proceeds. The
 * "Sign out" escape hatch resets the flags too (so the interstitial doesn't
 * reappear on a fresh sign-in).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, TextField } from '@/components/ui/primitives';
import { useAuth } from '@/state/AuthContext';
import { Colors } from '@/constants/theme';

const MIN = 8;

export function SetPasswordScreen() {
  const { setPassword, signOut, passwordRecovery } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    if (pw.length < MIN) return setErr(`Password must be at least ${MIN} characters.`);
    if (pw !== pw2) return setErr('Passwords do not match.');
    setBusy(true);
    const { error } = await setPassword(pw);
    setBusy(false);
    if (error) return setErr(error);
    // Success → needsPassword flips false → the app gate takes over.
  };

  const subtitle = passwordRecovery
    ? "Choose a new password for your account — you'll use it to sign in from now on."
    : 'You were invited to SMART-ARF. Choose a password to secure your account; you will use this email + password to sign in afterward.';

  return (
    <View style={styles.wrap}>
      <Card>
        <CardTitle>{passwordRecovery ? 'Reset Your Password' : 'Set Your Password'}</CardTitle>
        <CardSubtitle>{subtitle}</CardSubtitle>
        <TextField label="New password" value={pw} onChangeText={setPw} placeholder={`at least ${MIN} characters`} secureTextEntry />
        <TextField label="Confirm password" value={pw2} onChangeText={setPw2} placeholder="re-enter your password" secureTextEntry />
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <PrimaryButton title={busy ? '…' : 'Save password'} disabled={!!busy} onPress={submit} />
        <SecondaryButton title="Sign out" onPress={signOut} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 16, maxWidth: 480, width: '100%', alignSelf: 'center', backgroundColor: Colors.bg },
  err: { color: Colors.danger, fontSize: 13, marginTop: 6, marginBottom: 6 },
});
