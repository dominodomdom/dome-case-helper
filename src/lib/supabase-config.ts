/**
 * Napojení na EXISTUJÍCÍ Supabase projekt DOME OS.
 * Žádný nový backend se nevytváří. Hodnoty níže je nutné sladit
 * se skutečným schématem modulu ÚŘAD v existujícím projektu.
 */
export const SUPABASE_URL =
  (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) ??
  "https://ypvawhikizjulysxkojd.supabase.co";

// Publishable / anon klíč (veřejný, smí být v kódu). Doplnit z existujícího projektu.
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ?? "";

/**
 * MAPOVÁNÍ NA EXISTUJÍCÍ SCHÉMA — TODO: ověřit podle skutečných tabulek.
 * Frontend nikdy nevytváří tabulky; jen čte/zapisuje do těchto existujících.
 */
export const SCHEMA = {
  /** Tabulka se stavem schválení uživatele */
  approval: {
    table: "profiles",
    userIdColumn: "id",
    statusColumn: "approved", // boolean, nebo stav (viz isApproved)
  },
  /** Tabulka případů modulu ÚŘAD */
  cases: {
    table: "urad_cases",
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
