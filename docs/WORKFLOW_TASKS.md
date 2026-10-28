# DOME OS ÚŘAD — Workflow Task Ledger

Last reviewed: 2026-10-28
Specification: [WORKFLOW_SPECIFICATION.md](./WORKFLOW_SPECIFICATION.md)
Skill: [SKILL.md](../skills/dome-os-urad/SKILL.md)
Repository: dominodomdom/dome-case-helper
Branch: workflow/dome-os-urad-mvp

> Status changes require evidence. This ledger is a planning record, not proof that checks have passed.

| ID | Priority | State | Task | Acceptance evidence / next step |
|---|---|---|---|---|
| MVP-001 | P0 | VERIFIED | Establish versioned workflow specification | Commit 18510ef2a30abfd5f8546fa32dbf7d369d4c4f8a on workflow/dome-os-urad-mvp |
| MVP-002 | P0 | VERIFIED | Add workflow task ledger and link it to the specification | Commit 41cdf03c90663e5475325f7526d26abbbcef1542 |
| MVP-003 | P0 | VERIFIED | Open a draft pull request and run existing quality CI | Draft PR #8 open; latest Quality checks run 40722119302 succeeded on head commit 474adf819aa849d82ce75167ef5be6b3a9dde036 (tests, formatting, lint, TypeScript, production build); PR remains unmerged |
| MVP-004 | P0 | READY | Verify workflow resume behavior and evidence format | Confirm branch, ledger, PR/CI, and live case status can be reconciled without duplicate actions |
| MVP-005 | P0 | VERIFIED | Add agent runbook to AGENTS.md | Commit 5580ab05098589886c0ffd220d4f1761428b10ec; existing instructions retained and workflow section appended |
| MVP-006 | P0 | VERIFIED | Add reusable workflow skill to repository | Commit fe2c1d3e683770aa899866cfdd0a6c4397644362; skill file verified by fetching it from the branch; quality CI succeeded |\n| MVP-007 | P0 | VERIFIED | Create private ChatGPT plugin package for DOME OS ÚŘAD | Created private plugin v0.1.0 and verified manifest plus skills/dome-os-urad/SKILL.md are present: https://chatgpt.com/plugins/plugins_6ae21c8c7aa48191b20f8c1267a5ad66. Plugin packages the workflow instructions; live integrations still depend on connected apps/tools. |
| SEC-001 | P1 | IN_PROGRESS | Review urad_write_audit authorization boundary | Read-only live inspection confirmed SECURITY DEFINER, search_path=public, EXECUTE for anon/authenticated/service_role, and caller-supplied audit fields; eight audit-trigger tables identified. See [SECURITY_REVIEW_SEC-001.md](./SECURITY_REVIEW_SEC-001.md). Staging tests and migration proposal remain open. |
| SEC-002 | P1 | IN_PROGRESS | Review excess privileges on case and audit tables | Read-only ACL inventory saved in [SECURITY_REVIEW_SEC-002.md](./SECURITY_REVIEW_SEC-002.md); role membership, dependency analysis, and staging tests remain open |
| SEC-003 | P1 | IN_PROGRESS | Review assessment RPC overloads | Live definitions/grants and current app call site mapped in [SECURITY_REVIEW_SEC-003.md](./SECURITY_REVIEW_SEC-003.md); external caller inventory and staging tests remain open |
| SEC-004 | P1 | IN_PROGRESS | Design server-side idempotency for retryable writes | Design recorded in [SECURITY_REVIEW_SEC-004.md](./SECURITY_REVIEW_SEC-004.md); app/database implementation and retry/race tests remain open |
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

- The repository already has a Quality checks workflow at .github/workflows/quality.yml. It runs on pull requests to main and includes tests, lint, TypeScript check and production build. Reuse it instead of duplicating CI.
- Current test documentation describes 69 mocked tests. Do not treat them as real Supabase integration coverage.
- Production Supabase permissions, migrations, data, and official submissions are out of scope for autonomous execution without explicit approval.
