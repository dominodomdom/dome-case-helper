import { getSupabase } from "./supabase";
import { SCHEMA } from "./supabase-config";

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
  if (error) throw error;
  return mapCase(data as unknown as Record<string, unknown>);
}
