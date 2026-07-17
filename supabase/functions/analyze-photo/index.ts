// analyze-photo — Gemini 2.5 Flash vision call.
//
// Flow: fetch the uploaded image from Supabase Storage (service role) → base64
// → POST to Gemini with an ARF-screening prompt + structured-JSON schema →
// return { arfSuspected, confidence, finding, notes, model }.
//
// SETUP (one time):
//   1. Free API key:        https://aistudio.google.com/apikey
//   2. Set the secret:      supabase secrets set GEMINI_API_KEY=AIza... --project-ref <ref>
//   3. (re)deploy:          supabase functions deploy analyze-photo --project-ref <ref>
//
// App invokes via: supabase.functions.invoke('analyze-photo', { body: { storagePath } })
//
// NOTE: this is a general vision model, NOT medically validated — outputs are a
// screening aid only. Real clinical value comes later from a medical model
// (MedGemma) and/or training on the clinician_label field.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-3.5-flash";
const MODEL_TAG = "gemini-3.5-flash";
const STORAGE_BUCKET = "photos";

const PROMPT = `You are a clinical screening assistant. Analyze this skin photo for signs of Acute Rheumatic Fever (ARF).
ARF-specific skin manifestations to look for:
- Erythema marginatum: pink/salmon, ring-shaped or arc-shaped rash with a clear or raised center that spreads outward and migrates; usually on the trunk and proximal limbs.
- Subcutaneous nodules: firm, painless lumps over the extensor surfaces of joints or tendons.
Return JSON with:
- arfSuspected: true if an ARF-related skin pattern appears present, else false.
- confidence: 0.0–1.0 (low if the image is unclear or no relevant features are visible).
- finding: one short sentence describing what is visible.
- notes: brief clinical impression + any caveat (image quality, need for clinical correlation).
This is a screening aid only and is NOT a diagnosis.`;

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

// Chunked base64 to avoid spreading a huge array into String.fromCharCode.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function jsonError(status: number, message: string): Response {
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
  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  if (!geminiKey) {
    return jsonError(500, "GEMINI_API_KEY secret is not set on the edge function.");
  }
  if (!supabaseUrl || !serviceKey) {
    return jsonError(500, "Supabase service credentials are unavailable.");
  }

  // Parse the storagePath from the request body.
  let storagePath: string | undefined;
  try {
    const body = await req.json();
    storagePath = body?.storagePath;
  } catch {
    /* handled below */
  }
  if (!storagePath || typeof storagePath !== "string") {
    return jsonError(400, "Missing 'storagePath' in request body.");
  }

  // 1. Fetch the image bytes from Storage (service role bypasses RLS).
  //    storagePath is the object key within the `photos` bucket.
  const objectUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`;
  const imgResp = await fetch(objectUrl, {
    headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  if (!imgResp.ok) {
    return jsonError(404, `Could not fetch image from storage (${imgResp.status}).`);
  }
  const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
  const mimeType = mimeFromPath(storagePath);
  const b64 = toBase64(imgBytes);

  // 2. Call Gemini 2.5 Flash (image + text → structured JSON).
  const geminiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: b64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              arfSuspected: { type: "BOOLEAN" },
              confidence: { type: "NUMBER" },
              finding: { type: "STRING" },
              notes: { type: "STRING" },
            },
            required: ["arfSuspected", "confidence", "finding", "notes"],
          },
        },
      }),
    },
  );

  if (!geminiResp.ok) {
    const errText = await geminiResp.text();
    return jsonError(502, `Gemini API error (${geminiResp.status}): ${errText.slice(0, 400)}`);
  }

  // 3. Parse the structured response.
  const gemData = await geminiResp.json();
  const text: string | undefined =
    gemData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return jsonError(502, "Gemini returned no content.");
  }

  let parsed: {
    arfSuspected?: boolean;
    confidence?: number;
    finding?: string;
    notes?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonError(502, "Gemini output was not valid JSON.");
  }

  const result = {
    arfSuspected: Boolean(parsed.arfSuspected),
    confidence: clamp(Number(parsed.confidence) || 0, 0, 1),
    finding: String(parsed.finding ?? "Unable to determine from the image."),
    notes: String(parsed.notes ?? ""),
    model: MODEL_TAG,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
