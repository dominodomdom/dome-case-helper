import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccessToken } from "@/lib/urad-api";
import { updateActionStatus } from "@/lib/dome.functions";
import {
  ACTION_PRIORITIES,
  isActionBlocked,
  type Action,
  type ActionStatus,
  type Certainty,
  type DomeCaseState,
  type RealityType,
} from "@/lib/case-state";

const PRIORITY_LABEL: Record<Action["priority"], string> = {
  NOW: "Teď",
  TODAY: "Dnes",
  FIRST_WORKING_DAY: "První pracovní den",
  THIS_WEEK: "Tento týden",
  LATER: "Později",
};
const STATUS_LABEL: Record<ActionStatus, string> = {
  TODO: "K udělání",
  IN_PROGRESS: "Dělám",
  WAITING: "Čekám",
  BLOCKED: "Nejde to",
  DONE: "Hotovo",
};
const REALITY_LABEL: Record<RealityType, string> = {
  FACT: "Doloženo",
  CLAIM: "Uvedl/a jste",
  INTERPRETATION: "Jak to chápu",
  VERIFICATION: "Potřeba ověřit",
};
const CERTAINTY_LABEL: Record<Certainty, string> = {
  VERIFIED: "ověřeno",
  LIKELY: "pravděpodobné",
  POSSIBLE: "možné",
  UNKNOWN: "neznámé",
  NOT_AVAILABLE: "nedostupné",
};
const URGENCY_LABEL = {
  CRITICAL: "kritické",
  HIGH: "vysoká",
  MEDIUM: "střední",
  LOW: "nízká",
  UNKNOWN: "zatím nevím",
} as const;

/** Akční plán + (rozbalitelně) realita, potřeby, oblasti, otázky. Progressive disclosure. */
export function CaseCorePanel({
  caseId,
  state,
  disabled,
  onChanged,
}: {
  caseId: string;
  state: DomeCaseState;
  disabled: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-6" data-testid="case-core">
      <ActionPlan caseId={caseId} state={state} disabled={disabled} onChanged={onChanged} />
      {state.needs.length > 0 && (
        <Collapsible title={`Aktivní potřeby (${state.needs.length})`}>
          <ul className="space-y-2 text-sm">
            {state.needs.map((n) => (
              <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{n.description}</span>
                <span className="text-xs text-muted-foreground">
                  naléhavost: {URGENCY_LABEL[n.urgency]} ·{" "}
                  {n.amount != null
                    ? `${n.amount.toLocaleString("cs-CZ")} Kč`
                    : "částka zatím neznámá"}
                  {n.deadline ? ` · do ${n.deadline}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
      {state.tracks.length > 0 && (
        <Collapsible title={`Co řešíme souběžně (${state.tracks.length})`}>
          <ul className="space-y-2 text-sm">
            {state.tracks.map((t) => (
              <li key={t.id}>
                <span className="font-medium">{t.title}</span>{" "}
                <span className="text-xs text-muted-foreground">· {t.horizon}</span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
      {state.reality.length > 0 && (
        <Collapsible title="Aktuální realita">
          <ul className="space-y-2 text-sm">
            {state.reality.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-2">
                <span
                  className={`rounded border px-1.5 text-[10px] font-semibold uppercase ${r.certainty === "VERIFIED" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                >
                  {REALITY_LABEL[r.type]} · {CERTAINTY_LABEL[r.certainty]}
                </span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
      {state.unknowns.length > 0 && (
        <Collapsible title="Co zatím nevíme">
          <ul className="space-y-3 text-sm">
            {state.unknowns.map((u) => (
              <li key={u.id}>
                <p>{u.question}</p>
                <p className="text-xs text-muted-foreground">
                  Ptám se, protože{" "}
                  {u.why_it_matters.charAt(0).toLowerCase() + u.why_it_matters.slice(1)}
                </p>
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-border p-5">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function ActionPlan({
  caseId,
  state,
  disabled,
  onChanged,
}: {
  caseId: string;
  state: DomeCaseState;
  disabled: boolean;
  onChanged: () => void;
}) {
  if (state.actions.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border p-6" data-testid="action-plan">
      <p className="font-display font-semibold">Akční plán</p>
      <div className="mt-4 space-y-5">
        {ACTION_PRIORITIES.map((p) => {
          const list = state.actions.filter((a) => a.priority === p);
          if (list.length === 0) return null;
          return (
            <div key={p}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {PRIORITY_LABEL[p]}
              </p>
              <ul className="mt-2 space-y-3">
                {list.map((a) => (
                  <ActionRow
                    key={a.id}
                    caseId={caseId}
                    a={a}
                    state={state}
                    disabled={disabled}
                    onChanged={onChanged}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActionRow({
  caseId,
  a,
  state,
  disabled,
  onChanged,
}: {
  caseId: string;
  a: Action;
  state: DomeCaseState;
  disabled: boolean;
  onChanged: () => void;
}) {
  const update = useServerFn(updateActionStatus);
  const [asking, setAsking] = useState<null | "WAITING" | "BLOCKED">(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const blocked = isActionBlocked(a, state.actions);
  const deps = a.depends_on_action_ids
    .map((d) => state.actions.find((x) => x.id === d)?.title)
    .filter(Boolean);

  async function set(status: ActionStatus, why: string | null = null) {
    setSaving(true);
    setErr(null);
    try {
      const r = await update({
        data: {
          caseId,
          accessToken: await getAccessToken(),
          actionId: a.id,
          status,
          reason: why,
          expectedVersion: state.metadata.version,
        },
      });
      if (!r.ok) setErr(r.error);
      else {
        setAsking(null);
        setReason("");
        onChanged();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Změnu se nepodařilo uložit.");
    } finally {
      setSaving(false);
    }
  }

  const off = disabled || saving;
  return (
    <li
      className={`rounded-xl border p-4 ${a.status === "DONE" ? "border-border opacity-70" : "border-border"}`}
      data-testid={`action-${a.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium ${a.status === "DONE" ? "line-through" : ""}`}>{a.title}</p>
          {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
          {blocked && a.status !== "DONE" && (
            <p
              className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="action-blocked"
            >
              <Lock className="h-3 w-3" /> Nejdřív: {deps.join(", ")}
            </p>
          )}
          {a.status_reason && (
            <p className="mt-1 text-xs text-muted-foreground">Důvod: {a.status_reason}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
          {STATUS_LABEL[a.status]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {a.status !== "DONE" && (
          <Button size="sm" disabled={off || blocked} onClick={() => void set("DONE")}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{" "}
            Hotovo
          </Button>
        )}
        {a.status !== "IN_PROGRESS" && a.status !== "DONE" && (
          <Button
            size="sm"
            variant="outline"
            disabled={off || blocked}
            onClick={() => void set("IN_PROGRESS")}
          >
            Dělám na tom
          </Button>
        )}
        {a.status !== "WAITING" && (
          <Button size="sm" variant="ghost" disabled={off} onClick={() => setAsking("WAITING")}>
            Čekám
          </Button>
        )}
        {a.status !== "BLOCKED" && (
          <Button size="sm" variant="ghost" disabled={off} onClick={() => setAsking("BLOCKED")}>
            Nejde to
          </Button>
        )}
        {a.status === "DONE" && (
          <Button size="sm" variant="ghost" disabled={off} onClick={() => void set("TODO")}>
            Vrátit
          </Button>
        )}
      </div>
      {asking && (
        <div className="mt-3 flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Důvod"
            placeholder={asking === "WAITING" ? "Na co čekáte?" : "Co brání?"}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button
            size="sm"
            disabled={off || !reason.trim()}
            onClick={() => void set(asking, reason)}
          >
            Uložit
          </Button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </li>
  );
}
