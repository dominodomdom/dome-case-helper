# DOME OS ÚŘAD — Workflow Task Ledger

Last reviewed: 2026-10-28
Specification: [WORKFLOW_SPECIFICATION.md](./WORKFLOW_SPECIFICATION.md)
Repository: dominodomdom/dome-case-helper
Branch: workflow/dome-os-urad-mvp

> Status changes require evidence. This ledger is a planning record, not proof that checks have passed.

| ID | Priority | State | Task | Acceptance evidence / next step |
|---|---|---|---|---|
| MVP-001 | P0 | VERIFIED | Establish versioned workflow specification | Commit 18510ef2a30abfd5f8546fa32dbf7d369d4c4f8a on workflow/dome-os-urad-mvp; review spec for approval gates and source-of-truth boundaries |
| MVP-002 | P0 | IN_PROGRESS | Add workflow task ledger and link it to the specification | This file exists on the working branch; verify branch contents and commit |
| MVP-003 | P0 | READY | Open a draft pull request and run existing quality CI | Reuse .github/workflows/quality.yml; capture CI result; do not merge automatically |
| MVP-004 | P0 | READY | Verify workflow resume behavior and evidence format | Define how the next run reads branch, task ledger, PR/CI and live case status without duplicate actions |
| SEC-001 | P1 | READY | Review urad_write_audit authorization boundary | Inspect caller sites and grants; prepare safe isolated test; no destructive or unauthorized production probes |
| SEC-002 | P1 | READY | Review TRUNCATE grants on case and audit tables | Inventory dependencies and intended grants; prepare migration proposal only |
| SEC-003 | P1 | READY | Review assessment RPC overloads | Map all overloads to app call sites and grants; keep legacy records compatible |
| SEC-004 | P1 | READY | Design server-side idempotency for retryable writes | Request-ID/deduplication design plus retry/race test plan |
| SEC-005 | P2 | READY | Design secure original-document retention | Private storage, case ownership, signed access, retention and audit linkage |
| SEC-006 | P1 | READY | Plan real integration verification | Signed-in E2E, two-user isolation, database concurrency, PDF/image upload in a controlled environment |

## State rules

- VERIFIED means acceptance evidence exists for the task scope; it does not mean the entire MVP is complete.
- IN_PROGRESS means a specific implementation step is underway.
- READY means dependencies are understood and the task can be started.
- BLOCKED means a required permission, decision, environment, or dependency is missing.
- APPROVAL_REQUIRED means a proposed production/destructive/external action is waiting for explicit user approval.
- DONE is reserved for tasks whose full acceptance criteria have passed and whose evidence is recorded.

## First-run notes

- The repository already has a Quality checks workflow at .github/workflows/quality.yml. It runs on pull requests to main and includes tests, lint, TypeScript check and production build. Reuse it instead of adding duplicate CI.
- Current test documentation describes 69 mocked tests. Do not treat them as real Supabase integration coverage.
- Production Supabase permissions, migrations, data, and official submissions are out of scope for autonomous execution without explicit approval.
