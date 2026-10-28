# SEC-003 — Assessment RPC overload compatibility review

Status: LIVE DEFINITIONS/GRANTS AND APP CALL SITE MAPPED; NO FUNCTION CHANGES
Date: 2026-10-28
Scope: public.urad_record_dome_assessment overloads

## Live function inventory

| Signature | SECURITY DEFINER | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE | Notable behavior |
|---|---:|---:|---:|---:|---|
| urad_record_dome_assessment(uuid,jsonb,integer) | yes | no | yes | no | Checks auth.uid(), approved access, locks the case, verifies ownership and unverified hypothesis, compares expected version, requires new version = expected + 1, then inserts immutable assessment |
| urad_record_dome_assessment(uuid,jsonb) | yes | no | no | no | Checks auth.uid(), approved access, case ownership, and unverified hypothesis; no expected-version/concurrency check |
| urad_record_dome_assessment(uuid,uuid,jsonb) | yes | no | no | yes | Uses caller-supplied p_user_id for ownership comparison; does not itself compare it to auth.uid(); execution is limited to service_role in the observed ACL |

All three functions are owned by postgres. The two newer signatures use search_path=public, auth; the older three-argument signature with p_user_id uses search_path=public.

## Application call site

The inspected application implementation in src/lib/dome.server.ts exports recordAssessment and calls SCHEMA.steps.recordAssessmentRpc with exactly:
- p_case_id
- p_assessment
- p_expected_version

The configured RPC name is urad_record_dome_assessment. This matches the three-parameter versioned function. The helper also validates expectedVersion >= 0 and requires assessment.case_state.metadata.version = expectedVersion + 1 before calling the database. The database repeats the concurrency/version checks atomically.

Static review did not find an application call to either legacy overload in the inspected source. The repository-wide search tool did not produce a reliable complete caller inventory, so that is not proof that no external/database caller exists.

## Risk and compatibility notes

- The versioned three-parameter overload is the intended application path and has the strongest concurrency controls.
- The two-parameter overload permits an authenticated session but is not executable by authenticated under the observed effective grants. Keep it disabled for client roles unless a documented compatibility need is proven.
- The p_user_id overload is executable by service_role only in the observed ACL. Its ownership check relies on a supplied user ID; any service-role caller must be trusted and must not accept an arbitrary user ID from an untrusted client.
- Do not drop or replace overloads solely because they appear unused. First inventory database routines, triggers, jobs, external integrations, migration history, and service-role call sites.
- Existing legacy assessment rows must remain readable and normalizable; changing the write RPC does not authorize rewriting history.

## Safe next steps

1. Search all application code, SQL functions, triggers, scheduled jobs, and external service call sites for all three signatures.
2. In a staging project, test initial version 0, successful version increment, stale expected version conflict, non-owner case, no approved access, invalid hypothesis status, and concurrent writes.
3. Confirm client roles cannot execute either legacy overload and only trusted service-role paths can call the p_user_id overload.
4. If a legacy overload is truly unused, prepare a separate migration proposal with dependency checks, pre/post grants, rollback steps, and legacy data read tests. Production changes require explicit approval.

## Acceptance criteria

- [x] All three live overloads, definitions, and effective grants captured.
- [x] The current application write helper mapped to the versioned three-parameter overload.
- [ ] Complete external/database caller inventory.
- [ ] Staging tests cover concurrency and authorization cases.
- [ ] Any proposed removal/update includes compatibility and rollback evidence.

## Current disposition

Keep SEC-003 open. No function, grant, data, or migration was changed.