import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, FileText, User, Paperclip, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addUserInput, getAccessToken, listSteps, type CaseStep, type DomeAssessment, type UradCase } from "@/lib/urad-api";
import { analyzeDocument, assessCase } from "@/lib/dome.functions";

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

  async function send() {
    const text = answer.trim();
    if (!text) return;
    setBusy("send");
    setError(null);
    try {
      await addUserInput(item.id, text);
      setAnswer("");
      await qc.invalidateQueries({ queryKey: ["steps", item.id] });
    } catch (e) {
      setError(`Odpověď se nepodařilo uložit: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setBusy(null);
    }
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

      {latest && busy !== "assess" && <AssessmentView a={latest} />}

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

function AssessmentView({ a }: { a: DomeAssessment }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="font-display font-semibold">Pracovní hypotéza</p>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Neověřeno
          </span>
        </div>
        <p className="mt-4 leading-relaxed">{a.hypothesis?.text}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Jistota: {a.confidence === "medium" ? "střední" : "nízká"} · nejde o právní posouzení
        </p>
      </div>

      <div className="rounded-2xl bg-primary p-6 text-primary-foreground">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Nejdůležitější otázka</p>
        <p className="mt-2 font-display text-xl font-semibold leading-snug">{a.current_question?.text}</p>
        {a.current_question?.reason && <p className="mt-3 text-sm opacity-85">{a.current_question.reason}</p>}
      </div>

      <div className="grid gap-6 rounded-2xl border border-border p-6 sm:grid-cols-2">
        <Section title="Uvedeno" items={a.stated_by_user ?? []} />
        <Section title="Ověřeno" items={a.verified ?? []} />
        <Section title="K ověření" items={a.to_verify ?? []} />
        <Section title="Chybí zjistit" items={a.missing_information ?? []} />
        <Section title="Potřebné dokumenty" items={a.required_documents ?? []} />
        {a.next_step?.text && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Možný další krok</p>
            <p className="mt-2 text-sm">{a.next_step.text}</p>
            {a.next_step.condition && <p className="mt-1 text-xs text-muted-foreground">Podmínka: {a.next_step.condition}</p>}
          </div>
        )}
      </div>
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
          const text = st.kind === "dome_assessment" ? st.assessment?.current_question?.text : st.content;
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
