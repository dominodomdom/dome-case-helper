# SEC-004 — Idempotency for retryable case writes

Date: 2026-10-28
Repository: `dominodomdom/dome-case-helper`
Branch: `workflow/dome-os-urad-mvp`
Status: DESIGN ONLY — no schema or production changes applied.

## Executive summary

The current application has retryable write paths that do not expose an idempotency key:
- `addUserInput(caseId, content)` inserts a new `user_input` row on each call.
- `analyzeDocument(...)` calls the AI provider and then inserts a `user_document` step. A retry may repeat AI processing and create a duplicate step.
- assessment persistence uses the versioned `urad_record_dome_assessment` RPC with an expected version, which is a useful optimistic-concurrency guard but is not a general request-id deduplication mechanism.

A client-side disabled button is not sufficient: retries can originate from network timeouts, browser refreshes, concurrent requests, or repeated server calls.

## Proposed contract

1. Every retryable mutation receives a caller-generated UUID `request_id` created once per logical user action. The same ID must be reused for retries; a genuinely new user action receives a new ID.
2. The server authenticates the caller and verifies access and ownership of the target case before accepting or returning a stored result. A request ID is not an authorization token.
3. Deduplication scope is at minimum (authenticated user, case, operation, request_id). Reusing the same key for a different operation or materially different normalized input must return a safe conflict, not silently return an unrelated result.
4. A unique database constraint is the concurrency authority. Application-level “check then insert” without a unique constraint is not race-safe.
5. Persist an operation record with states such as `in_progress`, `succeeded`, and `failed_retryable`, plus a normalized-input fingerprint and result/created-step reference. Never store access tokens, raw uploaded documents, or unnecessary sensitive content in the idempotency record.
6. For simple case-step writes, the operation record and step insert should be committed atomically in one database transaction/RPC. On duplicate request ID, return the existing step/result only after rechecking caller authorization.
7. For AI calls, do not hold a database transaction open while waiting for the provider. Claim the request atomically, perform the external call, then persist result and operation status. Define stale `in_progress` recovery, bounded retries, and a clear rule for provider timeout ambiguity. AI execution may still be repeated if the provider succeeded but the response was lost; persistence must nevertheless remain deduplicated.
8. Use a separate request ID per logical operation (user input, document analysis, assessment). Do not use the file name or content hash alone as a request ID: a user may legitimately analyze the same file twice.
9. Keep the existing assessment expected-version check. Treat stale-version conflicts separately from duplicate-request replay.
10. Log outcome metadata (operation, request ID, case ID, status, timestamps) without copying sensitive document text into logs.

## Repository observations

- `src/lib/urad-api.ts`: `addUserInput` inserts a `user_input` row directly; the function accepts no request ID.
- `src/lib/dome.functions.ts`: `analyzeDocument` validates file size/type, checks case ownership, calls AI, then inserts a `user_document` step; the source comment states the original file is not stored.
- `src/lib/dome.server.ts` uses the versioned assessment RPC with an expected version. This protects version progression but does not by itself deduplicate user input or document analysis.
- `src/lib/supabase-config.ts` maps steps to `public.urad_case_steps`. The exact live constraints, RLS policies, and safe transaction boundary must be confirmed before proposing a migration.

## Implementation plan (not yet executed)

### A. Read-only inventory
- Fetch exact live DDL for `urad_case_steps`, indexes, constraints, triggers, RLS policies, and relevant RPC grants.
- Inventory every application call site for `addUserInput`, `analyzeDocument`, and `recordAssessment`.
- Confirm whether a suitable operation table already exists; do not create a duplicate mechanism if one does.

### B. Staging design
- Prefer a dedicated `urad_idempotency_requests` table (or an equivalent existing table) with: UUID primary key; user ID; case ID; operation key; request ID; input fingerprint; status; result reference; created/updated/expiry timestamps. Enforce a unique key over user, case, operation, and request ID.
- Keep row-level access narrow; writes should go through a validated server/RPC boundary. Never grant broad client access just to make retries work.
- If a separate operation table is not appropriate, document a transaction-safe alternative with equivalent uniqueness and recovery behavior.

### C. Required tests
- Same key + same payload submitted twice returns the same persisted outcome and creates one step.
- Same key + different payload returns a conflict and creates no extra step.
- Two concurrent requests with the same key produce one durable operation/step.
- Different request IDs permit two intentional identical user inputs.
- Unauthorized user cannot discover another user's operation/result by guessing a request ID.
- Provider timeout, process interruption, and stale `in_progress` recovery do not create duplicate durable steps.
- Assessment stale-version conflict remains intact and does not get mistaken for a replay.
- Sensitive values are absent from logs and idempotency metadata.

## Safety and decision gates

- No production schema, RLS, grant, function, or data changes have been made.
- Do not apply a migration until the live schema and dependencies are inspected, a staging test is available, rollback is documented, and the user explicitly approves production changes.
- Mark SEC-004 VERIFIED only after implementation and acceptance tests run in a controlled environment. This document records a design proposal, not a completed implementation.
