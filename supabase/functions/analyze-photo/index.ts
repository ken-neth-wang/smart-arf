// analyze-photo — DUMMY edge function (v0).
// Returns a random ARF-suspected flag + canned text. No API key, no Gemini.
//
// Swap the marked block for a real Gemini 2.5 Flash call later:
//   - Set the edge-function secret:  supabase secrets set GEMINI_API_KEY=...
//   - Fetch the image from Storage (service role) + POST to the Gemini API.
//
// Deploy:  supabase functions deploy analyze-photo
// Invoke from the app via:  supabase.functions.invoke('analyze-photo', { body })

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── DUMMY: random yes/no, low-ish confidence, canned text. ─────────────
  // Replace with a real Gemini call (see header comment).
  const arfSuspected = Math.random() < 0.5;
  const body = {
    arfSuspected,
    confidence: Math.round((0.3 + Math.random() * 0.4) * 100) / 100, // 0.30–0.70
    finding: arfSuspected
      ? "Possible erythema marginatum pattern detected (DUMMY — no real model was run)."
      : "No ARF-specific skin pattern detected (DUMMY — no real model was run).",
    notes: "Placeholder output from the dummy edge function. Wire up Gemini next.",
    model: "dummy-v0",
  };

  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
