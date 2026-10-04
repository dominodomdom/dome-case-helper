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
  (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ??
  "sb_publishable_4GfQks9gfSoVISfQjkJ_LA_SyIX3kQA";

/** Skutečné objekty existujícího schématu modulu ÚŘAD. */
export const SCHEMA = {
  access: {
    /** RPC vracející přístupový stav přihlášeného uživatele */
    myAccessRpc: "urad_my_access",
    hasAccessRpc: "urad_has_access",
    /** Záložní čtení vlastního záznamu (chráněno RLS) */
    table: "urad_user_access",
    userIdColumn: "user_id",
  },
  cases: {
    table: "urad_cases",
    /** Skutečný aktivní modul ÚŘAD v public.urad_modules */
    moduleId: "1bbc571a-8e55-4014-9b26-2ebb14ff378f",
    // Ověřeno proti skutečnému schématu public.urad_cases (16 sloupců).
    columns: {
      id: "id",
      ownerId: "user_id",
      moduleId: "module_id",
      caseNumber: "case_number",
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      realityStatus: "reality_status",
      currentGap: "current_gap",
      currency: "currency",
      openedAt: "opened_at",
      resolvedAt: "resolved_at",
      closedAt: "closed_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  steps: {
    table: "urad_case_steps",
    /** dome_assessment smí zapisovat jen serverová vrstva přes toto RPC */
    recordAssessmentRpc: "urad_record_dome_assessment",
    columns: {
      id: "id",
      caseId: "case_id",
      userId: "user_id",
      kind: "kind",
      content: "content",
      documentName: "document_name",
      assessment: "assessment",
      createdAt: "created_at",
    },
  },
} as const;

export const isSupabaseConfigured = () => SUPABASE_PUBLISHABLE_KEY.length > 0;
