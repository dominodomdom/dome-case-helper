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
| S1 | CONFIRMED (low) | `dome.functions.ts`, `dome.server.ts` | Raw Postgres error messages/codes are returned to the user in Czech messages (e.g. "Případ nelze načíst: …"). Minor information disclosure. | Map to generic messages, log details server-side | No |
| S2 | POTENTIAL | `analyzeDocument` | Ownership checked only by RLS-scoped select of the case, not by explicit `user_id` compare like other functions. Safe iff RLS restricts selects to owner (UNVERIFIED). | Add explicit owner compare | No |
| S3 | POTENTIAL | `analyzeDocument`, `addUserInput` | No idempotency: a retry/double click can create duplicate `user_document`/`user_input` steps (and duplicate AI cost). UI disables buttons while busy. | Client request id + dedupe | Ideally yes (unique key) |
| S4 | UNVERIFIED | DB RLS | Client direct insert of `dome_assessment` blocked? | Run preflight SQL | — |
| S5 | CONFIRMED (low) | `ai-provider.server.ts` | Provider error body logged server-side (now truncated to 500 chars). No user secrets included. | — | No |
| S6 | INFO | `urad-api.ts` | Access token is passed in the server-fn body (not a header). Over HTTPS + CSRF guard; acceptable. | Optional move to header middleware | No |

S1–S3 were documented, not changed in this pass, to avoid altering user-visible contracts.
