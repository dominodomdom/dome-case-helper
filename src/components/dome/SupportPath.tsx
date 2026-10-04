import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, Loader2, Phone, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccessToken, type DomeAssessment, type HandoffItem } from "@/lib/urad-api";
import { prepareHandoff } from "@/lib/dome.functions";

const LABELS: Record<HandoffItem["label"], string> = {
  FACT: "Doloženo",
  USER_REPORTED: "Uvedl uživatel",
  UNVERIFIED: "Neověřeno",
};
const SECTIONS: Record<string, string> = {
  kdo: "Kdo",
  proc_prisel: "Proč přišel",
  resi: "Co řeší",
  cil: "Cíl",
  overeno: "Ověřeno",
  neovereno: "Zatím neověřeno",
  dokumenty: "Dokumenty",
  ted_potrebuje: "Co potřebuje teď",
};

/** Paralelní cesta podpory. Nikdy nenahrazuje cíl uživatele; v režimu SELF se nezobrazuje. */
export function SupportPathCard({
  caseId,
  a,
  disabled,
  onChoice,
}: {
  caseId: string;
  a: DomeAssessment;
  disabled: boolean;
  onChoice: (text: string) => void;
}) {
  const level = a.intervention_level ?? a.support_path?.intervention_level;
  const sp = a.support_path;
  const handoff = useServerFn(prepareHandoff);
  const [summary, setSummary] = useState<HandoffItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (level === "SAFETY_HANDOFF") {
    return (
      <div className="rounded-2xl border-2 border-destructive p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Bezpečí je teď na prvním místě</p>
        <p className="mt-2 leading-relaxed">{sp?.reason}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="tel:112" className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 font-semibold text-destructive-foreground">
            <Phone className="h-4 w-4" /> 112 — tísňová linka
          </a>
          <a href="tel:155" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-medium">155 — záchranná služba</a>
          <a href="tel:158" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-medium">158 — policie</a>
        </div>
      </div>
    );
  }
  if (!sp || !level || level === "SELF" || sp.relevance === "none") return null;

  const active = level === "ACTIVE_HANDOFF";
  const title = active ? "Místo, kde ti s tím mohou pomoct" : "Možná cesta podpory";

  async function makeSummary() {
    setLoading(true);
    setErr(null);
    try {
      const r = await handoff({ data: { caseId, accessToken: await getAccessToken() } });
      if (r.ok) setSummary(r.data);
      else setErr(r.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Shrnutí se nepodařilo připravit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-2xl p-6 ${active ? "border-2 border-primary bg-card" : "border border-border"}`}>
      <div className="flex items-center gap-3">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Je to paralelní cesta — váš cíl „{a.user_goal?.text}“ řešíme dál.
      </p>

      <p className="mt-4 font-display text-lg font-semibold">{sp.target_name ?? sp.target_type}</p>
      {sp.target_address ? (
        <p className="text-sm">{sp.target_address} <span className="text-xs text-muted-foreground">(uvedl jste vy)</span></p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Konkrétní místo, adresu a otevírací dobu zatím neumím ověřit z aktuálních dat — proto je neuvádím.
        </p>
      )}
      {sp.reason && <p className="mt-3 text-sm leading-relaxed">{sp.reason}</p>}

      {sp.services.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mohou pomoct s</p>
          <ul className="mt-1 space-y-1 text-sm">{sp.services.map((s, i) => <li key={i}>• {s}</li>)}</ul>
        </div>
      )}
      {active && sp.required_documents.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Co si vzít</p>
          <ul className="mt-1 space-y-1 text-sm">{sp.required_documents.map((s, i) => <li key={i}>• {s}</li>)}</ul>
        </div>
      )}
      {sp.next_action && <p className="mt-4 text-sm font-medium">Další krok: {sp.next_action}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        {active ? (
          <>
            <Button disabled={disabled} onClick={() => onChoice("Chci tam jít — pomoz mi s tím krok za krokem.")}>Chci tam jít</Button>
            <Button variant="outline" disabled={disabled} onClick={() => onChoice("Ukaž mi jiné možnosti podpory.")}>Zobrazit jiné možnosti</Button>
          </>
        ) : (
          <>
            <Button variant="outline" disabled={disabled} onClick={() => onChoice("Chci řešit sám, bez propojení se službou.")}>Řešit sám</Button>
            <Button disabled={disabled} onClick={() => onChoice(`Chci propojit s: ${sp.target_type}.`)}>
              {level === "CONNECT" ? "Propojit" : "Chci tuto možnost"}
            </Button>
            <Button variant="ghost" disabled={disabled} onClick={() => onChoice("Ukaž mi možnosti podpory.")}>Zobrazit možnosti</Button>
          </>
        )}
        {sp.handoff_available && (
          <Button variant="ghost" disabled={disabled || loading} onClick={() => void makeSummary()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Shrnutí pro pracovníka
          </Button>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      {summary && (
        <div className="mt-5 rounded-xl bg-muted p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shrnutí pro pracovníka — předáte ho sami, DOME nikoho nekontaktoval
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {summary.map((it, i) => (
              <li key={i}>
                <span className="text-muted-foreground">{SECTIONS[it.section] ?? it.section}:</span> {it.text}{" "}
                <span className="rounded border border-border px-1.5 text-[10px] font-semibold uppercase">{LABELS[it.label]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
