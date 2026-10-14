# 04 — Security and RLS

## Keys
- Publishable key: public, in client bundle (by design). Build output checked: no service_role /
  `sb_secret_` value present (only the word in comments/library docs).
- `LOVABLE_API_KEY`: server-only, read via `process.env` inside handlers, never `VITE_*`.

## Authorization model
Every server function: `verifyUser` (auth.getUser with the user token) → `urad_has_access` →
case ownership (`user_id === userId`) → RLS still applies (user-scoped client). The save RPC
re-checks everything (SECURITY DEFINER). Protected UI routes are a convenience gate only.

## Input validation
zod on all server functions (UUIDs, enums, sizes, MIME whitelist, 8 MB file limit).
Server functions are CSRF-protected (`src/start.ts`).

## Findings
| ID | Class | Where | Issue / impact | Fix | DB change? |
| --- | --- | --- | --- | --- | --- |
| S1 | FIXED in code (CI verified) | `dome.functions.ts`, `dome.server.ts` | Database errors are mapped to generic Czech responses; the shared `fail()` boundary only forwards deliberately created `DomeError` messages and masks unknown errors. Server logs retain diagnostic details. | Implemented; verify with signed-in E2E | No |
| S2 | FIXED in code (CI verified) | `analyzeDocument` | Explicitly compares the selected case owner with the authenticated user before document contents are sent to AI or a step is written. | Implemented; production RLS/E2E still needs verification | No |
| S3 | OPEN | `analyzeDocument`, `addUserInput` | A retry/double click may create duplicate `user_document`/`user_input` steps and duplicate AI cost. UI disables buttons while busy, but that is not server-side idempotency. | Design a request-id/deduplication contract; likely requires a DB uniqueness boundary or RPC change. Do not claim fixed until retry/race tests pass. | Yes, likely; separate decision/migration required |
| S4 | UNVERIFIED | DB RLS | Client direct insert of `dome_assessment` blocked? | Run preflight SQL | — |
| S5 | CONFIRMED (low) | `ai-provider.server.ts` | Provider error body logged server-side (now truncated to 500 chars). No user secrets included. | — | No |
| S6 | INFO | `urad-api.ts` | Access token is passed in the server-fn body (not a header). Over HTTPS + CSRF guard; acceptable. | Optional move to header middleware | No |

S1–S3 were documented, not changed in this pass, to avoid altering user-visible contracts.
