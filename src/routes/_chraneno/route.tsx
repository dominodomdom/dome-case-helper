import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentUser, getMyAccess } from "@/lib/urad-api";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { AppShell } from "@/components/dome/AppShell";

/** Přístup pouze pokud backend potvrdí has_access (stav approved). Ověřuje se při každém vstupu. */
export const Route = createFileRoute("/_chraneno")({
  ssr: false,
  beforeLoad: async () => {
    if (!isSupabaseConfigured()) throw redirect({ to: "/prihlaseni" });
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/prihlaseni" });
    const access = await getMyAccess();
    if (!access || !access.hasAccess || access.status !== "approved") {
      throw redirect({ to: "/cekani" });
    }
    return { user, access };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
