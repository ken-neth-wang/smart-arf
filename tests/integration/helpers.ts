/**
 * tests/integration/helpers.ts — RLS integration harness.
 *
 * Runs against a LOCAL supabase stack (`supabase start`), never hosted.
 * Gated behind RUN_RLS=1 so the default unit-test run is unaffected:
 *
 *   supabase start
 *   RUN_RLS=1 npx --yes jest@29 --config tests/jest.config.js tests/integration
 *
 * Each run is a FULL RESET: psql applies supabase/schema.sql (drops public
 * tables + empties auth.users), then personas are created through the auth
 * admin API (real JWTs — the same path the app uses) and seeded via the
 * service-role client (bypasses RLS).
 */
import { execSync } from 'child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Keys are read from `supabase status` at run time — never hardcoded — so the
// harness uses whatever the LOCAL stack actually issued this boot (new-style
// sb_publishable/sb_secret or classic demo JWTs). Env vars override for CI.
interface StackInfo {
  url: string;
  anon: string;
  service: string;
}

function stackInfo(): StackInfo {
  const raw = execSync('supabase status -o json', {
    stdio: ['pipe', 'pipe', 'pipe'],
  }).toString();
  const s = JSON.parse(raw) as Record<string, string>;
  return {
    url: s.API_URL ?? 'http://localhost:54321',
    anon: s.PUBLISHABLE_KEY ?? s.ANON_KEY ?? '',
    service: s.SECRET_KEY ?? s.SERVICE_ROLE_KEY ?? '',
  };
}

const STACK = stackInfo();
export const INT_URL = process.env.SUPABASE_INT_URL ?? STACK.url;
const ANON_KEY = process.env.SUPABASE_INT_ANON_KEY ?? STACK.anon;
const SERVICE_KEY = process.env.SUPABASE_INT_SERVICE_KEY ?? STACK.service;
const DB_URL =
  process.env.SUPABASE_INT_DB ?? 'postgresql://postgres:postgres@localhost:54322/postgres';

export const runRls = process.env.RUN_RLS === '1' ? describe : describe.skip;

export interface Persona {
  client: SupabaseClient;
  userId: string;
}

export interface World {
  service: SupabaseClient;
  clinicA: string;
  clinicB: string;
  clinicC: string;
  patientA1: string;      // clinic A, no referral
  patientB1: string;      // clinic B, no referral
  patientAref: string;    // clinic A, referred INTO B
  encounterA1: string;    // encounter on patientA1
  encounterAref: string;  // encounter on patientAref (referred_to_clinic_id = B)
  platform: Persona;
  adminA: Persona;
  adminB: Persona;
  workerA: Persona;
  workerAB: Persona;
  workerB: Persona;
  outsiderX: Persona;     // approved member of clinic C only
  pending: Persona;       // signed up, not approved, no membership
}

/** Full reset: apply canonical schema (drops tables, empties auth.users). */
export function resetDatabase(): void {
  // PostgREST reloads its schema cache on every DDL statement (event
  // triggers) — a reset script with hundreds of statements produces a reload
  // storm that churns for minutes. Silence the watchers for the duration.
  // They're owned by supabase_admin, so toggle them from inside the DB
  // container (local-stack-only trick; harmless if it fails).
  let dbContainer = '';
  try {
    dbContainer = execSync("docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1")
      .toString()
      .trim();
    execSync(
      `docker exec ${dbContainer} psql -U supabase_admin -d postgres -q -c ` +
        `"ALTER EVENT TRIGGER pgrst_ddl_watch DISABLE; ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;"`,
      { stdio: 'pipe' },
    );
  } catch {
    console.warn('could not disable pgrst event triggers — reset may be slow');
  }

  execSync(`psql '${DB_URL}' -v ON_ERROR_STOP=1 -q -f supabase/schema.sql`, {
    stdio: 'pipe',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  });

  if (dbContainer) {
    try {
      execSync(
        `docker exec ${dbContainer} psql -U supabase_admin -d postgres -q -c ` +
          `"ALTER EVENT TRIGGER pgrst_ddl_watch ENABLE; ALTER EVENT TRIGGER pgrst_drop_watch ENABLE;"`,
        { stdio: 'pipe' },
      );
    } catch {
      console.warn('could not re-enable pgrst event triggers');
    }
  }
}

/** …and wait until the cache actually knows about our tables. */
export async function waitForSchema(service: SupabaseClient): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const { error } = await service.from('clinics').select('id').limit(1);
    if (!error || !/schema cache/i.test(error.message)) return;
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 1000);
    await promise;
  }
  throw new Error('PostgREST schema cache did not refresh after reset');
}

async function makePersona(
  service: SupabaseClient,
  email: string,
): Promise<Persona> {
  const password = `pw-${email}-!A1`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${email}): ${error?.message}`);
  const client = createClient(INT_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sig = await client.auth.signInWithPassword({ email, password });
  if (sig.error) throw new Error(`signIn(${email}): ${sig.error.message}`);
  return { client, userId: data.user.id };
}


export async function seedWorld(): Promise<World> {
  const service = createClient(INT_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await waitForSchema(service);


  // ── clinics ──
  const clinics = await service
    .from('clinics')
    .insert([
      { name: 'City Hospital', type: 'primary' },
      { name: 'Riverside Clinic', type: 'secondary' },
      { name: 'Elsewhere Health', type: 'tertiary' },
    ])
    .select('id, name');
  if (clinics.error || !clinics.data) throw new Error(`seed clinics: ${clinics.error?.message}`);
  const byName = Object.fromEntries(clinics.data.map((c) => [c.name, c.id]));
  const clinicA = byName['City Hospital'] as string;
  const clinicB = byName['Riverside Clinic'] as string;
  const clinicC = byName['Elsewhere Health'] as string;

  // ── personas (handle_new_user fires → pending profiles) ──
  const platform = await makePersona(service, 'platform@test.local');
  const adminA = await makePersona(service, 'admina@test.local');
  const adminB = await makePersona(service, 'adminb@test.local');
  const workerA = await makePersona(service, 'workera@test.local');
  const workerAB = await makePersona(service, 'workerab@test.local');
  const workerB = await makePersona(service, 'workerb@test.local');
  const outsiderX = await makePersona(service, 'outsiderx@test.local');
  const pending = await makePersona(service, 'pending@test.local');
  const approvedIds = [
    platform.userId, adminA.userId, adminB.userId,
    workerA.userId, workerAB.userId, workerB.userId, outsiderX.userId,
  ];
  const upd = await service
    .from('profiles')
    .update({ approved: true, platform_admin: false })
    .in('id', approvedIds);
  if (upd.error) throw new Error(`approve: ${upd.error?.message}`);
  const platUpd = await service
    .from('profiles')
    .update({ platform_admin: true })
    .eq('id', platform.userId);
  if (platUpd.error) throw new Error(`platform flag: ${platUpd.error?.message}`);

  const mem = await service.from('clinic_memberships').insert([
    { user_id: adminA.userId, clinic_id: clinicA, role: 'admin' },
    { user_id: adminB.userId, clinic_id: clinicB, role: 'admin' },
    { user_id: workerA.userId, clinic_id: clinicA, role: 'health_worker' },
    { user_id: workerAB.userId, clinic_id: clinicA, role: 'health_worker' },
    { user_id: workerAB.userId, clinic_id: clinicB, role: 'health_worker' },
    { user_id: workerB.userId, clinic_id: clinicB, role: 'health_worker' },
    { user_id: outsiderX.userId, clinic_id: clinicC, role: 'health_worker' },
  ]);
  if (mem.error) throw new Error(`memberships: ${mem.error?.message}`);

  // ── clinical fixtures (service role: created_by null is fine) ──
  const pts = await service
    .from('patients')
    .insert([
      { id: 'pt-a1', first_name: 'Ann', last_name: 'One', mrn: 'A1', referral_code: 'RC-A1', clinic_id: clinicA },
      { id: 'pt-b1', first_name: 'Bob', last_name: 'One', mrn: 'B1', referral_code: 'RC-B1', clinic_id: clinicB },
      { id: 'pt-aref', first_name: 'Ref', last_name: 'In', mrn: 'AR', referral_code: 'RC-AR', clinic_id: clinicA },
    ])
    .select('id');
  const patientA1 = 'pt-a1';
  const patientB1 = 'pt-b1';
  const patientAref = 'pt-aref';

  const encs = await service
    .from('encounters')
    .insert([
      { id: 'en-a1', patient_id: patientA1, type: 'initial', date: '2026-08-15' },
      {
        id: 'en-aref', patient_id: patientAref, type: 'initial', date: '2026-08-15',
        referred_to_clinic_id: clinicB,
      },
    ])
    .select('id');
  if (encs.error || !encs.data) throw new Error(`encounters: ${encs.error?.message}`);

  // ── allowlist rows for scoping tests ──
  const allow = await service.from('allowed_emails').insert([
    { email: 'invite-a@test.local', clinic_id: clinicA, role: 'health_worker' },
    { email: 'invite-b@test.local', clinic_id: clinicB, role: 'health_worker' },
  ]);
  if (allow.error) throw new Error(`allowed_emails: ${allow.error?.message}`);

  return {
    service, clinicA, clinicB, clinicC,
    patientA1, patientB1, patientAref, encounterA1: 'en-a1', encounterAref: 'en-aref',
    platform, adminA, adminB, workerA, workerAB, workerB, outsiderX, pending,
  };
}

/** Convenience: assert an id list equals expected (sorted). */
export async function visiblePatients(p: Persona): Promise<string[]> {
  const { data, error } = await p.client
    .from('patients')
    .select('id')
    .order('id');
  if (error) throw new Error(`patients select: ${error.message}`);
  return (data ?? []).map((r) => r.id as string).sort();
}

/** Is the error an RLS / policy rejection (42501) or a DB guard exception? */
export function denied(err: Error | null): boolean {
  return !!err && (err.message.includes('42501') || err.message.includes('row-level security')
    || /new row violates|violates row-level|only platform admins|only admins can|is immutable/i.test(err.message));
}
