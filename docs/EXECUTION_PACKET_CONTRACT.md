# DOME OS ÚŘAD — Execution Packet Contract

Status: IMPLEMENTATION CONTRACT / TEMPLATE  
Scope: branch-scoped, testable work; not an authorization to change production systems.

## Purpose

A task should be handed to an execution agent once as a complete packet. The agent is responsible for the full bounded lifecycle: inspect context, plan dependencies, implement, test, repair failures, verify postconditions, and return evidence. The user should not need to manually translate every intermediate step into another prompt.

This file defines the contract for those packets. It is not itself a running executor.

## Required packet fields

Every execution packet must specify:

1. **Task ID** — stable ID for the logical task; reused when resuming.
2. **Outcome** — observable end state, not a vague activity.
3. **Repository and ref** — exact repository, branch, and starting commit.
4. **Inputs** — exact source files, records, URLs, and approved data sources.
5. **Scope boundaries** — files/systems that may be changed and those that must remain untouched.
6. **Prerequisites** — credentials/permissions/environment required; never include secrets in the packet.
7. **Dependency-ordered steps** — concrete actions from initial inspection through final verification.
8. **Acceptance criteria** — objective checks for each important behavior.
9. **Test plan** — targeted tests plus the existing full quality workflow when applicable.
10. **Risk class** — read-only, branch-local reversible, staging write, or protected action.
11. **Approval gates** — any production, external, destructive, paid, publishing, merge, or permission-changing operation requiring explicit approval.
12. **Evidence outputs** — commit/PR links, test-run IDs, logs with sensitive values removed, artifact paths, and a concise result report.
13. **Resume data** — completed steps, current state, last verified checkpoint, outstanding blockers, and stable operation IDs.

## Mandatory execution loop

1. **Inspect before editing.** Read the task, current branch/commit, relevant files, existing tests, and live system state where authorized. Do not rely on stale notes if the state can be checked.
2. **Plan the complete path.** List dependencies and acceptance checks before changing anything. Identify external actions and approval gates.
3. **Check authorization.** Classify every proposed operation. Stop at a protected-action boundary and request approval; continue with independent safe work where possible.
4. **Make the smallest coherent change.** Reuse existing infrastructure and workflows. Avoid duplicate apps, tables, CI workflows, or integrations without evidence they are needed.
5. **Run focused tests.** Add regression tests for changed behavior and failure cases. For writes, include retry/idempotency and concurrency tests when relevant.
6. **Run repository quality checks.** Reuse the repository's established CI workflow rather than creating a duplicate. Wait for checks to finish and match the result to the exact tested commit.
7. **Repair and repeat.** If checks fail, inspect the failure, make a bounded fix, rerun relevant checks, then rerun the required quality gate. Do not report success based on an attempted run.
8. **Verify postconditions independently.** Read back the changed artifact/state and compare it with the acceptance criteria. A successful tool response alone is not proof of correct behavior.
9. **Record evidence and checkpoint.** Store the exact commit, test run, outcomes, blockers, and next action in the task ledger/evidence record.
10. **Return a completion report.** State what changed, what was tested, exact results, links to evidence, remaining limitations, and any action waiting for approval.

## State machine

Use these canonical states:

`NEW → PLANNED → READY → RUNNING → VERIFYING → DONE`

Alternative states: `WAITING_FOR_APPROVAL`, `BLOCKED`, `RETRY_WAIT`, `FAILED_NEEDS_REVIEW`, `CANCELLED`.

A task may be marked `DONE` only if all mandatory acceptance criteria pass and evidence is linked. If a tool call times out or the agent stops, resume from the last verified checkpoint; first inspect remote state before retrying any write.

## Retry and duplicate protection

- Every logical mutation gets a stable request/operation ID before its first attempt.
- A retry of the same logical mutation must reuse that ID.
- Before retrying a timed-out write, inspect whether the original operation succeeded.
- Never use an application-side check-then-insert as the sole concurrency guard.
- Reject reuse of one operation ID with materially different normalized input.
- Do not duplicate tasks, branches, PRs, comments, database rows, uploads, or notifications just because the response was ambiguous.
- Keep secrets, access tokens, original sensitive documents, and unnecessary personal data out of task logs and evidence summaries.

## Protected-action boundary

Without explicit user approval, the executor must not:
- modify production database schema, RLS, grants, functions, or production data;
- send official/legal/financial submissions or external messages on the user's behalf;
- merge a pull request or deploy/publish a release;
- delete or overwrite user documents or original evidence;
- provision paid infrastructure or incur charges;
- change account security, permissions, or access policy.

The agent can prepare a proposed change, test it in an isolated environment, and provide a clear approval request.

## Copy-ready execution packet template

```yaml
task_id: "<stable-id>"
outcome: "<observable completed result>"
repository: "<owner/repo or not applicable>"
branch: "<working branch or not applicable>"
starting_commit: "<sha or inspect-current>"
inputs:
  - "<verified path, file, record, or source>"
allowed_changes:
  - "<explicit allowed scope>"
must_not_change:
  - "<protected scope>"
steps:
  - id: inspect
    action: "<inspect current state and dependencies>"
    verify: "<evidence expected>"
  - id: implement
    action: "<smallest implementation step>"
    verify: "<postcondition>"
  - id: test
    action: "<targeted and regression tests>"
    verify: "<passing test output>"
  - id: quality_gate
    action: "<existing CI / full quality check>"
    verify: "<run ID and exact commit SHA>"
  - id: evidence
    action: "<update ledger and report>"
    verify: "<links and final state recorded>"
acceptance_criteria:
  - "<objective pass/fail condition>"
risk_class: "read_only | branch_local | staging_write | protected"
approval_required_for:
  - "<specific protected operation, or none>"
retry_policy:
  operation_id: "<stable identifier>"
  inspect_before_retry: true
outputs:
  - "<artifact, commit, PR, test run, or evidence link>"
resume:
  last_verified_checkpoint: "none"
  completed_steps: []
  blockers: []
```

## Definition of complete

The task is complete only when the requested artifact/result exists, acceptance criteria have been checked, relevant tests have passed, the exact commit/run has been identified, and the evidence report distinguishes verified facts from assumptions or untested limitations.
