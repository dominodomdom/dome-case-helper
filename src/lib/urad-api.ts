import { getSupabase } from "./supabase";
import { SCHEMA } from "./supabase-config";

export type UradCase = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  createdAt: string | null;
};

const c = SCHEMA.cases.columns;

function mapCase(row: Record<string, unknown>): UradCase {
  return {
    id: String(row[c.id]),
    title: (row[c.title] as string) ?? "Bez názvu",
    description: (row[c.description] as string | null) ?? null,
    status: (row[c.status] as string | null) ?? null,
    createdAt: (row[c.createdAt] as string | null) ?? null,
  };
}

export async function getCurrentUser() {
  const { data, error } = await getSupabase().auth.getUser();
  if (error) return null;
  return data.user;
}

/** Stav schválení čte z existující tabulky (TODO: ověřit tvar sloupce). */
export async function isApproved(userId: string): Promise<boolean> {
  const a = SCHEMA.approval;
  const { data, error } = await getSupabase()
    .from(a.table)
    .select(a.statusColumn)
    .eq(a.userIdColumn, userId)
    .maybeSingle();
  if (error || !data) return false;
  const v = (data as Record<string, unknown>)[a.statusColumn];
  return v === true || v === "approved" || v === "schvaleno";
}

export async function listCases(): Promise<UradCase[]> {
  const { data, error } = await getSupabase()
    .from(SCHEMA.cases.table)
    .select("*")
    .order(c.createdAt, { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCase);
}

export async function getCase(id: string): Promise<UradCase | null> {
  const { data, error } = await getSupabase()
    .from(SCHEMA.cases.table)
    .select("*")
    .eq(c.id, id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCase(data) : null;
}

export async function createCase(input: { title: string; description: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Nejste přihlášeni.");
  const { data, error } = await getSupabase()
    .from(SCHEMA.cases.table)
    .insert({ [c.ownerId]: user.id, [c.title]: input.title, [c.description]: input.description })
    .select("*")
    .single();
  if (error) throw error;
  return mapCase(data);
}
