import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SCHEMA } from "./supabase-config";
import type { DomeAssessment } from "./urad-api";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e && typeof e === "object" && "message" in e) return { ok: false, error: String((e as Error).message) };
  return { ok: false, error: "Neočekávaná chyba." };
}

/** Vyhodnotí celý případ a uloží nový dome_assessment přes RPC urad_record_dome_assessment. */
export const assessCase = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid(), accessToken: z.string().min(10) }).parse(d))
  .handler(async ({ data }): Promise<Result<DomeAssessment>> => {
    try {
      const { verifyUser, generateAssessment, recordAssessment, DomeError } = await import("./dome.server");
      const { sb, userId } = await verifyUser(data.accessToken);
      const c = SCHEMA.cases.columns;
      const s = SCHEMA.steps.columns;
      const kase = await sb
        .from(SCHEMA.cases.table)
        .select(`${c.id},${c.ownerId},${c.title},${c.description}`)
        .eq(c.id, data.caseId)
        .maybeSingle();
      if (kase.error) throw new DomeError(`Případ nelze načíst: ${kase.error.message}`);
      if (!kase.data) throw new DomeError("Případ nebyl nalezen.", 404);
      if ((kase.data as Record<string, unknown>)[c.ownerId] !== userId) throw new DomeError("Případ vám nepatří.", 403);
      const steps = await sb
        .from(SCHEMA.steps.table)
        .select(`${s.kind},${s.content},${s.documentName},${s.assessment},${s.createdAt}`)
        .eq(s.caseId, data.caseId)
        .order(s.createdAt, { ascending: true });
      if (steps.error) throw new DomeError(`Kroky případu nelze načíst: ${steps.error.message}`);

      const row = kase.data as Record<string, unknown>;
      const lines: string[] = [
        `NÁZEV PŘÍPADU: ${row[c.title] ?? ""}`,
        `PŮVODNÍ POPIS UŽIVATELE:\n${row[c.description] ?? "(neuveden)"}`,
        "",
        "CHRONOLOGIE KROKŮ:",
      ];
      const rows = (steps.data ?? []) as Record<string, unknown>[];
      if (rows.length === 0) lines.push("(zatím žádné)");
      rows.forEach((r, i) => {
        const kind = r[s.kind];
        if (kind === "user_input") lines.push(`${i + 1}. UŽIVATEL ODPOVĚDĚL: ${r[s.content]}`);
        else if (kind === "user_document")
          lines.push(`${i + 1}. UŽIVATEL NAHRÁL DOKUMENT "${r[s.documentName]}". Obsah zjištěný z dokumentu: ${r[s.content] ?? "(nepodařilo se přečíst)"}`);
        else if (kind === "dome_assessment") {
          const a = r[s.assessment] as { current_question?: { text?: string } } | null;
          lines.push(`${i + 1}. DOME SE ZEPTAL: ${a?.current_question?.text ?? ""}`);
        }
      });
      lines.push("", "Vyhodnoť celý případ znovu a vrať aktuální strukturovaný stav.");

      // AI selhání vyhodí chybu → nic se neuloží (žádný částečný ani falešný výsledek).
      const assessment = await generateAssessment(lines.join("\n"));
      // Zápis jako přihlášený uživatel; DB funkce znovu ověří identitu, přístup a vlastnictví.
      await recordAssessment(sb, data.caseId, assessment);
      return { ok: true, data: assessment as unknown as DomeAssessment };
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
