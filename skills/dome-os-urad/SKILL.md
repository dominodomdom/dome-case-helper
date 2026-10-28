---
name: dome-os-urad
description: Safely resume and execute the DOME OS ÚŘAD workflow using GitHub as the technical source of truth, Supabase as the operational source of truth, evidence-based task states, and explicit approval gates.
---

# DOME OS ÚŘAD — Workflow Skill

## Trigger

Use this workflow when the user says "Pokračuj", asks to continue DOME OS ÚŘAD, or asks to process the next administrative-system task.

## Canonical records

1. Read `docs/WORKFLOW_SPECIFICATION.md`.
2. Read `docs/WORKFLOW_TASKS.md`.
3. Read repository `AGENTS.md` and obey project-specific safety constraints.
4. Confirm the current branch, pull request, latest commit, and CI result before editing.
5. Treat GitHub as the technical source of truth and Supabase as the source of truth for live case data.

## Resume loop

For each run:

1. Reconcile the task ledger with actual repository/CI/live-system evidence.
2. Choose the highest-priority READY task with satisfied dependencies.
3. Mark the task IN_PROGRESS only when work actually begins.
4. Inspect the relevant code, policies, data shape, and callers before designing changes.
5. Prefer read-only checks and isolated tests. Never use production data for destructive or unauthorized exploit tests.
6. Implement the smallest reversible change on a dedicated branch; never change main directly.
7. Run targeted tests and the existing repository quality workflow.
8. Record the exact commit/PR, test command, result, environment, and unresolved limitations.
9. Mark VERIFIED only when evidence supports the claim; mark DONE only when all acceptance criteria are met.
10. Continue to the next safe task without asking the user to repeat the instruction.

## Approval gates

Stop and ask for explicit user approval before:
- Sending/submitting an official form, letter, email, or message.
- Applying a production migration or changing grants, RLS, authentication, or permissions.
- Performing destructive data operations or repairs.
- Deploying consequential production changes.
- Sharing personal case data or incurring a cost.

A proposal, draft, or test result is not permission to execute a production action. If blocked, state the exact missing dependency and present the smallest useful decision.

## Evidence requirements

Every completed task must have a durable evidence record:
- Task ID and acceptance criteria.
- Branch, commit SHA, PR URL, or migration name.
- Test commands and pass/fail result.
- Environment: mocked, local, staging, or production.
- Known limitations and next action.

Do not label mocked tests as integration tests. Do not claim a fix without a passing relevant test. Do not store tokens, passwords, API keys, or unnecessary personal data in the repository.

## Initial task priorities

1. SEC-001: Audit RPC authorization boundary for `urad_write_audit`; inspect grants/call sites and prepare a safe isolated test.
2. SEC-002: Review TRUNCATE grants on `urad_cases` and `urad_audit_log`; propose least-privilege changes, but do not apply without approval.
3. SEC-003: Map `urad_record_dome_assessment` overloads to app call sites and grants; preserve legacy data and compatibility.
4. SEC-004: Design server-side idempotency for retryable writes; test retries/races in a safe integration environment.
5. SEC-005: Design private storage and access controls for original evidence files.
6. SEC-006: Plan real signed-in E2E, two-user isolation, database concurrency, and document-upload verification.

## Definition of done

The overall workflow is not DONE until it can reliably resume from GitHub records, avoid duplicate actions, record verifiable evidence, pass relevant CI, and stop at approval gates. Documentation alone is not proof that the runtime automation is complete.
