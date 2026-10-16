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

| ID  | Class                           | Where                                                | Issue / impact                                                                                                                                                                                                                                                          | Fix                                                                                                                                                       | DB change?                                        |
| --- | ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| S1  | FIXED in code (CI verified)     | `dome.functions.ts`, `dome.server.ts`, `urad-api.ts` | Server and client data-access paths map database failures to generic Czech responses; raw Postgres/PostgREST messages are not intended to reach the UI. Server logs retain limited diagnostics (operation + error code where applicable).                               | Merged in PR #2 and PR #5; verify with signed-in E2E                                                                                                      | No                                                |
| S2  | FIXED in code (CI verified)     | `analyzeDocument`                                    | Explicitly compares the selected case owner with the authenticated user before document contents are sent to AI or a step is written.                                                                                                                                   | Implemented; production RLS/E2E still needs verification                                                                                                  | No                                                |
| S3  | OPEN                            | `analyzeDocument`, `addUserInput`                    | A retry/double click may create duplicate `user_document`/`user_input` steps and duplicate AI cost. UI disables buttons while busy, but that is not server-side idempotency.                                                                                            | Design a request-id/deduplication contract; likely requires a DB uniqueness boundary or RPC change. Do not claim fixed until retry/race tests pass.       | Yes, likely; separate decision/migration required |
| S4  | UNVERIFIED                      | DB RLS                                               | Client direct insert of `dome_assessment` blocked?                                                                                                                                                                                                                      | Run preflight SQL                                                                                                                                         | —                                                 |
| S5  | CONFIRMED (low)                 | `ai-provider.server.ts`                              | Provider error body logged server-side (now truncated to 500 chars). No user secrets included.                                                                                                                                                                          | —                                                                                                                                                         | No                                                |
| S6  | INFO                            | `urad-api.ts`                                        | Access token is passed in the server-fn body (not a header). Over HTTPS + CSRF guard; acceptable.                                                                                                                                                                       | Optional move to header middleware                                                                                                                        | No                                                |
| S7  | LIVE AUDIT FINDING (2026-10-14) | Supabase grants on `urad_cases`                      | `anon` has table-level `REFERENCES`, `TRIGGER`, and `TRUNCATE` grants. This does not by itself prove an RLS bypass, but is unnecessary exposure unless explicitly required.                                                                                             | Review dependencies and revoke unnecessary grants in a separately reviewed migration; verify effective privileges after change.                           | Yes                                               |
| S8  | LIVE AUDIT FINDING (2026-10-14) | `urad_record_dome_assessment` overloads              | Live DB has a three-argument version with expected-version concurrency checks, plus older two- and three-argument overloads. Two older overloads have EXECUTE denied to `authenticated`, but must be removed or verified unreachable after live concurrency/RLS checks. | Follow `supabase/d2/03_deprecate_2param.sql` only after preflight, live concurrency, and signed-in E2E pass; inspect all overloads before any drop.       | Yes                                               |
| S9  | LIVE AUDIT FINDING (2026-10-14) | `urad_has_access(uuid)`                              | Live function is `SECURITY DEFINER` and EXECUTE is granted to `anon`; it delegates to `urad_is_approved_user`. A call with an explicit UUID is not proof of an access bypass, but broad exposure should be minimized.                                                   | Review the delegated function and actual app call sites, then restrict EXECUTE if no anonymous call is needed. Do not change before compatibility review. | Yes                                               |

## Live database audit — 2026-10-14

Read-only checks were run against the connected external Supabase project. Observed:

- RLS is enabled on `urad_cases` and `urad_case_steps`.
- `urad_cases` owner SELECT/UPDATE/DELETE policies compare `user_id` to `auth.uid()`; insert requires the same owner.
- `urad_case_steps` SELECT requires matching `user_id`, approved access, and ownership of the parent case.
- `urad_case_steps` INSERT policy allows only `user_input` and `user_document`, not `dome_assessment`, and requires matching user, approved access, and owned parent case.
- The three-argument `urad_record_dome_assessment(uuid,jsonb,integer)` function checks authentication, approved access, ownership, `hypothesis.status = unverified`, expected version, and next version, and locks the parent case with `FOR UPDATE`.
- The older two-argument overload and an older `(uuid,uuid,jsonb)` overload remain defined. Their authenticated EXECUTE privileges were false at audit time. The three-argument function's authenticated EXECUTE privilege was true and anon false.
- `urad_has_access(uuid)` is SECURITY DEFINER with `search_path=public`; anon and authenticated EXECUTE privileges were true at audit time.
- The grants query showed anon `TRUNCATE`, `REFERENCES`, and `TRIGGER` on `urad_cases`. This finding is based on role grants, not a destructive-operation test.

These observations are a point-in-time audit, not a full penetration test. No live concurrency test or authenticated two-user isolation test was executed by this read-only audit.

S1 and S2 are implemented and merged; the corresponding GitHub Actions pipelines passed tests, lint, typecheck and production build. Signed-in production/RLS verification remains outstanding. S3 remains open because a robust server-side idempotency boundary likely changes database uniqueness/RPC contracts and needs a separately reviewed design.
