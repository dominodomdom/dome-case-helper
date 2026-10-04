import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getCurrentUser, isApproved } from "@/lib/urad-api";
import { isSupabaseConfigured } from "@/lib/supabase-config";
import { AppShell } from "@/components/dome/AppShell";

/** Přístup pouze pro přihlášeného A schváleného uživatele. */
export const Route = createFileRoute("/_chraneno")({
  ssr: false,
  beforeLoad: async () => {
    if (!isSupabaseConfigured()) throw redirect({ to: "/prihlaseni" });
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/prihlaseni" });
    if (!(await isApproved(user.id))) throw redirect({ to: "/cekani" });
    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
