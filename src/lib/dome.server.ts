import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SCHEMA, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config";
import {
  AiProviderError,
  getAiProvider,
  type AiInput,
  type AiJsonSchema,
} from "./ai-provider.server";
import {
  buildSystemPrompt,
  enforceAssessmentInvariants,
  ASSESSMENT_SCHEMA,
  HANDOFF_SCHEMA,
  HANDOFF_SYSTEM,
  type ChoiceId,
  type DomainId,
  deriveHandoffState,
} from "./dome-core";
import { applySupportEngine, type HumanHandoff } from "./support-engine";

/** Serverový klient jednající JAKO přihlášený uživatel (publishable klíč + jeho token, RLS platí). */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export class DomeError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

/** Ověří uživatele a jeho přístup přes existující backend. */
export async function verifyUser(accessToken: string) {
  const sb = userClient(accessToken);
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user)
    throw new DomeError("Přihlášení vypršelo. Přihlaste se prosím znovu.", 401);
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
export const CONCURRENCY_CONFLICT_MESSAGE =
  "Stav případu se mezitím změnil, nic se neuložilo. Obnovte stránku.";

export function isConcurrencyConflict(
  err: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!err) return false;
  // DB hlásí konflikt jako RAISE 'CONCURRENCY_CONFLICT' (SQLSTATE P0001). Jiné P0001 (např. deprecated) konfliktem nejsou.
  return /CONCURRENCY_CONFLICT/.test(err.message ?? "");
}

export async function recordAssessment(
  sb: SupabaseClient,
  caseId: string,
  assessment: Record<string, unknown>,
  expectedVersion: number,
) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0)
    throw new DomeError("Chybí platná verze stavu případu, nic se neuložilo.", 422);
  const newVersion = (assessment["case_state"] as { metadata?: { version?: unknown } } | undefined)
    ?.metadata?.version;
  if (newVersion !== expectedVersion + 1)
    throw new DomeError("Neplatná nová verze stavu případu, nic se neuložilo.", 422);
  const rec = await sb.rpc(SCHEMA.steps.recordAssessmentRpc, {
    p_case_id: caseId,
    p_assessment: assessment,
    p_expected_version: expectedVersion,
  });
  if (rec.error) {
    if (isConcurrencyConflict(rec.error)) throw new DomeError(CONCURRENCY_CONFLICT_MESSAGE, 409);
    console.error("urad_record_dome_assessment", rec.error);
    throw new DomeError("Hodnocení se nepodařilo uložit. Zkuste to prosím znovu.");
  }
}

/** Volání AI přes hranici AiProvider (výchozí: Lovable AI Gateway). Bez automatických opakování. */
export async function callAi(input: AiInput, jsonSchema?: AiJsonSchema): Promise<string> {
  try {
    return await getAiProvider().complete(input, jsonSchema);
  } catch (e) {
    if (e instanceof AiProviderError) throw new DomeError(e.message, e.status);
    throw new DomeError("Vyhodnocení se nepodařilo. Zkuste to prosím znovu.", 502);
  }
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
  const h = JSON.parse(raw) as {
    items?: { section?: string; label?: string; text?: string }[];
  } & Record<string, unknown>;
  return h;
}
