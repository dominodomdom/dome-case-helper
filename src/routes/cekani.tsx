import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, XCircle, ShieldOff, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/dome/Brand";
import { getSupabase } from "@/lib/supabase";
import { getCurrentUser, getMyAccess, type MyAccess } from "@/lib/urad-api";

export const Route = createFileRoute("/cekani")({
  ssr: false,
  head: () => ({ meta: [{ title: "Stav účtu — DOME OS ÚŘAD" }, { name: "robots", content: "noindex" }] }),
  component: Waiting,
});

function Waiting() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<MyAccess | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const user = await getCurrentUser();
      if (!user) return void navigate({ to: "/prihlaseni" });
      const a = await getMyAccess();
      if (a?.hasAccess && a.status === "approved") return void navigate({ to: "/prace" });
      setAccess(a);
    } finally {
      setChecking(false);
    }
  }, [navigate]);

  useEffect(() => {
    void check();
  }, [check]);

  const status = access?.status;
  const view =
    status === "rejected"
      ? { icon: XCircle, title: "Registrace nebyla schválena", text: access?.rejectionReason ?? "Váš účet nebyl schválen. Pokud jde o omyl, kontaktujte prosím správce.", tone: "text-destructive" }
      : status === "suspended"
        ? { icon: ShieldOff, title: "Přístup je pozastaven", text: access?.suspensionReason ?? "Váš přístup byl dočasně pozastaven. Kontaktujte prosím správce.", tone: "text-destructive" }
        : status === "pending"
          ? { icon: Clock, title: "Váš účet ověřujeme", text: "Děkujeme za registraci. Jakmile bude váš účet schválen, otevře se vám pracovní prostor DOME.", tone: "text-accent-foreground" }
          : { icon: HelpCircle, title: access === undefined ? "Ověřuji stav účtu…" : "Stav účtu se nepodařilo zjistit", text: access === undefined ? "" : "Zkuste to prosím znovu za chvíli.", tone: "text-muted-foreground" };
  const Icon = view.icon;

  return (
    <div className="flex min-h-screen flex-col px-5 py-6">
      <Brand />
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-6 text-center">
        <span className={`flex h-14 w-14 items-center justify-center rounded-full bg-accent ${view.tone}`}>
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{view.title}</h1>
        {view.text && <p className="text-muted-foreground">{view.text}</p>}
        <div className="flex gap-3">
          {status !== "rejected" && status !== "suspended" && (
            <Button onClick={check} disabled={checking} className="h-11">
              {checking ? "Ověřuji…" : "Zkontrolovat znovu"}
            </Button>
          )}
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
