# SEC-001 — Static review of the audit RPC boundary

Status: STATIC REVIEW COMPLETE / LIVE AUTHORIZATION TEST NOT PERFORMED
Date: 2026-10-28
Scope: DOME OS ÚŘAD; existing Supabase project; no production mutations

## Evidence reviewed

- Read-only live Supabase inspection on 2026-10-28 reported that public.urad_write_audit(...) is SECURITY DEFINER and EXECUTE is granted to anon and authenticated.
- The inspected function body inserts caller-supplied audit fields and uses auth.uid() for the actor identity, but does not itself validate ownership of a referenced case or require an administrative role.
- Repository instructions require all app database calls to use the signed-in user token and explicitly forbid placing a service_role key in the app.
- The app's src/lib/dome.functions.ts server functions validate the user and case ownership before their documented case operations; however, this does not by itself prove that the database RPC cannot be invoked directly by a client.
- Static repository search did not return a reliable caller inventory for urad_write_audit. The RPC may be called by database triggers or other server/database code not represented in the searched application files.

## Risk statement

Potential integrity risk: if an untrusted caller can invoke the RPC with arbitrary case IDs, event names, or payloads, they may be able to add misleading audit records. The live permission/body observation warrants remediation review, but exploitability and the exact allowed parameters have not been demonstrated. Do not describe this as a confirmed exploit.

## Recommended safe validation sequence

1. Retrieve the exact live function signature, full definition, owner, proconfig/search_path, and effective grants for anon, authenticated, and service_role.
2. Inventory all direct RPC callers, database triggers, and other routines that depend on it. Confirm whether it is intended to be callable by clients at all.
3. In an isolated staging/test project, create two test users and two synthetic cases. Verify:
   - anonymous caller cannot write an audit row;
   - authenticated user cannot write a row attributed to another actor;
   - authenticated user cannot forge case ownership or write to another user's case;
   - valid trusted audit events continue to work;
   - trigger-driven audit events continue to work.
4. Assert the audit row's actor, case reference, event type, and payload are derived from trusted context or checked against ownership/role rules, not blindly trusted caller parameters.
5. Only after the caller inventory and staging tests, prepare a least-privilege migration. Prefer revoking direct EXECUTE from anon and authenticated if no legitimate client use exists, while preserving narrowly scoped trusted trigger/server flows. Do not apply a grant change to production without explicit approval and a rollback plan.

## Acceptance criteria

- [ ] Exact function signature, definition, and effective grants captured.
- [ ] Caller and trigger inventory completed.
- [ ] Staging tests cover anonymous, owner, non-owner, and trusted internal calls.
- [ ] Proposed migration includes dependency analysis, verification queries, and rollback plan.
- [ ] No production grants or data were changed during this review.

## Current disposition

Keep SEC-001 open pending caller inventory and safe staging verification. Do not run an unauthorized or destructive probe against production.