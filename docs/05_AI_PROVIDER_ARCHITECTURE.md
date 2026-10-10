# 05 — AI provider architecture

## Current flow
`dome.functions.ts` → `dome.server.ts` (`generateAssessment`, `generateHandoff`, `callAi`) →
`ai-provider.server.ts` (`getAiProvider().complete`) → Lovable AI Gateway
`POST https://ai.gateway.lovable.dev/v1/responses`, streaming, model `openai/gpt-6-astra`,
strict `json_schema` output.

Call sites: case assessment (`ASSESSMENT_SCHEMA`), handoff summary (`HANDOFF_SCHEMA`),
document reading (free text, image/PDF input).

## Interface
```ts
interface AiProvider { id: string; complete(input: AiInput, jsonSchema?: AiJsonSchema): Promise<string> }
class AiProviderError { message: string /* user-safe Czech */; status: number }
```
`callAi` converts `AiProviderError` → `DomeError` with identical messages/statuses as before
(402 credits, 429 overload, 403 refused, 422 model refusal, 502 failure/empty, 500 not configured).
Domain logic (prompts, schemas, invariants, case state) does not know the vendor.

## Adding a provider
1. Implement `AiProvider` (must accept the same Responses-style `input` array incl. `input_image`
   / `input_file`, and honour strict JSON schema — or translate them).
2. Register its id in `getAiProvider`; select with server env `AI_PROVIDER`.
3. Add tests like `src/test/ai-provider.test.ts`.
Unknown ids fail loudly — no silent fallback. No second provider is implemented (none verified).

## Without Lovable AI credits
Works: auth, access gate, case list/create, replies, timeline, viewing saved assessments, action
status changes (no AI). Fails safely (nothing saved): new assessment, document reading, handoff summary.
