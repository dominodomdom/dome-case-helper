import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Brand } from "./Brand";

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  async function signOut() {
    await getSupabase().auth.signOut();
    navigate({ to: "/prihlaseni", replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Brand />
          <button onClick={signOut} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Odhlásit
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">{children}</main>
    </div>
  );
}
