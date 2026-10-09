import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SCHEMA } from "./supabase-config";
import type { DomeAssessment, HandoffItem } from "./urad-api";
import type { HumanHandoff } from "./support-engine";
import { enforceHandoffLabels, parseChoice, type ChoiceId } from "./dome-core";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e && typeof e === "object" && "message" in e) return { ok: false, error: String((e as Error).message) };
  return { ok: false, error: "Neočekávaná chyba." };
}

const caseInput = z.object({ caseId: z.string().uuid(), accessToken: z.string().min(10) });

/** Ověří uživatele, přístup a vlastnictví a sestaví celý kontext případu (název, popis, všechny kroky). */
async function loadCaseContext(caseId: string, accessToken: string) {
  const { verifyUser, DomeError } = await import("./dome.server");
  const { sb, userId } = await verifyUser(accessToken);
  const c = SCHEMA.cases.columns;
  const s = SCHEMA.steps.columns;
  const kase = await sb
    .from(SCHEMA.cases.table)
    .select(`${c.id},${c.ownerId},${c.title},${c.description}`)
    .eq(c.id, caseId)
    .maybeSingle();
  if (kase.error) throw new DomeError(`Případ nelze načíst: ${kase.error.message}`);
  if (!kase.data) throw new DomeError("Případ nebyl nalezen.", 404);
  const row = kase.data as Record<string, unknown>;
  if (row[c.ownerId] !== userId) throw new DomeError("Případ vám nepatří.", 403);
  const steps = await sb
    .from(SCHEMA.steps.table)
    .select(`${s.kind},${s.content},${s.documentName},${s.assessment},${s.createdAt}`)
    .eq(s.caseId, caseId)
    .order(s.createdAt, { ascending: true });
  if (steps.error) throw new DomeError(`Kroky případu nelze načíst: ${steps.error.message}`);

  const lines: string[] = [
    `NÁZEV PŘÍPADU: ${row[c.title] ?? ""}`,
    `PŮVODNÍ POPIS UŽIVATELE (jeho vlastními slovy):\n${row[c.description] ?? "(neuveden)"}`,
    "",
    "CHRONOLOGIE KROKŮ:",
  ];
  const rows = (steps.data ?? []) as Record<string, unknown>[];
  let documents = 0;
  const documentNames: string[] = [];
  const documentText: string[] = [];
  const choices: ChoiceId[] = [];
  const userText: string[] = [String(row[c.title] ?? ""), String(row[c.description] ?? "")];
  let previous: HumanHandoff | null = null;
  let lastAssessment = null as Record<string, unknown> | null;
  if (rows.length === 0) lines.push("(zatím žádné)");
  rows.forEach((r, i) => {
    const kind = r[s.kind];
    if (kind === "user_input") {
      const ch = parseChoice(String(r[s.content] ?? ""));
      if (ch) choices.push(ch);
      else userText.push(String(r[s.content] ?? ""));
      lines.push(`${i + 1}. UŽIVATEL: ${r[s.content]}`);
    } else if (kind === "user_document") {
      documents++;
      documentNames.push(String(r[s.documentName] ?? ""));
      documentText.push(String(r[s.content] ?? ""));
      lines.push(`${i + 1}. UŽIVATEL NAHRÁL DOKUMENT "${r[s.documentName]}". Obsah zjištěný z dokumentu: ${r[s.content] ?? "(nepodařilo se přečíst)"}`);
    } else if (kind === "dome_assessment") {
      const a = r[s.assessment] as { current_question?: { text?: string }; intervention_level?: string; handoff_state?: string; human_handoff?: HumanHandoff } | null;
      if (a?.human_handoff) previous = a.human_handoff;
      if (a) lastAssessment = a as Record<string, unknown>;
      lines.push(`${i + 1}. DOME (úroveň ${a?.intervention_level ?? "?"}, stav ${a?.handoff_state ?? "?"}) SE ZEPTAL: ${a?.current_question?.text ?? ""}`);
    }
  });
  return { sb, userId, context: lines.join("\n"), documents, choices, userText: userText.join("\n"), previous, lastAssessment, documentNames, evidenceText: [...userText, ...documentText].join("\n") };
}

/** Poslední uložený assessment případu (pro kontrolu verze těsně před zápisem). */
async function readLatestAssessment(sb: Awaited<ReturnType<typeof loadCaseContext>>["sb"], caseId: string): Promise<Record<string, unknown> | null> {
  const s = SCHEMA.steps.columns;
  const { DomeError } = await import("./dome.server");
  const r = await sb.from(SCHEMA.steps.table).select(s.assessment).eq(s.caseId, caseId).eq(s.kind, "dome_assessment")
    .order(s.createdAt, { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new DomeError(`Stav případu nelze ověřit: ${r.error.message}`);
  return ((r.data as Record<string, unknown> | null)?.[s.assessment] as Record<string, unknown> | null) ?? null;
}
const stateVersion = (a: Record<string, unknown> | null) => {
  const v = (a?.["case_state"] as { metadata?: { version?: number } } | undefined)?.metadata?.version;
  return typeof v === "number" ? v : 0;
}

/** Vyhodnotí celý případ a uloží nový dome_assessment přes RPC urad_record_dome_assessment. */
export const assessCase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => caseInput.parse(d))
  .handler(async ({ data }): Promise<Result<DomeAssessment>> => {
    try {
      const { generateAssessment, recordAssessment } = await import("./dome.server");
      const { sb, context, choices, userText, previous, lastAssessment, documents, documentNames, evidenceText } = await loadCaseContext(data.caseId, data.accessToken);
      // AI selhání vyhodí chybu → nic se neuloží (žádný částečný ani falešný výsledek).
      const assessment = await generateAssessment(`${context}\n\nVyhodnoť celý případ znovu a vrať aktuální strukturovaný stav.`, "urad", choices, { caseId: data.caseId, userText, previous });
      // CASE CORE: canonical stav → validace → uložit jen platný stav.
      const { buildCaseState, normalizeCaseState, validateCaseState } = await import("./case-state");
      const { DomeError } = await import("./dome.server");
      // Během AI běhu mohl uživatel změnit akce → stavíme vždy nad nejnovějším uloženým stavem (jeho volby se nepřepíšou).
      const latestBeforeBuild = await readLatestAssessment(sb, data.caseId);
      const prevState = normalizeCaseState(latestBeforeBuild ?? lastAssessment, data.caseId);
      const caseState = buildCaseState({
        caseId: data.caseId,
        userGoal: (assessment["user_goal"] as { text?: string } | undefined)?.text ?? null,
        interpretation: (assessment["hypothesis"] as { text?: string } | undefined)?.text ?? null,
        draft: assessment["case_draft"] as never,
        userText, documents, documentNames, evidenceText,
        previous: prevState && !prevState.metadata.legacy_normalized ? prevState : prevState ? { ...prevState, actions: [] } : null,
      });
      // Verze = poslední uložená verze (počáteční stav / legacy = 0); nová = +1. Atomicky ověří DB.
      const expectedVersion = stateVersion(latestBeforeBuild);
      caseState.metadata.version = expectedVersion + 1;
      const errs = validateCaseState(caseState);
      if (errs.length) throw new DomeError(`Vyhodnocení nemá platnou strukturu, nic se neuložilo. (${errs.slice(0, 3).join("; ")})`, 502);
      delete assessment["case_draft"];
      assessment["case_state"] = caseState;
      await recordAssessment(sb, data.caseId, assessment, expectedVersion);
      return { ok: true, data: assessment as unknown as DomeAssessment };
    } catch (e) {
      return fail(e);
    }
  });

/** Připraví „Shrnutí pro pracovníka“ (jen k předání uživatelem; nikam se neodesílá ani neukládá). */
export const prepareHandoff = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => caseInput.parse(d))
  .handler(async ({ data }): Promise<Result<HandoffItem[]>> => {
    try {
      const { generateHandoff } = await import("./dome.server");
      const { context, documents } = await loadCaseContext(data.caseId, data.accessToken);
      const h = await generateHandoff(context);
      const items = enforceHandoffLabels(
        (h.items ?? []).map((it) => ({ section: String(it.section ?? ""), label: it.label, text: String(it.text ?? "") })),
        documents,
      ) as HandoffItem[];
      return { ok: true, data: items };
    } catch (e) {
      return fail(e);
    }
  });

const MAX_BYTES = 8 * 1024 * 1024;

/** Přečte dokument (obrázek/PDF), uloží user_document krok s tím, co v něm DOME našel. Soubor se neukládá. */
export const analyzeDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        accessToken: z.string().min(10),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().regex(/^(image\/(png|jpeg|webp)|application\/pdf)$/),
        base64: z.string().min(1).max(Math.ceil((MAX_BYTES * 4) / 3) + 8),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<{ summary: string }>> => {
    try {
      const { verifyUser, callAi, DomeError } = await import("./dome.server");
      const { sb } = await verifyUser(data.accessToken);
      const own = await sb.from(SCHEMA.cases.table).select(SCHEMA.cases.columns.id).eq(SCHEMA.cases.columns.id, data.caseId).maybeSingle();
      if (own.error || !own.data) throw new DomeError("Případ nebyl nalezen.", 404);

      const url = `data:${data.mimeType};base64,${data.base64}`;
      const filePart =
        data.mimeType === "application/pdf"
          ? { type: "input_file", filename: data.fileName, file_data: url }
          : { type: "input_image", image_url: url };
      const summary = await callAi([
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Přečti tento dokument (agenda Úřadu práce ČR). Stručně česky vypiš: druh dokumentu, odesílatele, datum, číslo jednací, adresáta, o čem rozhoduje/co žádá, zmíněné lhůty a částky. Uveď jen to, co v dokumentu skutečně stojí; nečitelné označ jako nečitelné. Nic nedomýšlej a nevyvozuj právní závěry.",
            },
            filePart,
          ],
        },
      ]);
      const s = SCHEMA.steps.columns;
      const ins = await sb.from(SCHEMA.steps.table).insert({
        [s.caseId]: data.caseId,
        [s.kind]: "user_document",
        [s.documentName]: data.fileName,
        [s.content]: summary.trim(),
      });
      if (ins.error) throw new DomeError(`Dokument se nepodařilo zapsat: ${ins.error.message} (kód: ${ins.error.code ?? "?"})`);
      return { ok: true, data: { summary } };
    } catch (e) {
      return fail(e);
    }
  });

/** Uživatel změnil stav akce → nová verze canonical stavu uložená jako nový (immutable) assessment krok. Bez AI. */
export const updateActionStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        accessToken: z.string().min(10),
        actionId: z.string().min(1).max(80),
        status: z.enum(["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "DONE"]),
        reason: z.string().max(500).nullable(),
        expectedVersion: z.number().int().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<{ version: number }>> => {
    try {
      const { recordAssessment, DomeError } = await import("./dome.server");
      const { applyActionStatus, normalizeCaseState, validateCaseState } = await import("./case-state");
      const { sb, lastAssessment } = await loadCaseContext(data.caseId, data.accessToken);
      const current = normalizeCaseState(lastAssessment, data.caseId);
      if (!lastAssessment || !current || current.metadata.legacy_normalized) throw new DomeError("Případ zatím nemá akční plán.", 409);
      if (current.metadata.version !== data.expectedVersion) throw new DomeError("Stav případu se mezitím změnil. Obnovte stránku.", 409);
      const next = applyActionStatus(current, data.actionId, data.status, data.reason);
      const errs = validateCaseState(next);
      if (errs.length) throw new DomeError(`Změnu nelze uložit: ${errs[0]}`, 422);
      const act = next.actions.find((a) => a.id === data.actionId)!;
      await recordAssessment(sb, data.caseId, { ...(lastAssessment as Record<string, unknown>), case_state: next, change_note: `Akce „${act.title}“: ${data.status}${act.status_reason ? ` — ${act.status_reason}` : ""}` }, current.metadata.version);
      return { ok: true, data: { version: next.metadata.version } };
    } catch (e) {
      return fail(e);
    }
  });
