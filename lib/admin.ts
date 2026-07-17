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
 * Approve a pending user + assign a clinic/role. Two writes (profiles update
 * + membership upsert); both permitted by the admin RLS policies.
 */
export async function approveUserCloud(
  userId: string,
  clinicId: string,
  role: Role,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = getSupabase();
  const { error: e1 } = await supabase
    .from('profiles')
    .update({ approved: true })
    .eq('id', userId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('clinic_memberships')
    .upsert(
      { user_id: userId, clinic_id: clinicId, role },
      { onConflict: 'user_id,clinic_id' },
    );
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


