import { Sparkles, FileText, Search, ListChecks } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { UradCase } from "@/lib/urad-api";

const STEPS = [
  { icon: Search, title: "Zjistíme, co se stalo", text: "Z vašeho popisu určíme, o jakou situaci jde." },
  { icon: FileText, title: "Doplníme dokumenty", text: "Řeknu vám, které dopisy nebo rozhodnutí budu potřebovat." },
  { icon: ListChecks, title: "Navrhneme další kroky", text: "Ze zjištěných skutečností odvodíme, co a do kdy udělat." },
];

/** Pracovní prostor asistenta. Logika DOME bude napojena na existující backend v další fázi. */
export function DomeWorkspace({ item }: { item: UradCase }) {
  return (
    <div className="space-y-8">
      {item.description && (
        <div className="rounded-2xl bg-muted p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Váš popis</p>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{item.description}</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="font-display font-semibold">DOME</p>
        </div>
        <p className="mt-4 leading-relaxed">
          Pojďme zjistit, co se stalo. Budu potřebovat některé dokumenty a informace. Nechte se vést —
          budeme postupovat krok za krokem.
        </p>
        <ol className="mt-6 space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-sm text-muted-foreground">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3">
        <Textarea disabled placeholder="Napište DOME odpověď nebo doplňující informaci…" className="min-h-28 resize-none" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Asistent DOME bude zpřístupněn v další fázi.</p>
          <Button disabled>Odeslat</Button>
        </div>
      </div>
    </div>
  );
}
