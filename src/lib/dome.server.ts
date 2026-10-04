import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SCHEMA, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";

/** Serverový klient jednající JAKO přihlášený uživatel (publishable klíč + jeho token, RLS platí). */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export class DomeError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

/** Ověří uživatele a jeho přístup přes existující backend. */
export async function verifyUser(accessToken: string) {
  const sb = userClient(accessToken);
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) throw new DomeError("Přihlášení vypršelo. Přihlaste se prosím znovu.", 401);
  const has = await sb.rpc(SCHEMA.access.hasAccessRpc);
  if (has.error || has.data !== true) throw new DomeError("Nemáte schválený přístup.", 403);
  return { sb, userId: data.user.id };
}

const ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "hypothesis", "stated_by_user", "verified", "to_verify", "missing_information",
    "required_documents", "current_question", "next_step", "confidence",
  ],
  properties: {
    hypothesis: {
      type: "object", additionalProperties: false, required: ["text", "status"],
      properties: { text: { type: "string" }, status: { type: "string", enum: ["unverified"] } },
    },
    stated_by_user: { type: "array", items: { type: "string" } },
    verified: { type: "array", items: { type: "string" } },
    to_verify: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
    required_documents: { type: "array", items: { type: "string" } },
    current_question: {
      type: "object", additionalProperties: false, required: ["text", "reason"],
      properties: { text: { type: "string" }, reason: { type: "string" } },
    },
    next_step: {
      type: "object", additionalProperties: false, required: ["text", "condition"],
      properties: { text: { type: "string" }, condition: { type: "string" } },
    },
    confidence: { type: "string", enum: ["low", "medium"] },
  },
} as const;

export const DOME_SYSTEM = `Jsi DOME, administrativní asistent pro agendu Úřadu práce ČR (dávky, příspěvky, příspěvek na bydlení, živobytí, mimořádná okamžitá pomoc, odvolání, doplnění řízení). Pracuješ s jedním konkrétním případem a vyhodnocuješ VŽDY celý dosavadní kontext.
Pravidla:
- Hypotéza je vždy NEOVĚŘENÁ pracovní domněnka, nikdy fakt.
- "stated_by_user": jen to, co uživatel skutečně uvedl (popis, odpovědi).
- "verified": jen skutečnosti doložené obsahem nahraného dokumentu (uveď zdroj, např. "podle dokumentu X"). Bez dokumentu zůstává prázdné. Nikdy netvrď, že jsi něco ověřil bez dokumentu.
- "to_verify": tvrzení, která je třeba doložit. "missing_information": co vůbec nevíme.
- "current_question": PRÁVĚ JEDNA otázka (jedna věta s jedním otazníkem) nebo žádost o JEDEN konkrétní dokument — to nejdůležitější, co je teď potřeba zjistit. "reason": proč právě teď.
- "next_step": navazující krok podmíněný ("condition") tím, co ještě není ověřeno. Nepředpokládej neověřené skutečnosti.
- Nikdy neoznačuj případ za vyřešený, nevytvářej právní závěry, nepodávej nic za uživatele.
- "confidence": "low" nebo "medium", konzervativně.
Piš česky, stručně, srozumitelně pro laika.`;

type Input = string | Record<string, unknown>[];

/** Volání Lovable AI (Responses, stream) se strukturovaným výstupem. Bez automatických opakování. */
export async function callAi(input: Input, jsonSchema?: { name: string; schema: unknown }): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new DomeError("AI není nakonfigurována.", 500);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      input,
      stream: true,
      store: false,
      reasoning: { effort: "medium", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      ...(jsonSchema
        ? { text: { format: { type: "json_schema", name: jsonSchema.name, schema: jsonSchema.schema, strict: true } } }
        : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error(`AI gateway ${res.status}: ${body}`);
    if (res.status === 402) throw new DomeError("Došly AI kredity pracovního prostoru. Doplňte je prosím a zkuste to znovu.", 402);
    if (res.status === 429) throw new DomeError("DOME je teď přetížený. Zkuste to prosím za chvíli.", 429);
    if (res.status === 403) throw new DomeError("AI požadavek byl odmítnut.", 403);
    throw new DomeError("Vyhodnocení se nepodařilo. Zkuste to prosím znovu.", 502);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let refused = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const ev = JSON.parse(d);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") refused = true;
          else if (ev.type === "error" || ev.type === "response.failed") {
            throw new DomeError("Vyhodnocení se nepodařilo dokončit.", 502);
          }
        } catch (e) {
          if (e instanceof DomeError) throw e;
        }
      }
    }
  }
  if (refused) throw new DomeError("AI odmítla tento požadavek zpracovat.", 422);
  if (!text.trim()) throw new DomeError("AI nevrátila žádný výsledek.", 502);
  return text;
}

export async function generateAssessment(context: string) {
  const raw = await callAi(
    [
      { role: "system", content: DOME_SYSTEM },
      { role: "user", content: context },
    ],
    { name: "dome_assessment", schema: ASSESSMENT_SCHEMA },
  );
  const a = JSON.parse(raw) as Record<string, unknown>;
  // Pojistka: hypotéza je vždy neověřená, confidence nikdy nad medium.
  a["hypothesis"] = { ...(a["hypothesis"] as object), status: "unverified" };
  if (a["confidence"] !== "medium") a["confidence"] = "low";
  return a;
}
