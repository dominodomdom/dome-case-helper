# 09 — Release readiness

**Verdict: NOT READY for production.** Gate status (D2): BLOCKED.

## Done (verified in this environment)
Type check, 69/69 tests across 9 files, lint 0 errors (6 fast-refresh warnings), production build, formatting,
AI provider boundary, documentation, `.env.example`.

## Not done / blocking
1. Live DB concurrency test (`supabase/d2/04_concurrency_test.sql`) — needs SQL access.
2. RLS audit of `urad_case_steps` INSERT (`01_preflight_audit.sql`).
3. Signed-in E2E incl. two-tab conflict with the 3-param RPC.
4. `03_deprecate_2param.sql` after 1–3.
5. S3 server-side idempotency for document/input writes (design + DB uniqueness/RPC contract; not yet implemented). S1/S2 code fixes are merged; signed-in production verification remains outstanding.
6. Portability outside Lovable (install/build/run on a clean machine) — UNVERIFIED.
7. No verified social-service registry / transport source (feature intentionally inert).

## Technical risks
AI may rephrase the user goal; possible duplicate needs; no idempotency on step inserts;
JSONB case state growth (re-review before Phase 3).

## Steps to finish
Run 1–2 and send outputs → run 3 → apply 4 → implement and verify S3 idempotency → clean-machine build → re-run gates.
