// transcribe-assessment — Gemini 3.5 Flash: spoken clinical findings → structured criteria.
//
// Receives { audioB64, mimeType } in the request body (audio is transient —
// never stored). Returns a JSON object of clinical-criteria fields, INCLUDING
// ONLY those the clinician stated (unmentioned fields are omitted so the app
// leaves them untouched). No demographics (kept manual to limit PHI).
//
// SETUP: same GEMINI_API_KEY secret as the other functions (no extra setup).
//   deploy: supabase functions deploy transcribe-assessment --project-ref <ref>
// App invokes via: supabase.functions.invoke('transcribe-assessment', { body: { audioB64, mimeType } })

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "gemini-3.5-flash";

const PROMPT = `You are transcribing a clinician's spoken assessment of a patient suspected of Acute Rheumatic Fever. Extract ONLY the clinical findings the clinician explicitly states and map natural language to the fields below. OMIT any field the clinician did not mention.

- fever: fever currently present (boolean)
- chorea: involuntary movements / Sydenham chorea present (boolean)
- altCause: the clinician stated there is an obvious alternative cause for the fever (boolean)
- joint: joint involvement — one of "none", "monoarthralgia" (single-joint pain), "polyarthralgia" (multiple joints, pain without swelling), "migratory" (migratory polyarthritis — the classic ARF pattern)
- murmur: a cardiac murmur was heard (boolean)
- sob: shortness of breath (boolean)
- edema: edema (boolean)
- em: erythema marginatum rash (boolean)
- sn: subcutaneous nodules (boolean)
- noad: clinician stated there is no obvious alternative diagnosis (boolean)
- facilityType: "primary" or "secondary" care setting (only if mentioned)
- wbc: elevated white blood cell count (boolean)
- aso: elevated ASO titer (boolean)
- esr: elevated ESR or CRP (boolean)
- antidnase: anti-DNase B positive (boolean)
- pr: prolonged PR interval on ECG (boolean)
- echo: echocardiogram suggestive of RHD — use "suggestive" (only if stated)

Return a JSON object containing ONLY the fields the clinician clearly stated. Do NOT include fields they did not mention. This is a screening aid only and is NOT a diagnosis.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    fever: { type: "BOOLEAN" },
    chorea: { type: "BOOLEAN" },
    altCause: { type: "BOOLEAN" },
    joint: { type: "STRING", enum: ["none", "monoarthralgia", "polyarthralgia", "migratory"] },
    murmur: { type: "BOOLEAN" },
    sob: { type: "BOOLEAN" },
    edema: { type: "BOOLEAN" },
    em: { type: "BOOLEAN" },
    sn: { type: "BOOLEAN" },
    noad: { type: "BOOLEAN" },
    facilityType: { type: "STRING", enum: ["primary", "secondary"] },
    wbc: { type: "BOOLEAN" },
    aso: { type: "BOOLEAN" },
    esr: { type: "BOOLEAN" },
    antidnase: { type: "BOOLEAN" },
    pr: { type: "BOOLEAN" },
    echo: { type: "STRING", enum: ["suggestive"] },
  },
  // No "required" → all optional; the model includes only the fields it heard.
};

const ALLOWED = [
  "fever", "chorea", "altCause", "joint", "murmur", "sob", "edema", "em", "sn",
  "noad", "facilityType", "wbc", "aso", "esr", "antidnase", "pr", "echo",
] as const;

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

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return jsonError(500, "GEMINI_API_KEY secret is not set on the edge function.");
  }

  // Parse the base64 audio + mime type from the request body.
  let audioB64: string | undefined;
  let mimeType: string | undefined;
  try {
    const body = await req.json();
    audioB64 = body?.audioB64;
    mimeType = body?.mimeType;
  } catch {
    /* handled below */
  }
  if (!audioB64 || typeof audioB64 !== "string") {
    return jsonError(400, "Missing 'audioB64' in request body.");
  }
  if (!mimeType || typeof mimeType !== "string") {
    mimeType = "audio/webm";
  }

  // Call Gemini 3.5 Flash (audio + text → structured JSON).
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: audioB64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
        },
      }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    return jsonError(502, `Gemini API error (${resp.status}): ${errText.slice(0, 400)}`);
  }

  const data = await resp.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text: string | undefined = (data as any)?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return jsonError(502, "Gemini returned no content.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return jsonError(502, "Gemini output was not valid JSON.");
  }

  // Whitelist + drop nulls so the app treats them as "not mentioned".
  const clean: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    const v = parsed[k];
    if (v !== undefined && v !== null) clean[k] = v;
  }

  return new Response(JSON.stringify(clean), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
