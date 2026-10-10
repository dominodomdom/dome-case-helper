import { describe, expect, it, vi } from "vitest";
import {
  AiProviderError,
  createLovableGatewayProvider,
  getAiProvider,
} from "@/lib/ai-provider.server";

// Mock boundary: fetch is replaced; no real AI gateway is called.
function sse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200 });
}

describe("AI provider boundary", () => {
  it("assembles streamed output text and sends the schema", async () => {
    const f = vi.fn(async () =>
      sse([
        { type: "response.output_text.delta", delta: '{"a":' },
        { type: "response.output_text.delta", delta: "1}" },
      ]),
    );
    const p = createLovableGatewayProvider({ LOVABLE_API_KEY: "k" }, f as never);
    expect(await p.complete("ahoj", { name: "x", schema: {} })).toBe('{"a":1}');
    const body = JSON.parse(
      (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.text.format.name).toBe("x");
  });

  it("missing API key fails without calling the network", async () => {
    const f = vi.fn();
    const p = createLovableGatewayProvider({}, f as never);
    await expect(p.complete("x")).rejects.toMatchObject({ status: 500 });
    expect(f).not.toHaveBeenCalled();
  });

  it("empty input is rejected", async () => {
    const p = createLovableGatewayProvider({ LOVABLE_API_KEY: "k" }, vi.fn() as never);
    await expect(p.complete("  ")).rejects.toBeInstanceOf(AiProviderError);
  });

  it.each([
    [402, 402],
    [429, 429],
    [403, 403],
    [500, 502],
  ])("HTTP %i maps to status %i", async (http, status) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const p = createLovableGatewayProvider(
      { LOVABLE_API_KEY: "k" },
      (async () => new Response("err", { status: http })) as never,
    );
    await expect(p.complete("x")).rejects.toMatchObject({ status });
  });

  it("refusal, stream failure and empty output are errors, never partial success", async () => {
    const mk = (ev: unknown[]) =>
      createLovableGatewayProvider({ LOVABLE_API_KEY: "k" }, (async () => sse(ev)) as never);
    await expect(mk([{ type: "response.refusal.delta" }]).complete("x")).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      mk([
        { type: "response.output_text.delta", delta: "{" },
        { type: "response.failed" },
      ]).complete("x"),
    ).rejects.toMatchObject({ status: 502 });
    await expect(mk([]).complete("x")).rejects.toMatchObject({ status: 502 });
  });

  it("unknown provider id is rejected instead of silently falling back", () => {
    expect(() => getAiProvider({ AI_PROVIDER: "other" })).toThrow(AiProviderError);
    expect(getAiProvider({}).id).toBe("lovable-gateway");
  });
});
