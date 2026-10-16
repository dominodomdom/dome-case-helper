# 09 — Release readiness

**Verdict: NOT READY for production.** Gate status (D2): BLOCKED.

## Done (verified in this environment)

Latest security code fixes: PR #2 (explicit document-case ownership check and server error sanitization) and PR #5 (client data-access error sanitization) are merged. Their relevant GitHub Actions runs passed unit/component tests (69/69), lint, TypeScript check and production build. This does not substitute for signed-in production E2E or live RLS isolation tests.

D1 additive `DomeCaseState` v1.1 is merged. GitHub Actions passed on the main branch after the documentation update.

## Not done / blocking

1. **Live DB concurrency test** (`supabase/d2/04_concurrency_test.sql`) — SQL definition reviewed; two-session runtime behavior has not been verified.
2. **Signed-in isolation E2E** with two real test users and a two-tab conflict on the three-argument RPC — not run.
3. **Legacy RPC cleanup** — read-only live audit confirmed older `urad_record_dome_assessment` overloads remain defined. The two older overloads were not executable by `authenticated` at audit time, but their continued presence increases ambiguity. Do not drop them until steps 1–2 and call-site verification pass.
4. **Least-privilege grants** — live audit found `anon` grants `TRUNCATE`, `REFERENCES`, and `TRIGGER` on `urad_cases`. Review dependencies, remove unnecessary grants through a reviewed migration, and verify effective privileges afterward.
5. **Access helper exposure** — `urad_has_access(uuid)` is `SECURITY DEFINER` and callable by `anon`; inspect `urad_is_approved_user` and call sites, then restrict if compatible.
6. **S3 server-side idempotency** for document/input writes (request ID/deduplication contract; not implemented). S1/S2 and client-side database-error sanitization are merged; signed-in production verification remains outstanding.
7. Portability outside Lovable (install/build/run on a clean machine) — UNVERIFIED.
8. No verified social-service registry / transport source (feature intentionally inert).

## Live audit evidence (2026-10-14)

Read-only SQL checks confirmed:

- RLS is enabled on `urad_cases` and `urad_case_steps`.
- The `urad_case_steps` INSERT policy permits `user_input` and `user_document`, not `dome_assessment`.
- The three-argument assessment RPC checks owner, approved access, unverified hypothesis status, expected/current version and next version, and locks the parent case with `FOR UPDATE`.
- Older RPC overloads remain defined; their authenticated EXECUTE privileges were false in the audit.
- No real two-session concurrency test, signed-in two-user isolation test, or destructive grant test was performed.

See [04 — Security and RLS](04_SECURITY_AND_RLS.md) for detailed findings S7–S9. Findings are point-in-time observations and must be rechecked after any database migration.

## Technical risks

AI may rephrase the user goal; possible duplicate needs; no idempotency on step inserts; JSONB case state growth (re-review before Phase 3).

## Steps to finish

Run signed-in isolation and two-session concurrency tests → review/restrict unnecessary grants and anonymous helper access → verify legacy RPC call sites and deprecate old overloads → design and implement S3 idempotency with retry/race tests → clean-machine build → re-run release gates.
