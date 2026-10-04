/**
 * Napojení na EXISTUJÍCÍ Supabase projekt DOME OS.
 * Žádný nový backend se nevytváří. Používá se pouze veřejný publishable/anon klíč.
 * Nikdy sem nevkládat service_role klíč.
 */
export const SUPABASE_URL =
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ??
  "https://ypvawhikizjulysxkojd.supabase.co";

// Publishable / anon klíč (veřejný, smí být v kódu). Doplnit z existujícího projektu.
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ?? "";

/** Skutečné objekty existujícího schématu modulu ÚŘAD. */
export const SCHEMA = {
  access: {
    /** RPC vracející přístupový stav přihlášeného uživatele */
    myAccessRpc: "urad_my_access",
    /** Záložní čtení vlastního záznamu (chráněno RLS) */
    table: "urad_user_access",
    userIdColumn: "user_id",
  },
  cases: {
    table: "urad_cases",
    // TODO: ověřit názvy sloupců urad_cases podle skutečného schématu
    columns: {
      id: "id",
      ownerId: "user_id",
      title: "title",
      description: "description",
      status: "status",
      createdAt: "created_at",
    },
  },
} as const;

export const isSupabaseConfigured = () => SUPABASE_PUBLISHABLE_KEY.length > 0;
