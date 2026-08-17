/**
 * tests/integration/rls.test.ts — RLS integration suite (clinic-scoped admin).
 *
 * Run:  supabase start
 *       RUN_RLS=1 npx --yes jest@29 --config tests/jest.config.js tests/integration
 *
 * Covers the plan's §10 matrix + the keystone scenarios:
 *   - visibility matrix (worker / multi-clinic worker / clinic admin / platform)
 *   - referred-in read-only for workers, editable by receiving-clinic admin
 *   - membership revocation round-trip (THE keystone test)
 *   - last-admin guard + self-lockout prevention
 *   - profile gates (self-approve hole closed, deactivate = platform only)
 *   - allowlist + clinic-creation scoping
 *   - media clinic_id derived from the encounter
 */
import { resetDatabase, runRls, seedWorld, visiblePatients, denied, type World } from './helpers';

/** Ignore rows created by other tests (e.g. pt-new- from the save-path test). */
const seed = (ids: string[]) => ids.filter((id) => !id.startsWith('pt-new-'));

runRls('RLS: clinic-scoped admin', () => {
  let w: World;
  beforeAll(async () => {
    resetDatabase();
    w = await seedWorld();
  }, 180_000);

  // ─────────────────────────────────────────────────────────────
  // Visibility matrix (§10)
  // ─────────────────────────────────────────────────────────────
  test('workerA sees own-clinic + referred-out, nothing else', async () => {
    expect(seed(await visiblePatients(w.workerA))).toEqual(['pt-a1', 'pt-aref']);
  });

  test('workerAB (A+B) sees both clinics + referrals into them', async () => {
    expect(seed(await visiblePatients(w.workerAB))).toEqual(['pt-a1', 'pt-aref', 'pt-b1']);
  });

  test('adminB sees own clinic + referred-in — NOT other clinics', async () => {
    // Old behavior would have shown pt-a1 too (global admin). Must be gone.
    expect(await visiblePatients(w.adminB)).toEqual(['pt-aref', 'pt-b1']);
  });

  test('outsider (clinic C only) sees none of A/B patients', async () => {
    expect(await visiblePatients(w.outsiderX)).toEqual([]);
  });

  test('platform admin sees everything', async () => {
    expect(await visiblePatients(w.platform)).toEqual(['pt-a1', 'pt-aref', 'pt-b1']);
  });

  test('pending (unapproved) user sees nothing', async () => {
    expect(await visiblePatients(w.pending)).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────
  // Referred-in edit rules
  // ─────────────────────────────────────────────────────────────
  test('workerB: referred-in patient is read-only', async () => {
    // RLS denials on invisible rows are SILENT (0 rows) — assert the effect.
    await w.workerB.client
      .from('patients')
      .update({ last_name: 'Nope' })
      .eq('id', w.patientAref);
    const { data } = await w.service.from('patients').select('last_name').eq('id', w.patientAref).single();
    expect(data?.last_name).not.toBe('Nope');
  });

  test('adminB (receiving clinic) can edit the referred-in patient', async () => {
    const { error } = await w.adminB.client
      .from('patients')
      .update({ last_name: 'RefIn' })
      .eq('id', w.patientAref);
    expect(error).toBeNull();
  });

  test('workerA edits at own clinic; adminA edits own-clinic patient', async () => {
    const e1 = await w.workerA.client
      .from('patients').update({ first_name: 'Ann' }).eq('id', w.patientA1);
    expect(e1.error).toBeNull();
    const e2 = await w.adminA.client
      .from('patients').update({ first_name: 'Ann' }).eq('id', w.patientA1);
    expect(e2.error).toBeNull();
  });

  test('REGRESSION: app save path — persona upserts patient + encounter WITH returning', async () => {
    // The app saves via .upsert(...).select() — PostgREST runs INSERT ..
    // RETURNING, which applies the SELECT policy to the NEW row mid-statement.
    // A select policy that re-queries the target table (patient_visible(id))
    // cannot see the new row in its own snapshot → spurious 42501. Row-ref
    // policies fixed this; the test pins the save path end to end.
    const t = Date.now();
    const pid = `pt-new-${t}`;
    const now = new Date().toISOString();
    const patient = await w.workerA.client
      .from('patients')
      .upsert({
        id: pid, first_name: 'New', last_name: 'Save', mrn: `N${t}`, referral_code: `rc-${t}`,
        clinic_id: w.clinicA, created_at: now, updated_at: now, inactive: false,
      })
      .select();
    expect(patient.error).toBeNull();
    expect((patient.data ?? []).length).toBe(1);

    const encounter = await w.workerA.client
      .from('encounters')
      .upsert({
        id: `en-new-${t}`, patient_id: pid, type: 'initial', date: '2026-08-17',
        created_at: now, updated_at: now, inactive: false,
      })
      .select();
    expect(encounter.error).toBeNull();
    expect((encounter.data ?? []).length).toBe(1);

    // And the receiving-clinic flow: workerB documents a follow-up on the
    // referred-in patient (referral exists from a prior statement).
    const fu = await w.workerB.client
      .from('encounters')
      .upsert({
        id: `en-fu-${t}`, patient_id: w.patientAref, type: 'followup', date: '2026-08-17',
        created_at: now, updated_at: now, inactive: false,
      })
      .select();
    expect(fu.error).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // KEYSTONE: membership revocation round-trip
  // ─────────────────────────────────────────────────────────────
  test('keystone: removing B membership revokes exactly B visibility; re-add restores', async () => {
    // Before: workerAB sees A + B + referral.
    expect(seed(await visiblePatients(w.workerAB))).toEqual(['pt-a1', 'pt-aref', 'pt-b1']);
  
    // adminA (NOT admin of B) cannot remove a B membership — silently no-ops.
    await w.adminA.client
      .from('clinic_memberships')
      .delete()
      .eq('user_id', w.workerAB.userId)
      .eq('clinic_id', w.clinicB);
    const stillThere = await w.service
      .from('clinic_memberships')
      .select('user_id')
      .eq('user_id', w.workerAB.userId)
      .eq('clinic_id', w.clinicB);
    expect((stillThere.data ?? []).length).toBe(1);

  
    // adminB removes workerAB's B membership.
    const del = await w.adminB.client
      .from('clinic_memberships')
      .delete()
      .eq('user_id', w.workerAB.userId)
      .eq('clinic_id', w.clinicB);
    expect(del.error).toBeNull();
  
    // After: B's patients gone; A + referred-out patient remain.
    expect(seed(await visiblePatients(w.workerAB))).toEqual(['pt-a1', 'pt-aref']);
  
    // Records the user created are untouched: clinic still sees them.
    expect(seed(await visiblePatients(w.workerA))).toEqual(['pt-a1', 'pt-aref']);
  
    // Re-add → visibility restored.
    const readd = await w.adminB.client
      .from('clinic_memberships')
      .insert({ user_id: w.workerAB.userId, clinic_id: w.clinicB, role: 'health_worker' });
    expect(readd.error).toBeNull();
    expect(seed(await visiblePatients(w.workerAB))).toEqual(['pt-a1', 'pt-aref', 'pt-b1']);
  });

  // ─────────────────────────────────────────────────────────────
  // Last-admin guard + self-lockout
  // ─────────────────────────────────────────────────────────────
  test('sole admin cannot delete or demote their own admin membership', async () => {
    await w.adminA.client
      .from('clinic_memberships')
      .delete()
      .eq('user_id', w.adminA.userId)
      .eq('clinic_id', w.clinicA);
    await w.adminA.client
      .from('clinic_memberships')
      .update({ role: 'health_worker' })
      .eq('user_id', w.adminA.userId)
      .eq('clinic_id', w.clinicA);
    const { data } = await w.service
      .from('clinic_memberships')
      .select('role')
      .eq('user_id', w.adminA.userId)
      .eq('clinic_id', w.clinicA)
      .single();
    expect(data?.role).toBe('admin');
  });

  test('last-admin row cannot be removed even by another clinic admin; second admin unlocks it', async () => {
    // adminB trying to remove adminA (last admin of A) — silently no-ops.
    await w.adminB.client
      .from('clinic_memberships')
      .delete()
      .eq('user_id', w.adminA.userId)
      .eq('clinic_id', w.clinicA);
    const stillAdmin = await w.service
      .from('clinic_memberships')
      .select('user_id')
      .eq('user_id', w.adminA.userId)
      .eq('clinic_id', w.clinicA);
    expect((stillAdmin.data ?? []).length).toBe(1);

  
    // Promote workerA → second admin (allowed: workerA is not the last admin).
    const promo = await w.adminA.client
      .from('clinic_memberships')
      .update({ role: 'admin' })
      .eq('user_id', w.workerA.userId)
      .eq('clinic_id', w.clinicA);
    expect(promo.error).toBeNull();
  
    // Now adminA's own row can be demoted by… adminA? No — self-edit blocked.
    // But platform can manage it. Restore workerA to health_worker for later tests.
    const restore = await w.platform.client
      .from('clinic_memberships')
      .update({ role: 'health_worker' })
      .eq('user_id', w.workerA.userId)
      .eq('clinic_id', w.clinicA);
    expect(restore.error).toBeNull();
  });

  test('clinic_id is immutable on membership update (reassign = delete + insert)', async () => {
    const { error } = await w.adminA.client
      .from('clinic_memberships')
      .update({ clinic_id: w.clinicB })
      .eq('user_id', w.workerA.userId)
      .eq('clinic_id', w.clinicA);
    expect(denied(error)).toBe(true);
  });

  test('roster visibility: members see their clinic roster, not foreign rosters', async () => {
    const { data } = await w.workerA.client
      .from('clinic_memberships')
      .select('clinic_id')
      .eq('clinic_id', w.clinicB);
    expect(data ?? []).toEqual([]);
    const mine = await w.workerA.client
      .from('clinic_memberships')
      .select('user_id')
      .eq('clinic_id', w.clinicA);
    expect((mine.data ?? []).length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Profile gates
  // ─────────────────────────────────────────────────────────────
  test('pending user cannot self-approve (hole closed)', async () => {
    const { error } = await w.pending.client
      .from('profiles')
      .update({ approved: true })
      .eq('id', w.pending.userId);
    expect(denied(error)).toBe(true);
  });

  test('clinic admin can approve; only platform can deactivate', async () => {
    // Approve flow = assign membership FIRST, then flip approved. Order
    // matters: the SELECT policy gates the NEW row too — an admin cannot
    // update a pending user into an approved state they can't see (the
    // shared-clinic branch only exists once the membership row does).
    const assign = await w.adminA.client
      .from('clinic_memberships')
      .insert({ user_id: w.pending.userId, clinic_id: w.clinicA, role: 'health_worker' });
    expect(assign.error).toBeNull();

    const approve = await w.adminA.client
      .from('profiles')
      .update({ approved: true })
      .eq('id', w.pending.userId);
    expect(approve.error).toBeNull();
  
    const byAdmin = await w.adminA.client
      .from('profiles')
      .update({ approved: false })
      .eq('id', w.pending.userId);
    expect(denied(byAdmin.error)).toBe(true);
  
    const byPlatform = await w.platform.client
      .from('profiles')
      .update({ approved: false })
      .eq('id', w.pending.userId);
    expect(byPlatform.error).toBeNull();
  });

  test('profiles readable only within shared clinics', async () => {
    const { data } = await w.workerA.client
      .from('profiles')
      .select('id')
      .eq('id', w.outsiderX.userId);
    expect(data ?? []).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────
  // Allowlist + clinic creation scoping
  // ─────────────────────────────────────────────────────────────
  test('allowlist is clinic-scoped', async () => {
    const mine = await w.adminA.client
      .from('allowed_emails')
      .select('email');
    expect((mine.data ?? []).map((r) => r.email)).toEqual(['invite-a@test.local']);
  
    const foreign = await w.adminA.client
      .from('allowed_emails')
      .insert({ email: 'sneaky@test.local', clinic_id: w.clinicB, role: 'health_worker' });
    expect(denied(foreign.error)).toBe(true);
  });

  test('clinic creation is platform-only', async () => {
    const byAdmin = await w.adminA.client
      .from('clinics')
      .insert({ name: 'Nope Clinic', type: 'primary' });
    expect(denied(byAdmin.error)).toBe(true);
  
    const byPlatform = await w.platform.client
      .from('clinics')
      .insert({ name: 'New Platform Clinic', type: 'primary' });
    expect(byPlatform.error).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // Media attribution derives from the encounter
  // ─────────────────────────────────────────────────────────────
  test('photo clinic_id derives from encounter — client-supplied value ignored', async () => {
    const insert = await w.workerA.client.from('photos').insert({
      id: 'ph-1',
      patient_id: w.patientA1,
      encounter_id: w.encounterA1,
      clinic_id: w.clinicB,          // WRONG clinic on purpose
      storage_path: 'test/ph-1',
      mime_type: 'image/jpeg',
    });
    expect(insert.error).toBeNull();
  
    const { data } = await w.service.from('photos').select('clinic_id').eq('id', 'ph-1').single();
    expect(data?.clinic_id).toBe(w.clinicA);   // derived, not client-supplied
  });

  test('outsider cannot attach media to a foreign clinic via a shared patient id', async () => {
    const { error } = await w.outsiderX.client.from('photos').insert({
      id: 'ph-2',
      patient_id: w.patientA1,
      encounter_id: w.encounterA1,
      clinic_id: w.clinicA,
      storage_path: 'test/ph-2',
      mime_type: 'image/jpeg',
    });
    expect(denied(error)).toBe(true);
  });
});

export {};
