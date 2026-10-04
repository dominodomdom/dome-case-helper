import { isSupabaseConfigured } from "@/lib/supabase-config";

export function ConfigNotice() {
  if (isSupabaseConfigured()) return null;
  return (
    <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
      Aplikace zatím není propojená s backendem DOME OS. Přihlášení a případy začnou fungovat po
      doplnění přístupového klíče.
    </div>
  );
}
