# 09 — Release readiness

**Verdict: NOT READY for production.** Gate status (D2): BLOCKED.

## Done (verified in this environment)
Type check, 63/63 tests, lint 0 errors (6 fast-refresh warnings), production build, formatting,
AI provider boundary, documentation, `.env.example`.

## Not done / blocking
1. Live DB concurrency test (`supabase/d2/04_concurrency_test.sql`) — needs SQL access.
2. RLS audit of `urad_case_steps` INSERT (`01_preflight_audit.sql`).
3. Signed-in E2E incl. two-tab conflict with the 3-param RPC.
4. `03_deprecate_2param.sql` after 1–3.
5. Security items S1–S3 (docs/04).
6. Portability outside Lovable (install/build/run on a clean machine) — UNVERIFIED.
7. No verified social-service registry / transport source (feature intentionally inert).

## Technical risks
AI may rephrase the user goal; possible duplicate needs; no idempotency on step inserts;
JSONB case state growth (re-review before Phase 3).

## Steps to finish
Run 1–2 and send outputs → run 3 → apply 4 → fix S1–S3 → clean-machine build → re-run gates.
