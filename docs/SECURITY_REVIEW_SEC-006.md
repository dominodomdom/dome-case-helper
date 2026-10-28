# SEC-006 — Real integration verification plan

Date: 2026-10-28
Status: TEST PLAN — no production data or configuration changed.

## Why this is separate from unit tests

The repository's existing quality workflow covers unit/component tests, formatting, lint, TypeScript, and a production build. The documented 69 tests are mocked. Passing them does not prove that Supabase RLS, RPC grants, storage authorization, two-user isolation, or database concurrency behave correctly against the real service.

## Test environment requirements

- Dedicated non-production Supabase project with schema and migrations aligned to the candidate branch.
- Two separate authenticated test users (A and B), plus unauthenticated client.
- Synthetic cases and synthetic files only; no real personal or legal documents.
- Test fixtures created with normal application permissions where possible; avoid service-role setup paths except for isolated fixture preparation.
- Capture schema/migration version, commit SHA, run timestamp, test outcome, and sanitized errors.
- Ensure test data is cleaned up using a documented fixture teardown; never point this suite at production.

## Acceptance matrix

| ID | Scenario | Expected result |
|---|---|---|
| INT-01 | Unauthenticated user lists or opens cases | No private case data returned |
| INT-02 | User A lists and opens own case | Only A's authorized data returned |
| INT-03 | User A requests User B's case by UUID | Denied/not found without leaking details |
| INT-04 | User A attempts to add a step to B's case | Denied; no row written |
| INT-05 | Approved and suspended/pending access states | Backend access RPC remains authoritative |
| INT-06 | Assessment uses expected version N | Successful write advances exactly to N+1 |
| INT-07 | Assessment uses stale expected version | Conflict; no duplicate assessment |
| INT-08 | Two concurrent assessments with same expected version | At most one version transition succeeds |
| INT-09 | Duplicate idempotency key and same payload | Same durable result, one persisted operation/step |
| INT-10 | Duplicate key with different payload | Safe conflict, no second write |
| INT-11 | AI provider failure after upload | Original file remains available; no misleading success |
| INT-12 | Unauthorized storage path/signed URL attempt | Denied, no cross-user file access |
| INT-13 | Audit trigger fires on each intended table mutation | Correct minimal audit event; no caller-controlled impersonation |
| INT-14 | Table-level TRUNCATE/DDL-style privileges checked | Ordinary client roles cannot bypass row-level controls |
| INT-15 | Unknown database/provider error | Client receives safe generic message; diagnostics contain no tokens or document body |

## Execution protocol

1. Confirm target project is staging by project reference before any write.
2. Record exact branch and commit SHA.
3. Apply only reviewed staging migrations; capture rollback path.
4. Run the matrix and save sanitized output as CI artifact.
5. Repeat concurrency cases at least 10 times or use deterministic parallel requests.
6. Review failures and fix them on a feature branch.
7. Re-run full quality workflow and integration matrix.
8. Only then consider production rollout, with explicit user approval and a separate backup/rollback plan.

## Current status

Plan prepared. The integration suite has not yet been executed against a real staging Supabase project. No production database changes were made.
