# SEC-001 — Static review of the audit RPC boundary

Status: STATIC REVIEW COMPLETE / LIVE AUTHORIZATION TEST NOT PERFORMED
Date: 2026-10-28
Scope: DOME OS ÚŘAD; existing Supabase project; no production mutations

## Confirmed live database evidence

Read-only queries against the connected Supabase project identified:

- Exact function: public.urad_write_audit(uuid,text,text,text,uuid,jsonb,jsonb).
- Owner: postgres; SECURITY DEFINER: true; function setting: search_path=public.
- Effective EXECUTE: true for anon, authenticated, and service_role.
- The body inserts the caller-supplied case_id, actor_type, action, table_name, row_id, old_data, and new_data. Only actor_user_id is derived from auth.uid(). The function itself has no ownership, role, or action allow-list check.
- public.urad_audit_trigger() is also SECURITY DEFINER with search_path=public and calls urad_write_audit. It is attached to INSERT/UPDATE/DELETE on urad_actions, urad_cases, urad_coverage_allocations, urad_deadlines, urad_decisions, urad_evidence, urad_needs, and urad_route_assessments.
- urad_audit_log.case_id is nullable. The trigger reads case_id from row JSON; the urad_cases table itself may not expose a case_id field, so the behavior for case-row audit events needs explicit validation.
- Repository server functions validate the user and case ownership before their documented operations, but this does not prevent direct RPC invocation when EXECUTE is granted to client roles.

## Risk statement

Potential audit-integrity risk is confirmed at the permission/function-design level: anon and authenticated have EXECUTE on a SECURITY DEFINER function whose input audit fields are not validated internally. Actual misuse/exploitability has not been demonstrated, and this review did not insert test rows or attempt an unauthorized write.

## Important design constraint

Do not simply revoke EXECUTE from anon/authenticated without checking the call graph. The database trigger function invokes urad_write_audit, and the audit writer may be intended as an internal primitive. Preserve legitimate trigger-generated audit records. Prefer a design where direct client execution is revoked while trusted trigger paths continue to work, or where the function validates a narrow set of allowed events and context. Confirm PostgreSQL function privilege behavior for trigger invocation in a staging project before migration.

## Safe validation sequence

1. Inspect full definitions and grants for urad_audit_trigger, urad_write_audit, and any other routines that call the audit writer.
2. Verify how each audited table maps to case_id, including urad_cases, where the trigger currently extracts case_id from row JSON.
3. In an isolated staging/test project, create two synthetic users and two synthetic cases. Verify anonymous calls, owner calls, non-owner calls, forged actor_type/action/table_name, and legitimate trigger-generated audit events.
4. Verify audit rows derive actor identity from trusted context and reject invalid case references and unsupported actions.
5. Prepare a least-privilege migration with dependency analysis, pre/post verification SQL, staging results, and rollback steps. Do not apply it to production without explicit user approval.

## Acceptance criteria

- [x] Exact function signature, definition, owner, settings, and effective grants captured.
- [x] Existing trigger call path identified for eight tables.
- [ ] Caller/dependency inventory completed beyond the known trigger function.
- [ ] Staging tests cover anonymous, owner, non-owner, forged parameters, and trusted trigger calls.
- [ ] Proposed migration includes dependency analysis, verification queries, and rollback plan.
- [x] No production grants or data were changed during this review.

## Current disposition

Keep SEC-001 open pending the remaining caller inventory and safe staging verification. Do not run an unauthorized or destructive probe against production.