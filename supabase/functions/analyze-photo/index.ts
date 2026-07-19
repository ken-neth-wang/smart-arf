// analyze-photo — vision screening with a model fallback.
//
// Flow: fetch the uploaded image from Supabase Storage (service role) → base64
// → call a vision model with an ARF-screening prompt + JSON output → return
// { arfSuspected, confidence, finding, notes, model }.
//
// Fallback chain (same GEMINI_API_KEY, all free):
//   1. gemini-3.5-flash  (structured JSON via responseSchema)  — 15 RPM / 1M tok/day
//   2. gemma-4-31b-it    (JSON mode, no schema)
// If the primary fails (rate limit, model error, bad/unparseable output), it
// automatically tries the next. The `model` field reports which one answered.
//
// SETUP (one time):
//   1. Free API key:   https://aistudio.google.com/apikey
//   2. Set the secret: supabase secrets set GEMINI_API_KEY=AIza... --project-ref <ref>
//   3. (re)deploy:     supabase functions deploy analyze-photo --project-ref <ref>
//
// App invokes via: supabase.functions.invoke('analyze-photo', { body: { storagePath } })
//
// NOTE: general vision models, not medically validated — outputs are a screening
// aid only. Real clinical value comes from a medical model (MedGemma) + training
// on the clinician_label field.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STORAGE_BUCKET = "photos";

const MODELS = [
  { name: "gemini-3.5-flash", useSchema: true },
  { name: "gemma-4-31b-it", useSchema: false },
];

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

const SCHEMA = {
  type: "OBJECT",
  properties: {
    arfSuspected: { type: "BOOLEAN" },
    confidence: { type: "NUMBER" },
    finding: { type: "STRING" },
    notes: { type: "STRING" },
  },
  required: ["arfSuspected", "confidence", "finding", "notes"],
};

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

// Strip ```json ... ``` fences so we can parse even if a model wrapped the output.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

interface Parsed {
  arfSuspected?: boolean;
  confidence?: number;
  finding?: string;
  notes?: string;
}

interface ModelResult {
  ok: boolean;
  parsed?: Parsed;
  model?: string;
  error?: string;
}

/** Try one model; return ok + parsed result, or ok=false with an error reason. */
async function tryModel(
  name: string,
  key: string,
  contents: object[],
  useSchema: boolean,
): Promise<ModelResult> {
  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    responseMimeType: "application/json",
  };
  if (useSchema) generationConfig.responseSchema = SCHEMA;

  let resp: Response;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents, generationConfig }),
      },
    );
  } catch (e) {
    return { ok: false, error: `${name} fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return { ok: false, error: `${name} API error (${resp.status}): ${t.slice(0, 300)}` };
  }

  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, error: `${name} returned a non-JSON response` };
  }
  const text: string | undefined =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { ok: false, error: `${name} returned no content` };

  let parsed: Parsed;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, error: `${name} output was not valid JSON` };
  }
  return { ok: true, parsed, model: name };
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

  // 2. Try each model in order until one returns a valid result.
  const contents = [
    {
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: b64 } },
      ],
    },
  ];

  let lastError = "no model attempted";
  let success: ModelResult | null = null;
  for (const m of MODELS) {
    const r = await tryModel(m.name, geminiKey, contents, m.useSchema);
    if (r.ok) {
      success = r;
      break;
    }
    lastError = r.error ?? "unknown";
    console.log(`[analyze-photo] ${m.name} failed: ${lastError}`);
  }

  if (!success || !success.parsed || !success.model) {
    return jsonError(502, `All models failed. Last: ${lastError}`);
  }

  const p = success.parsed;
  const result = {
    arfSuspected: Boolean(p.arfSuspected),
    confidence: clamp(Number(p.confidence) || 0, 0, 1),
    finding: String(p.finding ?? "Unable to determine from the image."),
    notes: String(p.notes ?? ""),
    model: success.model,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
