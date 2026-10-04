import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, Loader2, Phone, ClipboardList, Navigation, MapPin, Copy, Check, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAccessToken, type DomeAssessment, type HandoffItem } from "@/lib/urad-api";
import { prepareHandoff } from "@/lib/dome.functions";
import type { ChoiceId, HandoffState } from "@/lib/dome-core";

const LABELS: Record<HandoffItem["label"], string> = {
  FACT: "Doloženo",
  USER_REPORTED: "Uvedl uživatel",
  UNVERIFIED: "Neověřeno",
};
const SECTIONS: { id: string; title: string }[] = [
  { id: "cil", title: "Cíl uživatele" },
  { id: "aktualni_situace", title: "Aktuální situace" },
  { id: "potrebuje_ted", title: "Co potřebuje nyní" },
  { id: "dokumenty", title: "Dokumenty" },
  { id: "puvodni_cil", title: "Původní cíl" },
];

type Props = {
  caseId: string;
  a: DomeAssessment;
  state: HandoffState;
  disabled: boolean;
  onChoice: (id: ChoiceId) => void;
};

/**
 * Cesta podpory paralelně k cíli uživatele (HUMAN HANDOFF v2.0).
 * Pořadí: kam jít → co udělat teď → jak se tam dostat → co říct → předat telefon. Cíl a dokumenty až pod tím.
 */
export function SupportPathCard({ caseId, a, state, disabled, onChoice }: Props) {
  const level = a.intervention_level ?? a.support_path?.intervention_level;
  const sp = a.support_path;
  const [reopened, setReopened] = useState(false);

  if (level === "SAFETY_HANDOFF") return <SafetyCard reason={sp?.reason} />;
  if (!sp || !level || level === "SELF" || sp.relevance === "none") return null;

  if (state === "HANDOFF_DECLINED" && !reopened) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
        <span>Rozumím, pokračujeme v tom, co řešíte. Nabídku pomoci jsem skryl.</span>
        <Button variant="ghost" size="sm" onClick={() => setReopened(true)}>Zobrazit znovu</Button>
      </div>
    );
  }

  const active = level === "ACTIVE_HANDOFF";
  const flow = state === "USER_EN_ROUTE" || state === "HANDOFF_READY";
  if (state === "HUMAN_CONNECTED" || state === "HANDOFF_COMPLETED") {
    return (
      <div className="rounded-2xl border-2 border-primary p-6" data-testid="human-connected">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Jste ve spojení s pracovníkem</p>
        <p className="mt-2 leading-relaxed">
          Pracovník teď pomáhá s dnešní situací. Já můžu dál pomáhat vám i jemu — s dokumenty, formulářem a tím, co řešíte{a.user_goal?.text ? ` („${a.user_goal.text}“)` : ""}.
        </p>
        {state === "HUMAN_CONNECTED" && (
          <Button className="mt-4" variant="outline" disabled={disabled} onClick={() => onChoice("DONE")}>Předání je dokončené</Button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-6 rounded-2xl p-6 ${active ? "border-2 border-primary bg-card" : "border border-border"}`} data-testid="support-card">
      {/* 1. KAM JÍT */}
      <div>
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {active ? "Místo, kde ti mohou pomoci" : "Můžeme přidat člověka, který se tomu věnuje"}
          </p>
        </div>
        {active && sp.immediate_needs.length > 0 && (
          <p className="mt-3 leading-relaxed">{sp.immediate_needs.join(" · ")}</p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {active
            ? "Tahle služba může pomoct vyřešit dnešní situaci a zároveň s tebou pokračovat v tom, co právě řešíš."
            : "Můžeš to řešit sám, nebo můžeme přidat člověka nebo organizaci, která se tomu věnuje. Je to jen na tobě."}
        </p>
        <p className="mt-4 font-display text-lg font-semibold">{sp.target_name ?? sp.target_type}</p>
        {sp.target_address && <p className="text-sm">{sp.target_address} <span className="text-xs text-muted-foreground">(uvedl/a jste vy)</span></p>}
        {sp.services.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">{sp.services.map((s, i) => <li key={i}>• {s}</li>)}</ul>
        )}
      </div>

      {!flow && (
        <div className="flex flex-wrap gap-2">
          {active ? (
            <>
              <Button size="lg" disabled={disabled} onClick={() => onChoice("GO")}>Chci tam jít</Button>
              <Button variant="outline" disabled={disabled} onClick={() => onChoice("OTHER")}>Zobrazit jiné možnosti</Button>
              <Button variant="ghost" disabled={disabled} onClick={() => onChoice("DECLINE")}>Teď to nechci</Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={disabled} onClick={() => onChoice("SELF")}>Řešit sám</Button>
              <Button disabled={disabled} onClick={() => onChoice("CONNECT")}>Propojit</Button>
              <Button variant="ghost" disabled={disabled} onClick={() => onChoice("OPTIONS")}>Zobrazit možnosti</Button>
            </>
          )}
        </div>
      )}

      {flow && <HandoffFlow caseId={caseId} a={a} state={state} disabled={disabled} onChoice={onChoice} />}

      {/* doklady jen jako podpora, nikdy podmínka */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Pokud máte občanský průkaz a další dokumenty, vezměte je s sebou. Pokud je nemáte, neodkládejte kvůli tomu kontakt s pomocí.
      </p>
    </div>
  );
}

function HandoffFlow({ caseId, a, state, disabled, onChoice }: Props) {
  const sp = a.support_path!;
  const address = sp.target_address;
  const mapsUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=transit` : null;
  const [showAddr, setShowAddr] = useState(false);
  const [say, setSay] = useState(a.say_to_worker ?? "");
  const [copied, setCopied] = useState(false);
  useEffect(() => setSay(a.say_to_worker ?? ""), [a.say_to_worker]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(say);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* schránka nedostupná — text zůstává vidět */
    }
  }

  return (
    <div className="space-y-6" data-testid="handoff-flow">
      {/* 2. CO UDĚLAT TEĎ */}
      {(a.now_actions?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Co udělat teď</p>
          <ol className="mt-2 space-y-1 text-sm">{a.now_actions!.map((t, i) => <li key={i}>{i + 1}. {t}</li>)}</ol>
        </div>
      )}

      {/* 3. JAK SE TAM DOSTAT */}
      <div className="rounded-xl bg-muted p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dostat se tam</p>
        {sp.navigation_available && sp.route ? (
          <>
            <p className="mt-2 text-sm">{sp.route.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ověřeno: {sp.route.source}, {sp.route.verified_at}</p>
          </>
        ) : address ? (
          <>
            <p className="mt-2 text-sm">Aktuální trasu teď neumím ověřit. Zobrazím vám adresu a můžete ji otevřít v navigaci.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild><a href={mapsUrl!} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Navigovat tam</a></Button>
              <Button variant="outline" onClick={() => setShowAddr((v) => !v)}><MapPin className="h-4 w-4" /> Ukázat adresu</Button>
            </div>
            {showAddr && <p className="mt-3 font-display text-2xl font-semibold leading-snug">{address}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm" data-testid="no-navigation">
            Konkrétní místo a aktuální trasu teď neumím ověřit, proto žádnou adresu ani spoj nevymýšlím. Napište mi, kde přibližně jste — nebo se zeptejte na nejbližším úřadě městské části po sociálním pracovníkovi.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Ověřeno: {sp.verified_at ?? "zatím žádný ověřený zdroj"}</p>
      </div>

      {/* 4. CO ŘÍCT */}
      {say !== "" || a.say_to_worker ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Co říct</p>
          <Textarea value={say} onChange={(e) => setSay(e.target.value)} className="mt-2 min-h-24" aria-label="Co říct pracovníkovi" />
          <Button className="mt-2" variant="outline" size="sm" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Zkopírováno" : "Kopírovat"}
          </Button>
        </div>
      ) : null}

      {/* 5. PŘEDAT TELEFON / SHRNUTÍ */}
      {state === "USER_EN_ROUTE" ? (
        <Button variant="outline" disabled={disabled} onClick={() => onChoice("AT_PLACE")}>Jsem na místě</Button>
      ) : (
        <PhoneHandover caseId={caseId} disabled={disabled} onChoice={onChoice} />
      )}
      {state === "USER_EN_ROUTE" && <WorkerSummary caseId={caseId} buttonLabel="Předat shrnutí pracovníkovi" />}
    </div>
  );
}

function PhoneHandover({ caseId, disabled, onChoice }: { caseId: string; disabled: boolean; onChoice: (id: ChoiceId) => void }) {
  const [consent, setConsent] = useState(false);
  if (!consent) {
    return (
      <div className="rounded-xl border border-border p-4" data-testid="handoff-ready">
        <p className="text-sm leading-relaxed">
          Pokud chcete, můžete telefon předat pracovníkovi. DOME mu může stručně shrnout situaci, kterou jste zde uvedl/a.
        </p>
        <Button className="mt-3" disabled={disabled} onClick={() => setConsent(true)}>
          <Smartphone className="h-4 w-4" /> Předat telefon pracovníkovi
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-primary p-4">
      <p className="text-sm">DOME je připraven předat pracovníkovi pouze informace potřebné k pochopení aktuální situace.</p>
      <WorkerSummary caseId={caseId} buttonLabel="Souhlasím, zobrazit shrnutí" onShown={() => onChoice("PHONE_HANDOVER")} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={disabled} onClick={() => onChoice("CONNECTED")}>Pracovník převzal situaci</Button>
        <Button variant="ghost" onClick={() => setConsent(false)}><X className="h-4 w-4" /> Zrušit</Button>
      </div>
    </div>
  );
}

function WorkerSummary({ caseId, buttonLabel, onShown }: { caseId: string; buttonLabel: string; onShown?: () => void }) {
  const handoff = useServerFn(prepareHandoff);
  const [summary, setSummary] = useState<HandoffItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function make() {
    setLoading(true);
    setErr(null);
    try {
      const r = await handoff({ data: { caseId, accessToken: await getAccessToken() } });
      if (r.ok) {
        setSummary(r.data);
        onShown?.();
      } else setErr(r.error);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Shrnutí se nepodařilo připravit.");
    } finally {
      setLoading(false);
    }
  }

  if (!summary) {
    return (
      <div>
        <Button variant="outline" disabled={loading} onClick={() => void make()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} {buttonLabel}
        </Button>
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      </div>
    );
  }
  return <WorkerSummaryView items={summary} />;
}

export function WorkerSummaryView({ items }: { items: HandoffItem[] }) {
  return (
    <div className="rounded-xl bg-muted p-4" data-testid="worker-summary">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shrnutí pro pracovníka</p>
      <p className="mt-1 text-xs text-muted-foreground">Připravil DOME z toho, co uživatel uvedl. DOME nikoho nekontaktoval.</p>
      {SECTIONS.map((sec) => {
        const rows = items.filter((i) => i.section === sec.id);
        if (rows.length === 0) return null;
        return (
          <div key={sec.id} className="mt-3">
            <p className="text-sm font-semibold">{sec.title}</p>
            <ul className="mt-1 space-y-1 text-sm">
              {rows.map((it, i) => (
                <li key={i}>
                  – {it.text}{" "}
                  <span className="rounded border border-border px-1.5 text-[10px] font-semibold uppercase">{LABELS[it.label]}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function SafetyCard({ reason }: { reason?: string | undefined }) {
  return (
    <div className="rounded-2xl border-2 border-destructive p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Bezpečí je teď na prvním místě</p>
      {reason && <p className="mt-2 leading-relaxed">{reason}</p>}
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
