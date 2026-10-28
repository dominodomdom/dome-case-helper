# DOME OS ÚŘAD — Single Orchestrator Architecture

Date: 2026-10-28
Status: Architecture specification; not yet implemented as a running service.

## Goal

Provide one control plane for the user's work. The user submits a task once; the orchestrator plans it, routes individual actions to approved tools, checks the results, records evidence, updates the task ledger, and resumes safely after interruptions. GitHub, Supabase, document storage, and connected apps are backends—not separate systems the user must manually coordinate.

## Product decision

Do not build a second full application or commercial product at this stage. Keep `dome-case-helper` as the case-management UI and use the existing private DOME OS ÚŘAD skill/plugin as an operator interface. Implement the orchestration contract first. Add a separate dashboard only if the current UI cannot expose task state, approvals, evidence, and recovery clearly.

## Logical components

1. **Single entry point** — receives a user goal and a stable task ID.
2. **Planner** — breaks the goal into small, verifiable tasks with dependencies and acceptance criteria.
3. **Policy gate** — classifies actions as read-only, reversible branch change, staging write, production write, external submission, or destructive/financial action.
4. **Tool router** — chooses a connector/action based on capability, least privilege, and current connection status. No tool is called solely because its name appears in a prompt.
5. **Executor** — runs one bounded step at a time; each write step must be idempotent or have an explicit recovery strategy.
6. **Verifier** — checks the real postcondition (commit exists, CI succeeded for exact SHA, database row exists, document checksum matches, etc.). Tool success messages alone are insufficient.
7. **Evidence ledger** — records task ID, step ID, tool/action, target, precondition, expected postcondition, actual outcome, evidence reference, timestamps, retry count, and approval reference. Avoid storing secrets or duplicating sensitive document bodies.
8. **Resume controller** — on restart, reloads active task and evidence, verifies the current external state, and continues from the first unmet postcondition rather than replaying completed writes.
9. **Human checkpoint** — requests approval only for clearly defined gates; records the decision and resumes after approval.

## Canonical task lifecycle

`NEW → PLANNED → READY → RUNNING → VERIFYING → DONE`

Alternative states: `WAITING_FOR_APPROVAL`, `BLOCKED`, `RETRY_WAIT`, `FAILED_NEEDS_REVIEW`, `CANCELLED`.

Rules:
- `DONE` requires all acceptance criteria to have evidence.
- A task is never marked done because an agent says it is done.
- Retry only a failed step, not the entire workflow.
- Before retrying a write after timeout, query the target system for the expected postcondition.
- Repeated requests with the same task/operation ID must not create duplicate durable effects.
- Preserve user edits and prior case state; use optimistic concurrency where supported.

## Routing and source of truth

| Data or action | Canonical source of truth | Orchestrator responsibility |
|---|---|---|
| Code, specs, runbooks, review history | GitHub | Use a dedicated branch/PR; verify exact commit and CI |
| Cases, task state, structured metadata | Supabase | Validate ownership/RLS and write through approved API/RPC |
| Original administrative files | Private object storage | Verify access policy, checksum, retention, and source-to-summary link |
| AI-generated interpretation | Case-step record linked to original | Label as derived/unverified; never treat it as the original |
| Tool connections and permissions | Connected app/connector settings | Check availability and least privilege; never infer that an app is connected |
| Human approval | Explicit approval event/reference | Pause before protected operations and resume only after recorded approval |
| Execution evidence | Task/evidence ledger | Keep compact evidence references and sanitized diagnostics |

## Execution policy

### Autonomous without per-step approval
- Read-only repository/database inspection.
- Drafting plans and documentation.
- Branch-scoped code or documentation changes.
- Running tests, lint, type checks, builds, and CI.
- Updating the task ledger with verifiable results.
- Safe retries after checking the target state.

### Requires explicit approval
- Production schema, RLS, grants, functions, or data changes.
- Applying/merging migrations to production.
- Merging a PR or deploying/publishing.
- Sending official/legal submissions or messages to third parties.
- Deleting originals, changing retention, spending money, creating chargeable infrastructure.
- Granting new permissions, connecting a new account, or exposing a private project.

## Failure and recovery protocol

1. Save step intent before an external write.
2. Use a stable idempotency key for retryable writes when supported.
3. If the response is ambiguous, read the target system before retrying.
4. Store the exact error code and sanitized context; never store access tokens or document contents in diagnostic logs.
5. Retry transient failures with bounded attempts.
6. If the action may have succeeded but cannot be verified, set `FAILED_NEEDS_REVIEW` and do not blindly repeat it.
7. Resume from evidence, not conversation memory alone.

## Current implementation gap

The repository currently has a reusable skill/runbook, task ledger, GitHub branch/PR, and existing CI. Application writes such as `addUserInput` insert directly without an idempotency key. `analyzeDocument` calls AI then inserts a summary step, but the original file is not stored. The connected Supabase project currently reports no Storage buckets. The app has not yet been proven end-to-end against a staging project with two authenticated users.

Therefore this document is the target contract, not a claim that a persistent autonomous orchestrator is already running. The next implementation slice should be the smallest reliable task/evidence state and safe resume path, followed by idempotent writes and staging integration tests.
