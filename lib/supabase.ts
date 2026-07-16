/**
 * Supabase client — QA / test-harness data backend.
 *
 * Credentials come from env vars (EXPO_PUBLIC_ prefix so they're inlined into
 * the bundle). Copy .env.example to .env and fill them in after creating a
 * project at https://supabase.com.
 *
 * SECURITY NOTE: the anon key is safe to ship in the bundle (it's RLS-gated),
 * BUT the QA policies in supabase/schema.sql are deliberately permissive
 * (anyone can read/write). That is fine for proving data flows. Before any
 * real patient data, replace those policies + add the client-side encryption
 * layer (Phase 3a/3b). Do not ship QA policies to production.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  // Cloud sync is disabled (local-only mode). We do NOT call createClient()
  // here because it throws on an empty URL — see lib/sync.ts, which gates every
  // access behind `isSupabaseConfigured`, so the null placeholder is never used.
  console.info(
    '[supabase] Cloud sync disabled (no EXPO_PUBLIC_SUPABASE_URL / anon key). ' +
      'Using local storage. See supabase/README.md to enable.',
  );
}

// Lazy singleton: only constructed once env vars are present, so the import
// chain never throws in local-only builds.
let _client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — set EXPO_PUBLIC_SUPABASE_URL and anon key.');
  }
  _client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: true, // keep the session across reloads. Web: localStorage (auto-detected). Native: add an AsyncStorage storage adapter in Phase 2b.
      autoRefreshToken: true,
    },
  });
  return _client;
}
