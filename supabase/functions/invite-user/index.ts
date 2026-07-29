// invite-user — an admin invites a user by email.
//
// Flow: verify the caller is an admin (via their JWT) → insert into
// allowed_emails (so the handle_new_user trigger auto-approves + assigns the
// chosen clinic/role) → call auth.admin.inviteUserByEmail, which emails the
// invite via the configured SMTP (Resend). Creating the auth.users row fires
// the trigger → profile (approved=true) + clinic_memberships row.
//
// Public self-signup is unchanged (non-invited signups stay pending). This
// function is the "invite" path: pre-approve + email in one action.
//
// SETUP: uses the auto-injected SUPABASE_SERVICE_ROLE_KEY (no extra secret).
//   deploy: supabase functions deploy invite-user --project-ref <ref>
// App invokes via:
//   supabase.functions.invoke('invite-user',
//     { body: { email, clinicId, role, displayName } })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return jsonError(500, "Supabase credentials are unavailable.");
  }

  // Parse + validate the body.
  let email = "";
  let clinicId = "";
  let role = "health_worker";
  let displayName = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    clinicId = String(body?.clinicId ?? "").trim();
    role = String(body?.role ?? "health_worker");
    displayName = String(body?.displayName ?? "").trim();
  } catch {
    /* handled below */
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError(400, "A valid email is required.");
  }
  if (!clinicId) return jsonError(400, "A clinic is required.");
  if (role !== "health_worker" && role !== "admin") {
    return jsonError(400, "Invalid role.");
  }

  // Authorize with a client scoped to the CALLER's JWT (RLS-enforced).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError(401, "Not authenticated.");

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonError(401, "Not authenticated.");

  const { data: myMems } = await userClient
    .from("clinic_memberships")
    .select("role, clinic_id")
    .eq("user_id", user.id);
  const myClinics = (myMems ?? []) as { role: string; clinic_id: string }[];
  const isAdminCaller = myClinics.some((m) => m.role === "admin");
  if (!isAdminCaller) return jsonError(403, "Only admins can invite users.");
  // A clinic admin may only invite into a clinic they manage.
  if (!myClinics.some((m) => m.clinic_id === clinicId)) {
    return jsonError(403, "You can only invite into clinics you manage.");
  }

  // Privileged writes via the service role (bypasses RLS).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Pre-approve via the allowlist (the trigger reads this on user creation).
  const { error: allowErr } = await admin
    .from("allowed_emails")
    .upsert({ email, clinic_id: clinicId, role, created_by: user.id });
  if (allowErr) {
    return jsonError(500, `Could not pre-approve: ${allowErr.message}`);
  }

  // 2. Send the invite (creates auth.users → fires handle_new_user → approved).
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    email,
    { data: { display_name: displayName, must_set_password: true } },
  );
  if (inviteErr) {
    // e.g. "User already registered" — that email already has an account.
    return jsonError(409, `Could not send invite: ${inviteErr.message}`);
  }

  return new Response(JSON.stringify({ ok: true, email }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
