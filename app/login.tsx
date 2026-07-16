/**
 * Login — email/password sign-in + sign-up. The app gate redirects here when
 * there's no session. After sign-up the account is created with approved=false
 * (pending) — the screen then shows a "pending approval" message until an admin
 * approves it.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, CardSubtitle, CardTitle, PrimaryButton, SecondaryButton, TextField } from '@/components/ui/primitives';
import { useAuth } from '@/state/AuthContext';
import { Colors } from '@/constants/theme';

type Mode = 'signin' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  const { user, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Account exists but isn't approved yet → show pending, not the form.
  if (user && !user.profile.approved) {
    return (
      <View style={styles.wrap}>
        <Card>
          <CardTitle>Account Pending</CardTitle>
          <CardSubtitle>
            Hi {user.profile.displayName || 'there'} — your account is awaiting admin approval.
            You'll get access once a clinic admin approves it.
          </CardSubtitle>
          <SecondaryButton title="Sign out" onPress={signOut} />
        </Card>
      </View>
    );
  }

  const submit = async () => {
    setErr(null);
    if (!email.trim() || !password) return setErr('Email and password are required.');
    if (mode === 'signup' && !name.trim()) return setErr('Display name is required.');
    setBusy(true);
    const { error } =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password, name);
    setBusy(false);
    if (error) return setErr(error);
    // On success the auth state change fires → the gate redirects (or shows
    // pending for a brand-new unapproved account).
  };

  return (
    <View style={styles.wrap}>
      <Card>
        <CardTitle>{mode === 'signin' ? 'Sign In' : 'Create Account'}</CardTitle>
        <CardSubtitle>
          SMART-ARF clinical decision support. {mode === 'signin' ? 'Welcome back.' : 'Your account starts pending admin approval.'}
        </CardSubtitle>

        {mode === 'signup' && (
          <TextField label="Display name" value={name} onChangeText={setName} placeholder="e.g. Dr. Amina" />
        )}
        <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@clinic.org" keyboardType="email-address" autoCapitalize="none" />
        <TextField label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

        {err ? <Text style={styles.err}>{err}</Text> : null}

        <PrimaryButton title={busy ? '…' : mode === 'signin' ? 'Sign In' : 'Create Account'} onPress={submit} />

        <Text style={styles.toggle} onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null); }}>
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 16, maxWidth: 480, width: '100%', alignSelf: 'center', backgroundColor: Colors.bg },
  err: { color: Colors.danger, fontSize: 13, marginTop: 6, marginBottom: 6 },
  toggle: { color: Colors.primary, textAlign: 'center', marginTop: 14, fontSize: 14, fontWeight: '600' },
});
