# SEC-002 — Excess table privileges on case and audit records

Status: READ-ONLY GRANT INVENTORY COMPLETE / MIGRATION NOT APPLIED
Date: 2026-10-28
Project: Supabase ÚŘAD (ypvawhikizjulysxkojd)

## Live evidence

A read-only query of the explicit table ACLs found:

- public.urad_cases: anon has MAINTAIN, REFERENCES, TRIGGER, TRUNCATE. authenticated has INSERT, SELECT, UPDATE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE.
- public.urad_audit_log: authenticated has MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE.
- No permission was changed by this review.

The unusual privileges are not equivalent to a demonstrated exploit. In particular, effective access also depends on ownership, RLS, role membership, and PostgreSQL privilege semantics. However, TRUNCATE is not governed by row-level security in the same way as SELECT/UPDATE/DELETE, so granting it to client roles is a high-priority least-privilege concern. REFERENCES, TRIGGER, and MAINTAIN are also not normally needed by an application client.

## Safe remediation plan

1. Inventory explicit grants, PUBLIC grants, role memberships, default privileges, table owners, RLS/FORCE RLS status, and all database routines/triggers relying on these tables.
2. Identify the intended access matrix: authenticated case owner should use ordinary RLS-checked CRUD only where required; audit log should normally be read-only for appropriately authorized users and written by trusted trigger/server paths.
3. Build a migration proposal revoking unnecessary client privileges (at minimum evaluate TRUNCATE, TRIGGER, REFERENCES, MAINTAIN) while retaining required SELECT/INSERT/UPDATE behavior and all trusted trigger functionality.
4. Apply only in an isolated staging project first. Verify ordinary owner operations, two-user isolation, audit trigger writes, and that client roles cannot truncate tables.
5. Include exact pre/post ACL queries, rollback SQL, and a compatibility checklist. Production migration requires explicit user approval.

## Acceptance criteria

- [x] Current explicit ACLs for anon/authenticated on both tables captured.
- [ ] PUBLIC grants, role memberships, owners, and default privileges reviewed.
- [ ] Dependency/caller inventory complete.
- [ ] Staging tests confirm least-privilege behavior without breaking the app or audit triggers.
- [ ] Migration and rollback reviewed and approved before production application.

## Current disposition

Keep SEC-002 open. No DDL, grants, or production data changed.