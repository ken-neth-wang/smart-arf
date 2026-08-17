/**
 * AuthContext — exposes the current Supabase Auth session as the AuthUser shape
 * that lib/permissions.ts expects, plus signIn / signUp / signOut.
 *
 * In local mode (EXPO_PUBLIC_DATA_BACKEND != 'supabase') there is no auth —
 * `user` stays null, `loading` is false, and the app gate skips auth entirely.
 *
 * Session persistence is handled by the Supabase client (lib/supabase.ts):
 * persistSession + AsyncStorage, so a logged-in user survives reloads.
 */
import { AppState } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { loadMembershipsCloud, loadProfileCloud } from '@/lib/sync';
import { clinicsForUser } from '@/lib/permissions';
import { ALL_CLINICS, loadActiveClinicId, saveActiveClinicId } from './actingClinic';
import type { AuthUser } from '@/lib/permissions';
import type { Session } from '@supabase/supabase-js';

const DATA_BACKEND = (process.env.EXPO_PUBLIC_DATA_BACKEND ?? 'local') as 'local' | 'supabase';
const USE_CLOUD = DATA_BACKEND === 'supabase';

interface SessionLike {
  user?: { id: string };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean; // initial session check (blocks the app gate while true)
  /** The clinic the user is working at (acting clinic). Clinic-at-a-time model:
   *  drives the records scope + new-visit attribution. Membership-based RLS is
   *  the security boundary — this only narrows the default view. */
  activeClinicId: string | null;
  setActiveClinic: (clinicId: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  needsPassword: boolean; // invited (no password yet) or forgot-password → must set one
  passwordRecovery: boolean; // distinguishes the forgot-password subtitle
  setPassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(null);
  const [session, setSession] = useState<SessionLike | null>(null);
  // Only block on cloud mode; local mode has no session to resolve.

  // Acting clinic: restore the persisted choice once…
  useEffect(() => {
    let mounted = true;
    loadActiveClinicId().then((id) => {
      if (mounted) setActiveClinicIdState(id);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // …and keep it valid: if the persisted clinic is no longer one of the user's
  // (membership removed / different account), fall back to the first membership.
  // The ALL_CLINICS sentinel stays valid while ≥2 memberships exist.
  useEffect(() => {
    if (!user) {
      setActiveClinicIdState(null);
      return;
    }
    const clinics = clinicsForUser(user);
    setActiveClinicIdState((prev) => {
      if (prev === ALL_CLINICS) return clinics.length > 1 ? prev : (clinics[0] ?? null);
      return prev && clinics.includes(prev) ? prev : (clinics[0] ?? null);
    });
  }, [user]);

  const setActiveClinic = useCallback((clinicId: string | null) => {
    setActiveClinicIdState(clinicId);
    void saveActiveClinicId(clinicId);
  }, []);
  const [loading, setLoading] = useState(USE_CLOUD && isSupabaseConfigured);
  // Invited users land with no password (must_set_password metadata flag);
  // the forgot-password flow triggers a PASSWORD_RECOVERY event. Either → the
  // set-password interstitial rendered by _layout.
  const [mustSetPassword, setMustSetPassword] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  /** Build the AuthUser (profile + memberships) for a given auth uid. */
  const buildUser = useCallback(async (uid: string): Promise<AuthUser | null> => {
    try {
      const [profile, memberships] = await Promise.all([
        loadProfileCloud(uid),
        loadMembershipsCloud(uid),
      ]);
      if (!profile) return null;
      return { profile, memberships };
    } catch (err) {
      console.error('[auth] failed to load profile/memberships:', err);
      return null;
    }
  }, []);

  // Subscribe to auth state. We capture only the SESSION from the callback —
  // fetching profile/memberships inside onAuthStateChange can deadlock, so that
  // happens in the separate effect below driven by `session`.
  useEffect(() => {
    if (!USE_CLOUD || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    let mounted = true;

    const applySession = (event: string, s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      // Invited users are tagged must_set_password=true at invite time.
      setMustSetPassword(Boolean(s?.user?.user_metadata?.must_set_password));
      // Forgot-password link click → user must choose a new password.
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    };

    // Resolve any session restored from storage on cold start.
    supabase.auth.getSession().then(({ data: { session } }) => applySession('INITIAL_SESSION', session));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => applySession(event, s));

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // session → resolved AuthUser (profile + memberships)
  useEffect(() => {
    if (!USE_CLOUD) return;
    let active = true;
    (async () => {
      if (session?.user) {
        setUser(await buildUser(session.user.id));
      } else {
        setUser(null);
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [session, buildUser]);

  // Re-resolve profile + memberships when the app returns to the foreground.
  // Long-lived tabs (mobile web) otherwise keep a stale `user` — e.g. approved
  // flipped off, or a clinic membership added after login — and record with
  // outdated permissions. Only applied when the fetch succeeds.
  useEffect(() => {
    if (!USE_CLOUD || !isSupabaseConfigured || !session?.user) return;
    const uid = session.user.id;
    let active = true;
    const revalidate = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const u = await buildUser(uid);
      if (active && u) setUser(u);
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', revalidate);
      return () => {
        active = false;
        document.removeEventListener('visibilitychange', revalidate);
      };
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') revalidate();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [session, buildUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    // display_name lands in raw_user_meta_data → the handle_new_user trigger
    // copies it into profiles.display_name.
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    // With email confirmation ON, signUp creates the user but returns NO
    // session (data.session === null) until they click the confirmation link
    // in their email. We surface that so the login screen can prompt them.
    return { error: error?.message ?? null, needsEmailConfirmation: !error && !data.session };
    // Profile row is auto-created by the trigger with approved=false (pending).
  }, []);

  const setPassword = useCallback(async (newPassword: string) => {
    const { error } = await getSupabase().auth.updateUser({
      password: newPassword,
      data: { must_set_password: false }, // clear the invite flag
    });
    if (!error) {
      setMustSetPassword(false);
      setPasswordRecovery(false);
    }
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setUser(null);
    setMustSetPassword(false);
    setPasswordRecovery(false);
  }, []);

  const needsPassword = mustSetPassword || passwordRecovery;
  return (
    <AuthContext.Provider value={{ user, loading, activeClinicId, setActiveClinic, needsPassword, passwordRecovery, signIn, signUp, setPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Whether auth gating is active at all (only in cloud mode). */
export const AUTH_GATE_ACTIVE = USE_CLOUD;
