import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, FileText, User, Paperclip, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addUserInput, getAccessToken, listSteps, type CaseStep, type DomeAssessment, type UradCase } from "@/lib/urad-api";
import { analyzeDocument, assessCase } from "@/lib/dome.functions";
import { deriveHandoffState, formatChoice, parseChoice, type ChoiceId } from "@/lib/dome-core";
import { SupportPathCard } from "./SupportPath";

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_BYTES = 8 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Soubor nelze přečíst."));
    r.readAsDataURL(file);
  });
}

/** Pracovní prostor DOME nad skutečným případem a jeho chronologií kroků. */
export function DomeWorkspace({ item }: { item: UradCase }) {
  const qc = useQueryClient();
  const steps = useQuery({ queryKey: ["steps", item.id], queryFn: () => listSteps(item.id) });
  const assess = useServerFn(assessCase);
  const analyze = useServerFn(analyzeDocument);
  const [busy, setBusy] = useState<null | "assess" | "send" | "doc">(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const autoTried = useRef<string | null>(null);

  const list = steps.data ?? [];
  const last = list[list.length - 1];
  const latest = [...list].reverse().find((x) => x.kind === "dome_assessment")?.assessment ?? null;
  const needsAssessment = steps.isSuccess && (!last || last.kind !== "dome_assessment");
  const level = latest?.intervention_level;
  const urgent = level === "ACTIVE_HANDOFF" || level === "SAFETY_HANDOFF";
  // Stejné odvození jako na serveru — volba uživatele se projeví okamžitě, i u starších hodnocení.
  const handoffState = latest
    ? deriveHandoffState({
        choices: list.filter((x) => x.kind === "user_input").map((x) => parseChoice(x.content)).filter((x): x is ChoiceId => !!x),
        gapDetected: !!latest.immediate_need_gap?.detected,
        level: level ?? "SELF",
        targetVerified: false,
        routeVerified: false,
      })
    : "NONE";

  async function runAssessment() {
    setBusy("assess");
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const r = await assess({ data: { caseId: item.id, accessToken } });
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vyhodnocení se nepodařilo.");
    } finally {
      await qc.invalidateQueries({ queryKey: ["steps", item.id] });
      setBusy(null);
    }
  }

  // Automaticky jen jednou na daný stav (žádný nový vstup = žádné nové vyhodnocení, žádné opakování).
  useEffect(() => {
    if (!needsAssessment || busy) return;
    const key = last?.id ?? "empty";
    if (autoTried.current === key) return;
    autoTried.current = key;
    void runAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAssessment, last?.id, busy]);

  async function sendText(text: string) {
    if (!text) return false;
    setBusy("send");
    setError(null);
    try {
      await addUserInput(item.id, text);
      await qc.invalidateQueries({ queryKey: ["steps", item.id] });
      return true;
    } catch (e) {
      setError(`Odpověď se nepodařilo uložit: ${e instanceof Error ? e.message : ""}`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (await sendText(answer.trim())) setAnswer("");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("Soubor je větší než 8 MB.");
    if (!ACCEPT.split(",").includes(file.type)) return setError("Podporované jsou fotky (JPG, PNG, WEBP) a PDF.");
    setBusy("doc");
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const base64 = await toBase64(file);
      const r = await analyze({ data: { caseId: item.id, accessToken, fileName: file.name, mimeType: file.type, base64 } });
      if (!r.ok) setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dokument se nepodařilo zpracovat.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["steps", item.id] });
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {item.description && (
        <div className="rounded-2xl bg-muted p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Váš popis</p>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{item.description}</p>
        </div>
      )}

      {steps.isPending && <p className="text-muted-foreground">Načítám průběh případu…</p>}
      {steps.isError && (
        <p className="text-destructive">
          Průběh případu se nepodařilo načíst.
          <span className="block text-xs opacity-80">{(steps.error as Error).message}</span>
        </p>
      )}

      {busy === "assess" && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> DOME vyhodnocuje celý případ…
        </div>
      )}

      {latest && busy !== "assess" && (
        <>
          {!urgent && <GoalPanel a={latest} />}
          <SupportPathCard caseId={item.id} a={latest} state={handoffState} disabled={!!busy} onChoice={(id) => void sendText(formatChoice(id))} />
          {urgent && <GoalPanel a={latest} />}
          <AssessmentView a={latest} />
        </>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">
          {error}
          {needsAssessment && !busy && (
            <Button variant="outline" size="sm" className="ml-3" onClick={() => void runAssessment()}>
              Zkusit znovu
            </Button>
          )}
        </div>
      )}

      {steps.isSuccess && (
        <div className="space-y-3">
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={!!busy}
            placeholder="Napište DOME odpověď nebo doplňující informaci…"
            className="min-h-28 resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
              <Button variant="outline" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                {busy === "doc" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                Přidat dokument
              </Button>
              <p className="hidden text-xs text-muted-foreground sm:block">Soubor se jen přečte, neukládá se.</p>
            </div>
            <Button disabled={!!busy || !answer.trim()} onClick={() => void send()}>
              {busy === "send" && <Loader2 className="h-4 w-4 animate-spin" />}
              Odeslat
            </Button>
          </div>
        </div>
      )}

      {list.length > 0 && <Timeline steps={list} />}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2"><span className="text-muted-foreground">•</span><span>{t}</span></li>
        ))}
      </ul>
    </div>
  );
}

function GoalPanel({ a }: { a: DomeAssessment }) {
  if (!a.user_goal?.text) return null;
  return (
    <div className="rounded-2xl border border-border p-5" data-testid="user-goal">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Váš cíl</p>
      <p className="mt-1 font-medium">{a.user_goal.text}</p>
      {a.user_message && <p className="mt-2 text-sm leading-relaxed">{a.user_message}</p>}
      {(a.then_actions?.length ?? 0) > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{a.then_actions!.map((t, i) => <li key={i}>• {t}</li>)}</ul>
      )}
    </div>
  );
}

function AssessmentView({ a }: { a: DomeAssessment }) {
  const nowItems = a.now_actions ?? [];
  return (
    <div className="space-y-6">
      {(nowItems.length > 0 || a.primary_next_action) && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="font-display font-semibold">Co udělat teď</p>
          </div>
          {a.primary_next_action && <p className="mt-4 leading-relaxed">{a.primary_next_action}</p>}
        </div>
      )}

      <div className="rounded-2xl bg-primary p-6 text-primary-foreground">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Nejdůležitější otázka</p>
        <p className="mt-2 font-display text-xl font-semibold leading-snug">{a.current_question?.text}</p>
        {a.current_question?.reason && <p className="mt-3 text-sm opacity-85">{a.current_question.reason}</p>}
      </div>

      <details className="rounded-2xl border border-border p-6">
        <summary className="cursor-pointer text-sm font-medium">Podrobnosti a dokumenty</summary>
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Jak to zatím chápu</p>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Neověřeno</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">{a.hypothesis?.text}</p>
          <p className="mt-1 text-xs text-muted-foreground">Jistota: {a.confidence === "medium" ? "střední" : "nízká"} · nejde o právní posouzení</p>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Section title="Co jste uvedl/a" items={a.stated_by_user ?? []} />
          <Section title="Doloženo" items={a.verified ?? []} />
          <Section title="Co může pracovník zjistit s vámi" items={a.to_verify ?? []} />
          <Section title="Co zatím nevím" items={a.missing_information ?? []} />
          <Section title="Dokumenty, které se mohou hodit (nejsou podmínkou)" items={a.required_documents ?? []} />
          {a.next_step?.text && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Potom</p>
              <p className="mt-2 text-sm">{a.next_step.text}</p>
              {a.next_step.condition && <p className="mt-1 text-xs text-muted-foreground">{a.next_step.condition}</p>}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function Timeline({ steps }: { steps: CaseStep[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Průběh případu</p>
      <ol className="mt-4 space-y-4">
        {steps.map((st) => {
          const Icon = st.kind === "user_input" ? User : st.kind === "user_document" ? FileText : Sparkles;
          const label = st.kind === "user_input" ? "Vy" : st.kind === "user_document" ? `Dokument: ${st.documentName ?? ""}` : "DOME";
          const text = st.kind === "dome_assessment" ? st.assessment?.current_question?.text : st.content?.replace(/^\[VOLBA UŽIVATELE[^\]]*\]\s*/, "");
          return (
            <li key={st.id} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {label}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {new Date(st.createdAt).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </p>
                {text && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
