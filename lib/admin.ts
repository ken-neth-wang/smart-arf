/**
 * Admin cloud functions — allowlist management + pending-user approvals.
 *
 * All of these are gated server-side by RLS (is_admin()); the app only calls
 * them for users who pass `isAdmin(user)` (lib/permissions). They follow the
 * same guard/throw/map conventions as lib/sync.ts.
 */
import type { Role } from './permissions';
import { getSupabase, isSupabaseConfigured } from './supabase';

// ── Allowlist ────────────────────────────────────────────────────
export interface AllowedEmail {
  email: string;
  clinicId: string;
  role: Role;
  usedAt: string | null;
  createdAt: string;
}

interface AllowedEmailRow {
  email: string;
  clinic_id: string;
  role: Role;
  created_at: string;
  used_at: string | null;
}

/** Load the full allowlist (admin only via RLS). Newest first. */
export async function loadAllowedEmailsCloud(): Promise<AllowedEmail[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from('allowed_emails')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as AllowedEmailRow[]) ?? []).map((r) => ({
    email: r.email,
    clinicId: r.clinic_id,
    role: r.role,
    usedAt: r.used_at,
    createdAt: r.created_at,
  }));
}

/** Add (or update clinic/role for) a pre-approved email. */
export async function addAllowedEmailCloud(
  email: string,
  clinicId: string,
  role: Role,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase()
    .from('allowed_emails')
    .upsert({ email: email.trim().toLowerCase(), clinic_id: clinicId, role });
  if (error) throw error;
}

/** Remove an email from the allowlist. */
export async function removeAllowedEmailCloud(email: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase()
    .from('allowed_emails')
    .delete()
    .eq('email', email);
  if (error) throw error;
}

/**
 * Invite a user by email: pre-approve (allowlist) + send them an invite email
 * via the invite-user edge function (admin-only). Recipient accepts → active.
 * `displayName` is optional (used in their profile; falls back to email prefix).
 */
export async function inviteUserCloud(
  email: string,
  clinicId: string,
  role: Role,
  displayName = '',
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase().functions.invoke('invite-user', {
    body: {
      email: email.trim().toLowerCase(),
      clinicId,
      role,
      displayName: displayName.trim(),
    },
  });
  if (error) {
    // The client surfaces a generic message; pull the real reason from the
    // function's JSON response body so the admin UI can show it.
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.text === 'function') {
        const txt = await ctx.text();
        try {
          const body = JSON.parse(txt);
          if (body && typeof body.error === 'string') detail = body.error;
        } catch {
          if (txt) detail = txt;
        }
      }
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
}

/** Create a clinic (admin only via RLS). name required; type is free text. */
export async function createClinicCloud(name: string, type: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase()
    .from('clinics')
    .insert({ name: name.trim(), type: type || '' });
  if (error) throw error;
}

// ── Pending approvals ────────────────────────────────────────────
/** A profile awaiting admin approval — profile + the signup email. */
export interface PendingProfile {
  id: string;
  displayName: string;
  email: string;
}

interface AdminProfileRow {
  id: string;
  display_name: string;
  approved: boolean;
  email: string;
  created_at: string;
}

/** Load every un-approved profile (admin only via RLS). Newest first. */
export async function loadPendingProfilesCloud(): Promise<PendingProfile[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('*')
    .eq('approved', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as AdminProfileRow[]) ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    email: r.email,
  }));
}

/**
 * Approve a pending user + assign a clinic/role. ORDER MATTERS: the membership
 * is inserted FIRST, then approved flips — the SELECT policy gates the NEW row
 * on update, and an approved profile with no shared clinic would be invisible
 * to the approving admin (RLS 42501). See migration notes.
 */
export async function approveUserCloud(
  userId: string,
  clinicId: string,
  role: Role,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = getSupabase();
  const { error: e1 } = await supabase
    .from('clinic_memberships')
    .upsert(
      { user_id: userId, clinic_id: clinicId, role },
      { onConflict: 'user_id,clinic_id' },
    );
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('profiles')
    .update({ approved: true })
    .eq('id', userId);
  if (e2) throw e2;
}

// ── Active users (deactivation / “soft delete”) ───────────────────
export interface ActiveUser {
  id: string;
  email: string;
  displayName: string;
  memberships: { clinicId: string; role: Role }[];
}

interface AdminMembershipRow {
  user_id: string;
  clinic_id: string;
  role: Role;
}

/** Load all approved users + their memberships (admin only via RLS).
 *  Two queries joined client-side — there’s no FK from memberships → profiles. */
export async function loadActiveUsersCloud(): Promise<ActiveUser[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = getSupabase();
  const [profRes, memRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('approved', true).order('created_at', { ascending: false }),
    supabase.from('clinic_memberships').select('*'),
  ]);
  if (profRes.error) throw profRes.error;
  if (memRes.error) throw memRes.error;
  const mems = (memRes.data as AdminMembershipRow[]) ?? [];
  return ((profRes.data as AdminProfileRow[]) ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    memberships: mems
      .filter((m) => m.user_id === r.id)
      .map((m) => ({ clinicId: m.clinic_id, role: m.role })),
  }));
}

/** Deactivate a user (soft delete): approved=false → loses all access (RLS).
 *  Reversible — they return to Pending, where the admin can re-approve. */
export async function deactivateUserCloud(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase()
    .from('profiles')
    .update({ approved: false })
    .eq('id', userId);
  if (error) throw error;
}

// ── Clinic roster (clinic-scoped console) ────────────────────────

export interface RosterMember {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  /** Memberships at OTHER clinics (read-only context in the UI). */
  otherClinics: { clinicId: string; role: Role }[];
}

/** Load the members of ONE clinic (admin of that clinic / platform via RLS). */
export async function loadRosterCloud(clinicId: string): Promise<RosterMember[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = getSupabase();

  // Roster of the acting clinic. memberships RLS shows this clinic's rows
  // (we're a member/admin there); profiles RLS limits names to shared-clinic
  // people + pending — rows without a visible profile keep their membership
  // data with an empty name/email.
  const memRes = await supabase
    .from('clinic_memberships')
    .select('*')
    .eq('clinic_id', clinicId);
  if (memRes.error) throw memRes.error;
  const rosterRows = (memRes.data as AdminMembershipRow[]) ?? [];
  if (rosterRows.length === 0) return [];

  const userIds = [...new Set(rosterRows.map((m) => m.user_id))];
  const [profRes, otherMemsRes] = await Promise.all([
    supabase.from('profiles').select('*').in('id', userIds),
    // Other-clinic memberships of these users (RLS shows only what we may see).
    supabase.from('clinic_memberships').select('*').in('user_id', userIds).neq('clinic_id', clinicId),
  ]);
  if (profRes.error) throw profRes.error;
  if (otherMemsRes.error) throw otherMemsRes.error;

  const profiles = new Map(
    ((profRes.data as AdminProfileRow[]) ?? []).map((r) => [r.id, r]),
  );
  const otherByUser = new Map<string, { clinicId: string; role: Role }[]>();
  for (const m of (otherMemsRes.data as AdminMembershipRow[]) ?? []) {
    const list = otherByUser.get(m.user_id) ?? [];
    list.push({ clinicId: m.clinic_id, role: m.role });
    otherByUser.set(m.user_id, list);
  }

  return rosterRows.map((m) => {
    const p = profiles.get(m.user_id);
    return {
      userId: m.user_id,
      email: p?.email ?? '',
      displayName: p?.display_name ?? '',
      role: m.role,
      otherClinics: otherByUser.get(m.user_id) ?? [],
    };
  });
}

/** Change a member's role at a clinic. RLS: admin of that clinic, never your
 *  own row, never the last admin (guard) — denials surface as errors. */
export async function updateMembershipRoleCloud(
  userId: string,
  clinicId: string,
  role: Role,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase()
    .from('clinic_memberships')
    .update({ role })
    .eq('user_id', userId)
    .eq('clinic_id', clinicId);
  if (error) throw error;
}

/** Remove a membership (the ACCESS ROW ONLY — clinical data is clinic-owned
 *  and untouched). RLS: admin of that clinic, not your own row, not the last
 *  admin. Silent no-op if RLS denies (row invisible → 0 rows deleted). */
export async function removeMembershipCloud(
  userId: string,
  clinicId: string,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await getSupabase()
    .from('clinic_memberships')
    .delete()
    .eq('user_id', userId)
    .eq('clinic_id', clinicId);
  if (error) throw error;
}

/** Add a member by email: an existing approved user gains a membership at this
 *  clinic; an unknown email falls through to the invite flow. Returns a short
 *  outcome string for the UI. */
export async function addMemberByEmailCloud(
  email: string,
  clinicId: string,
  role: Role,
): Promise<'added' | 'invited'> {
  if (!isSupabaseConfigured) return 'invited';
  const supabase = getSupabase();
  const norm = email.trim().toLowerCase();

  // Pending + shared-clinic profiles are visible to admins; if we can see a
  // profile with this email, add the membership directly…
  const { data, error } = await supabase
    .from('profiles')
    .select('id, approved')
    .ilike('email', norm)
    .limit(1);
  if (error) throw error;
  const profile = (data ?? [])[0] as { id: string; approved: boolean } | undefined;
  if (profile) {
    const { error: memErr } = await supabase
      .from('clinic_memberships')
      .upsert(
        { user_id: profile.id, clinic_id: clinicId, role },
        { onConflict: 'user_id,clinic_id' },
      );
    if (memErr) throw memErr;
    if (!profile.approved) {
      // pending signup found by email: approve them into this clinic (order:
      // membership first — see approveUserCloud).
      const { error: apprErr } = await supabase
        .from('profiles')
        .update({ approved: true })
        .eq('id', profile.id);
      if (apprErr) throw apprErr;
    }
    return 'added';
  }

  // …otherwise send an invite (edge function allowlists + emails them).
  await inviteUserCloud(norm, clinicId, role);
  return 'invited';
}


