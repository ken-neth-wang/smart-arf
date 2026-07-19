// analyze-audio — Gemini 3.5 Flash audio call (auscultation / murmur screening).
//
// Flow: fetch the uploaded audio from Supabase Storage (service role) → base64
// → POST to Gemini with an auscultation prompt + structured-JSON schema →
// return { murmurDetected, confidence, finding, notes, model }.
//
// NOTE: gemini-3.5-flash accepts audio but is speech-focused — NOT validated for
// murmur detection. Output is an experimental screening aid, flag-only (never
// affects the Jones score). No Gemma fallback (Gemma has no audio input).
//
// SETUP: same GEMINI_API_KEY secret as analyze-photo (no extra setup).
//   deploy: supabase functions deploy analyze-audio --project-ref <ref>
// App invokes via: supabase.functions.invoke('analyze-audio', { body: { storagePath } })

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "gemini-3.5-flash";
const MODEL_TAG = "gemini-3.5-flash";
const STORAGE_BUCKET = "audio";

const PROMPT = `You are a clinical screening assistant reviewing a short digital auscultation (heart-sound) recording.
Listen for signs of a cardiac murmur or other abnormal heart sounds:
- Murmur: an extra whooshing or grating sound between or overlapping the normal "lub-dub" (S1/S2).
- If a murmur seems present, note its timing (systolic vs diastolic) and quality.
- Normal: crisp S1 ("lub") and S2 ("dub") with no extra sounds.
Return JSON with:
- murmurDetected: true if a murmur or clearly abnormal heart sound appears present, else false.
- confidence: 0.0–1.0 (low if the recording is noisy, very short, or unclear).
- finding: one short sentence describing what you hear.
- notes: brief impression + any caveat (recording quality, need for clinician confirmation).
This is a screening aid only and is NOT a diagnosis. If the recording is not clearly a heart sound, say so.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    murmurDetected: { type: "BOOLEAN" },
    confidence: { type: "NUMBER" },
    finding: { type: "STRING" },
    notes: { type: "STRING" },
  },
  required: ["murmurDetected", "confidence", "finding", "notes"],
};

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "mp4") return "audio/mp4";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "webm") return "audio/webm";
  if (ext === "flac") return "audio/flac";
  if (ext === "aiff") return "audio/aiff";
  return "audio/wav";
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

  // 1. Fetch the audio bytes from Storage (service role bypasses RLS).
  const objectUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`;
  const audioResp = await fetch(objectUrl, {
    headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  if (!audioResp.ok) {
    return jsonError(404, `Could not fetch audio from storage (${audioResp.status}).`);
  }
  const audioBytes = new Uint8Array(await audioResp.arrayBuffer());
  const mimeType = mimeFromPath(storagePath);
  const b64 = toBase64(audioBytes);

  // 2. Call Gemini 3.5 Flash (audio + text → structured JSON).
  const geminiResp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`,
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
          responseSchema: SCHEMA,
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
    murmurDetected?: boolean;
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
    murmurDetected: Boolean(parsed.murmurDetected),
    confidence: clamp(Number(parsed.confidence) || 0, 0, 1),
    finding: String(parsed.finding ?? "Unable to determine from the recording."),
    notes: String(parsed.notes ?? ""),
    model: MODEL_TAG,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
