/**
 * AI provider boundary (server-only).
 * Domain logic (dome-core, dome.server) talks to `AiProvider`, never to a vendor URL.
 * Default implementation: Lovable AI Gateway (Responses API, streaming).
 * Adding another provider = new implementation of `AiProvider` + selection in `getAiProvider`.
 */

export type AiInput = string | Record<string, unknown>[];
export type AiJsonSchema = { name: string; schema: unknown };

export interface AiProvider {
  readonly id: string;
  /** Returns the full output text; throws AiProviderError on failure. No automatic retries. */
  complete(input: AiInput, jsonSchema?: AiJsonSchema): Promise<string>;
}

/** Provider error carrying a user-safe Czech message and an HTTP-like status. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Env = Record<string, string | undefined>;

export function createLovableGatewayProvider(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): AiProvider {
  return {
    id: "lovable-gateway",
    async complete(input, jsonSchema) {
      const apiKey = env["LOVABLE_API_KEY"];
      if (!apiKey) throw new AiProviderError("AI není nakonfigurována.", 500);
      if (typeof input === "string" ? !input.trim() : input.length === 0) {
        throw new AiProviderError("Prázdný požadavek pro AI.", 400);
      }
      const res = await fetchImpl("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          input,
          stream: true,
          store: false,
          reasoning: { effort: "medium", summary: "auto" },
          include: ["reasoning.encrypted_content"],
          ...(jsonSchema
            ? {
                text: {
                  format: {
                    type: "json_schema",
                    name: jsonSchema.name,
                    schema: jsonSchema.schema,
                    strict: true,
                  },
                },
              }
            : {}),
        }),
      });
      if (!res.ok || !res.body) {
        // Body is logged server-side only (status code; body may contain provider diagnostics, not user secrets).
        const body = await res.text().catch(() => "");
        console.error(`AI gateway ${res.status}: ${body.slice(0, 500)}`);
        if (res.status === 402)
          throw new AiProviderError(
            "Došly AI kredity pracovního prostoru. Doplňte je prosím a zkuste to znovu.",
            402,
          );
        if (res.status === 429)
          throw new AiProviderError("DOME je teď přetížený. Zkuste to prosím za chvíli.", 429);
        if (res.status === 403) throw new AiProviderError("AI požadavek byl odmítnut.", 403);
        throw new AiProviderError("Vyhodnocení se nepodařilo. Zkuste to prosím znovu.", 502);
      }
      return readResponsesStream(res.body);
    },
  };
}

/** Parses an OpenAI-Responses-compatible SSE stream into output text. */
export async function readResponsesStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let refused = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        let ev: { type?: string; delta?: string };
        try {
          ev = JSON.parse(d);
        } catch {
          continue;
        }
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.refusal.delta") refused = true;
        else if (ev.type === "error" || ev.type === "response.failed")
          throw new AiProviderError("Vyhodnocení se nepodařilo dokončit.", 502);
      }
    }
  }
  if (refused) throw new AiProviderError("AI odmítla tento požadavek zpracovat.", 422);
  if (!text.trim()) throw new AiProviderError("AI nevrátila žádný výsledek.", 502);
  return text;
}

/** Selects the provider. Only one real implementation exists today; AI_PROVIDER is reserved for future ones. */
export function getAiProvider(env: Env = process.env): AiProvider {
  const id = env["AI_PROVIDER"] ?? "lovable-gateway";
  if (id !== "lovable-gateway") {
    throw new AiProviderError(`Neznámý AI poskytovatel: ${id}`, 500);
  }
  return createLovableGatewayProvider(env);
}
