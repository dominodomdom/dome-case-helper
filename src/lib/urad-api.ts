import { getSupabase } from "./supabase";
import { SCHEMA } from "./supabase-config";
import type { HandoffState, InterventionLevel, Urgency } from "./dome-core";
import type { DomeCaseState } from "./case-state";

export type UradCase = {
  id: string;
  caseNumber: string | null;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  openedAt: string | null;
  createdAt: string | null;
};

const c = SCHEMA.cases.columns;

/** Explicitní projekce skutečných sloupců public.urad_cases. */
const CASE_SELECT = [
  c.id,
  c.caseNumber,
  c.title,
  c.description,
  c.status,
  c.priority,
  c.openedAt,
  c.createdAt,
].join(",");

function mapCase(row: Record<string, unknown>): UradCase {
  return {
    id: String(row[c.id]),
    caseNumber: (row[c.caseNumber] as string | null) ?? null,
    title: (row[c.title] as string) ?? "Bez názvu",
    description: (row[c.description] as string | null) ?? null,
    status: (row[c.status] as string | null) ?? null,
    priority: (row[c.priority] as string | null) ?? null,
    openedAt: (row[c.openedAt] as string | null) ?? null,
    createdAt: (row[c.createdAt] as string | null) ?? null,
  };
}

export async function getCurrentUser() {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) return null;
  return data.user;
}

export type AccessStatus = "pending" | "approved" | "rejected" | "suspended" | "unknown";

export type MyAccess = {
  status: AccessStatus;
  role: string | null;
  hasAccess: boolean;
  isAdmin: boolean;
  rejectionReason: string | null;
  suspensionReason: string | null;
};

function normalizeAccess(raw: unknown): MyAccess | null {
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== "object") return null;
  const s = String(row["status"] ?? "unknown");
  const status: AccessStatus = ["pending", "approved", "rejected", "suspended"].includes(s)
    ? (s as AccessStatus)
    : "unknown";
  // Přístup povolí jen backend: has_access / is_approved z DB, nikdy lokální odhad.
  const hasAccess =
    row["has_access"] === true || (row["has_access"] === undefined && row["is_approved"] === true);
  return {
    status,
    role: (row["role"] as string | null) ?? null,
    hasAccess,
    isAdmin: row["is_admin"] === true,
    rejectionReason: (row["rejection_reason"] as string | null) ?? null,
    suspensionReason: (row["suspension_reason"] as string | null) ?? null,
  };
}

/**
 * Skutečný přístupový stav z existujícího backendu.
 * Detaily (status, role, důvody) poskytuje RPC urad_my_access()
 * (záloha: vlastní řádek urad_user_access pod RLS).
 * Autoritativní boolean povolení přístupu určuje výhradně RPC urad_has_access().
 */
export async function getMyAccess(): Promise<MyAccess | null> {
  const sb = getSupabase();
  const a = SCHEMA.access;
  let n: MyAccess | null = null;
  const rpc = await sb.rpc(a.myAccessRpc);
  if (!rpc.error) {
    n = normalizeAccess(rpc.data);
  }
  if (!n) {
    const user = await getCurrentUser();
    if (!user) return null;
    const { data, error } = await sb
      .from(a.table)
      .select("*")
      .eq(a.userIdColumn, user.id)
      .maybeSingle();
    if (error || !data) return null;
    n = normalizeAccess(data);
  }
  if (!n) return null;
  // Autoritativní rozhodnutí o přístupu dělá backend přes urad_has_access().
  const has = await sb.rpc("urad_has_access");
  n.hasAccess = !has.error && has.data === true;
  return n;
}

export async function listCases(): Promise<UradCase[]> {
  const { data, error } = await getSupabase()
    .from(SCHEMA.cases.table)
    .select(CASE_SELECT)
    .order(c.createdAt, { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapCase(row as unknown as Record<string, unknown>));
}

export async function getCase(id: string): Promise<UradCase | null> {
  const { data, error } = await getSupabase()
    .from(SCHEMA.cases.table)
    .select(CASE_SELECT)
    .eq(c.id, id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCase(data as unknown as Record<string, unknown>) : null;
}

/**
 * Vytvoří skutečný případ v public.urad_cases.
 * user_id z aktuální session, module_id = modul ÚŘAD; ostatní hodnoty
 * (status, priority, reality_status, current_gap, currency, opened_at, …)
 * necháváme na databázových defaultech. Izolaci řídí RLS.
 */
export async function createCase(input: { title: string; description: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nejste přihlášeni.");
  const { data, error } = await getSupabase()
    .from(SCHEMA.cases.table)
    .insert({
      [c.ownerId]: user.id,
      [c.moduleId]: SCHEMA.cases.moduleId,
      [c.title]: input.title,
      [c.description]: input.description,
    })
    .select(CASE_SELECT)
    .single();
  if (error) {
    // Předáváme skutečnou chybu Supabase včetně kódu, ať jde přesně určit příčina.
    const e = new Error(`${error.message} (kód: ${error.code ?? "neznámý"})`);
    (e as Error & { code?: string }).code = error.code;
    throw e;
  }
  return mapCase(data as unknown as Record<string, unknown>);
}

/* ---------- Kroky případu (public.urad_case_steps) ---------- */

export type DomeAssessment = {
  hypothesis: { text: string; status: "unverified" };
  stated_by_user: string[];
  verified: string[];
  to_verify: string[];
  missing_information: string[];
  required_documents: string[];
  current_question: { text: string; reason: string };
  next_step: { text: string; condition: string };
  confidence: "low" | "medium";
  // dome-core/1.0 (starší uložená hodnocení tato pole nemají)
  user_goal?: { text: string; source: "user_stated" };
  situation?: string;
  urgency?: Urgency;
  intervention_level?: InterventionLevel;
  primary_next_action?: string;
  support_path?: SupportPath;
  // dome-core/2.0
  user_message?: string;
  immediate_need_gap?: { detected: boolean; needs: string[]; reason: string };
  support_path_required?: boolean;
  now_actions?: string[];
  then_actions?: string[];
  say_to_worker?: string;
  handoff_state?: HandoffState;
  // CASE CORE 1.0
  case_state?: DomeCaseState;
  change_note?: string;
};

export type SupportPath = {
  relevance: "none" | "optional" | "recommended" | "urgent";
  intervention_level: InterventionLevel;
  reason: string;
  target_type: string;
  target_name: string | null;
  target_address: string | null;
  target_source: "none" | "user_reported";
  services: string[];
  immediate_needs: string[];
  required_documents: string[];
  next_action: string;
  navigation_available: boolean;
  handoff_available: boolean;
  verified_at?: string | null;
  route?: { summary: string; source: string; verified_at: string } | null;
};

export type HandoffItem = {
  section: string;
  label: "FACT" | "USER_REPORTED" | "UNVERIFIED";
  text: string;
};

export type CaseStep = {
  id: string;
  kind: "user_input" | "user_document" | "dome_assessment";
  content: string | null;
  documentName: string | null;
  assessment: DomeAssessment | null;
  createdAt: string;
};

const s = SCHEMA.steps.columns;

export async function listSteps(caseId: string): Promise<CaseStep[]> {
  const { data, error } = await getSupabase()
    .from(SCHEMA.steps.table)
    .select([s.id, s.kind, s.content, s.documentName, s.assessment, s.createdAt].join(","))
    .eq(s.caseId, caseId)
    .order(s.createdAt, { ascending: true });
  if (error) throw new Error(`${error.message} (kód: ${error.code ?? "neznámý"})`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r[s.id]),
    kind: r[s.kind] as CaseStep["kind"],
    content: (r[s.content] as string | null) ?? null,
    documentName: (r[s.documentName] as string | null) ?? null,
    assessment: (r[s.assessment] as DomeAssessment | null) ?? null,
    createdAt: String(r[s.createdAt]),
  }));
}

/** Uloží odpověď uživatele jako samostatný krok (user_id doplní DB z auth.uid(), RLS platí). */
export async function addUserInput(caseId: string, content: string) {
  const { error } = await getSupabase()
    .from(SCHEMA.steps.table)
    .insert({ [s.caseId]: caseId, [s.kind]: "user_input", [s.content]: content });
  if (error) throw new Error(`${error.message} (kód: ${error.code ?? "neznámý"})`);
}

/** Přístupový token aktuální session pro serverové funkce DOME. */
export async function getAccessToken(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error("Nejste přihlášeni.");
  return t;
}
