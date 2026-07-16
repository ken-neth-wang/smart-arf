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
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { loadMembershipsCloud, loadProfileCloud } from '@/lib/sync';
import type { AuthUser } from '@/lib/permissions';

const DATA_BACKEND = (process.env.EXPO_PUBLIC_DATA_BACKEND ?? 'local') as 'local' | 'supabase';
const USE_CLOUD = DATA_BACKEND === 'supabase';

interface SessionLike {
  user?: { id: string };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean; // initial session check (blocks the app gate while true)
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<SessionLike | null>(null);
  // Only block on cloud mode; local mode has no session to resolve.
  const [loading, setLoading] = useState(USE_CLOUD && isSupabaseConfigured);

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

    // Resolve any session restored from storage on cold start.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));

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

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    // display_name lands in raw_user_meta_data → the handle_new_user trigger
    // copies it into profiles.display_name.
    const { error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    return { error: error?.message ?? null };
    // Profile row is auto-created by the trigger with approved=false (pending).
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
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
