import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SCHEMA, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";
import { buildSystemPrompt, enforceAssessmentInvariants, ASSESSMENT_SCHEMA, HANDOFF_SCHEMA, HANDOFF_SYSTEM, type ChoiceId, type DomainId, deriveHandoffState } from "./dome-core";
import { applySupportEngine, type HumanHandoff } from "./support-engine";

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

/**
 * Uloží assessment přes atomickou 3-param RPC urad_record_dome_assessment(p_case_id, p_assessment, p_expected_version)
 * jako přihlášený uživatel. DB (SECURITY DEFINER) zamkne řádek případu (FOR UPDATE), ověří auth.uid(), urad_has_access(),
 * vlastnictví, hypothesis.status = 'unverified' a že poslední uložená verze == p_expected_version.
 * Počáteční stav: expectedVersion = 0. Nová verze v assessmentu musí být expectedVersion + 1.
 */
export const CONCURRENCY_CONFLICT_MESSAGE = "Stav případu se mezitím změnil, nic se neuložilo. Obnovte stránku.";

export function isConcurrencyConflict(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "P0001" && /CONCURRENCY_CONFLICT/.test(err.message ?? "")
    || /CONCURRENCY_CONFLICT/.test(err.message ?? "");
}

export async function recordAssessment(sb: SupabaseClient, caseId: string, assessment: Record<string, unknown>, expectedVersion: number) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new DomeError("Chybí platná verze stavu případu, nic se neuložilo.", 422);
  const newVersion = (assessment["case_state"] as { metadata?: { version?: unknown } } | undefined)?.metadata?.version;
  if (newVersion !== expectedVersion + 1) throw new DomeError("Neplatná nová verze stavu případu, nic se neuložilo.", 422);
  const rec = await sb.rpc(SCHEMA.steps.recordAssessmentRpc, {
    p_case_id: caseId,
    p_assessment: assessment,
    p_expected_version: expectedVersion,
  });
  if (rec.error) {
    if (isConcurrencyConflict(rec.error)) throw new DomeError(CONCURRENCY_CONFLICT_MESSAGE, 409);
    console.error("urad_record_dome_assessment", rec.error);
    throw new DomeError(`Hodnocení se nepodařilo uložit: ${rec.error.message} (kód: ${rec.error.code ?? "?"})`);
  }
}

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

export async function generateAssessment(
  context: string,
  domain: DomainId = "urad",
  choices: ChoiceId[] = [],
  engine: { caseId: string; userText: string; previous?: HumanHandoff | null } | null = null,
) {
  const raw = await callAi(
    [
      { role: "system", content: buildSystemPrompt(domain) },
      { role: "user", content: context },
    ],
    { name: "dome_assessment", schema: ASSESSMENT_SCHEMA },
  );
  const a = enforceAssessmentInvariants(JSON.parse(raw) as Record<string, unknown>, { choices });
  if (!engine) return a;
  // Registr služeb ani dopravu zatím žádný ověřený zdroj nedodává → NO_REGISTRY / NO_TRANSPORT.
  return applySupportEngine(a, {
    ...engine,
    choices,
    derive: (level, gapDetected, targetVerified, routeVerified) =>
      deriveHandoffState({ choices, level, gapDetected, targetVerified, routeVerified }),
  });
}

export async function generateHandoff(context: string) {
  const raw = await callAi(
    [
      { role: "system", content: HANDOFF_SYSTEM },
      { role: "user", content: context },
    ],
    { name: "dome_handoff", schema: HANDOFF_SCHEMA },
  );
  const h = JSON.parse(raw) as { items?: { section?: string; label?: string; text?: string }[] } & Record<string, unknown>;
  return h;
}
