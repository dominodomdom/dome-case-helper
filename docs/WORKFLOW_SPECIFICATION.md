# DOME OS ÚŘAD — Workflow Specification v1.0

Status: DRAFT / implementation baseline
Owner: DOME OS
Last reviewed: 2026-10-28
Repository: dominodomdom/dome-case-helper

## 1. Purpose

Define a repeatable, evidence-based workflow for advancing DOME OS ÚŘAD tasks safely. The operator may say "Pokračuj" to resume from the latest verified state. A task is not complete merely because a plan, code change, or mocked test exists.

## 2. Sources of truth

- **GitHub** is the technical source of truth for workflow rules, implementation, version history, tests, migrations, and review decisions.
- **Supabase** is the operational source of truth for live cases, case steps, assessment versions, access records, and audit events.
- **Notion** may be used for roadmap and human-readable project overview, but it must not override the code or live case state.
- **User approval** is the authority for external submissions, messages, destructive operations, permission changes, production migrations, and other consequential actions.

Never copy secrets, access tokens, API keys, passwords, or unnecessary sensitive case data into GitHub issues, commits, logs, or documentation.

## 3. Task lifecycle

Use these states consistently:

1. **BACKLOG** — identified, not yet prioritized.
2. **READY** — prerequisites and scope are clear.
3. **IN_PROGRESS** — work is underway.
4. **BLOCKED** — progress requires missing access, a decision, or an external dependency.
5. **REVIEW** — implementation or proposal is ready for independent checks.
6. **VERIFIED** — acceptance criteria passed with recorded evidence.
7. **APPROVAL_REQUIRED** — a human decision is required before a consequential action.
8. **DONE** — all acceptance criteria passed, evidence is recorded, and required approvals are present.

A task must not be marked DONE if it only has a design, mocked tests, an unverified deployment, or a failed/blocked check.

## 4. Resume protocol for "Pokračuj"

At every run:

1. Read this specification and the current branch/status.
2. Read the relevant task ledger, open issues/PRs, and the latest verification evidence.
3. Read the current live system state before proposing or repeating a mutation.
4. Select the highest-priority unblocked task whose dependencies are satisfied.
5. State its intended outcome and risk class.
6. Perform only authorized, reversible work; prefer read-only checks first.
7. Run the narrowest relevant tests, then broader tests when available.
8. Record exact evidence: commit/PR, commands, pass/fail, timestamp, and unresolved limitations.
9. Update task status only when evidence supports the transition.
10. Continue to the next safe task. Stop at BLOCKED or APPROVAL_REQUIRED with a concrete question and prepared recommendation.

Avoid duplicate work by checking whether a matching commit, PR, migration, event, or idempotency key already exists before retrying.

## 5. Risk and approval gates

### May proceed autonomously when access allows
- Read-only inspection and audit.
- Drafting specifications, tests, and migration proposals.
- Creating a separate feature/audit branch.
- Changes confined to a non-production branch that do not expose secrets or alter live data.
- Running local/mocked tests and non-destructive checks.

### Must stop for explicit user approval
- Sending or submitting official documents, emails, forms, or messages.
- Any production database migration, permission/grant change, destructive operation, or data repair.
- Deploying a change that affects users or production data.
- Changing authentication/access policy or sharing private data.
- Deleting or moving important calendar events or records.
- Any cost-incurring operation.

Approval must identify the exact action, target, expected effect, risk, and rollback/recovery plan. Approval for a proposal is not approval to execute it.

## 6. Evidence standard

Every verification record should contain:
- Task ID and scope.
- Date/time (UTC) and environment.
- Commit SHA, branch, PR, or migration name where applicable.
- Exact check or test run and its result.
- Whether the check used mocks or a real integration.
- Remaining limitations and next step.

Use VERIFIED only when acceptance criteria pass in the environment relevant to the claim. Keep MOCKED, LOCAL, STAGING, and PRODUCTION evidence distinct.

## 7. DOME OS ÚŘAD initial security work queue

Priority order:

- **SEC-001 — Audit RPC authorization:** verify effective EXECUTE grants for public.urad_write_audit and test whether an authenticated user can write misleading audit rows for a case they do not own. Do not perform hostile or destructive tests against production; use a safe isolated test environment or inspect policy/ownership logic.
- **SEC-002 — TRUNCATE grants:** review grants on public.urad_cases and public.urad_audit_log, dependencies, and intended operational roles. Prepare a least-privilege migration proposal; do not apply it without approval.
- **SEC-003 — Assessment RPC overloads:** enumerate every overload, application call site, effective grant, and compatibility requirement. Preserve historical data; do not drop functions before preflight and live integration tests.
- **SEC-004 — Retry/idempotency:** design request IDs and deduplication semantics for user_input, user_document, and AI assessment writes. Verify retries and concurrent requests in a safe integration environment.
- **SEC-005 — Evidence file retention:** design private object storage for original documents, case ownership checks, signed access, retention/deletion rules, and audit linkage. Do not upload real personal documents into a test environment.
- **SEC-006 — Integration validation:** execute real signed-in E2E, two-user isolation, database concurrency, and PDF/image upload checks in an approved non-production or safely controlled environment.

## 8. Definition of done for the first usable workflow

The MVP is complete only when:

- [ ] A repeatable run can read the current task state and select a safe next task.
- [ ] Work is versioned in a branch and reviewed before merging to main.
- [ ] Task status is linked to evidence rather than self-reported completion.
- [ ] Re-running a task does not blindly duplicate changes or external actions.
- [ ] Approval gates stop external submissions and production/destructive changes.
- [ ] At least one end-to-end cycle is verified using the real connected system.
- [ ] Failures and missing permissions produce a clear BLOCKED state.
- [ ] No credentials or unnecessary personal case data are committed.

## 9. Current baseline (2026-10-28)

- Connected Supabase project ÚŘAD was observed as ACTIVE_HEALTHY during a read-only audit.
- RLS is enabled on urad_cases and urad_case_steps.
- Live checks confirmed anon and authenticated can execute urad_write_audit; its body inserts caller-supplied audit fields and does not itself check case ownership. Exploitability has not been tested.
- Live checks confirmed TRUNCATE privileges on urad_cases for anon and authenticated, and on urad_audit_log for authenticated. This is a high-priority configuration finding, not proof that a destructive action was performed.
- The current test documentation describes 69 mocked tests. Real Supabase concurrency, signed-in two-user isolation, and real document-upload E2E remain unverified.
- analyzeDocument stores extracted document text in a case step; the code comment states that the original file is not stored.
- No production database changes, grants, migrations, deployments, or official submissions were made as part of the baseline audit.

## 10. Operating rule

Prefer the smallest safe, reviewable increment. Never claim that a change is fixed until the relevant evidence exists. Keep main stable; use a branch and pull request for review.