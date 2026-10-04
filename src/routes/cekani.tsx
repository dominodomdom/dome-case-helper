import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/dome/Brand";
import { getSupabase } from "@/lib/supabase";
import { getCurrentUser, isApproved } from "@/lib/urad-api";

export const Route = createFileRoute("/cekani")({
  ssr: false,
  head: () => ({ meta: [{ title: "Čekáme na schválení — DOME OS ÚŘAD" }, { name: "robots", content: "noindex" }] }),
  component: Waiting,
});

function Waiting() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);

  async function check() {
    const user = await getCurrentUser();
    if (!user) return navigate({ to: "/prihlaseni" });
    if (await isApproved(user.id)) return navigate({ to: "/prace" });
    setMsg("Účet zatím čeká na schválení.");
  }

  return (
    <div className="flex min-h-screen flex-col px-5 py-6">
      <Brand />
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Clock className="h-6 w-6" />
        </span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Váš účet ověřujeme</h1>
        <p className="text-muted-foreground">
          Děkujeme za registraci. Jakmile bude váš účet schválen, otevře se vám pracovní prostor DOME.
        </p>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <div className="flex gap-3">
          <Button onClick={check} className="h-11">Zkontrolovat znovu</Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={async () => {
              await getSupabase().auth.signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            Odhlásit
          </Button>
        </div>
      </div>
    </div>
  );
}
