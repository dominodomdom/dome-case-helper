# 02 — Domain model

## Stored entities (existing DB, derived from code only)
- `urad_cases` — 16 columns listed in `SCHEMA.cases.columns` (`id, user_id, module_id, case_number,
  title, description, status, priority, reality_status, current_gap, currency, opened_at,
  resolved_at, closed_at, created_at, updated_at`). `description` = user's original words, never
  overwritten.
- `urad_case_steps` — immutable chronology: `id, case_id, user_id, kind, content, document_name,
  assessment (jsonb), created_at`. `kind` ∈ `user_input | user_document | dome_assessment`.

## assessment JSONB
`DomeAssessment` (typed in `urad-api.ts`): user_goal, hypothesis (always `unverified`),
current_question, stated_by_user / verified / to_verify / missing_information, intervention_level,
immediate_need_gap, now/then actions, support output, and `case_state`.

## DomeCaseState v1.0 (`src/lib/case-state.ts`, frozen baseline)
`case_id, status, user_goal, reality[], person, needs[], tracks[], actions[], unknowns[],
metadata{ dome_case_schema_version "1.0", version, legacy_normalized, … }`.
- RealityItem: FACT / CLAIM / INTERPRETATION / VERIFICATION; FACT requires verifiable evidence
  (DOCUMENT, OFFICIAL_SOURCE, SYSTEM_RECORD, OTHER_VERIFIABLE_SOURCE). USER is never a FACT source.
- Need: amount / deadline only with explicit mention binding, otherwise `null` + `UNKNOWN`.
- Tracks: SURVIVAL, ADMINISTRATIVE, HOUSING, INCOME, SUPPORT.
- Action: horizon NOW…LATER, status TODO / IN_PROGRESS / WAITING / BLOCKED / DONE
  (WAITING/BLOCKED need a reason), dependencies validated (no cycles).

## Validation
`validateCaseState` runs server-side before every save; invalid state is never persisted.
Legacy assessments are read via `normalizeCaseState` (version 0, no fake facts).

## Stored vs derived
Stored: steps and `assessment.case_state`. Derived on read (identically server/client):
`handoff_state` from `[VOLBA UŽIVATELE:ID]` user_input steps (`deriveHandoffState`).
Source of truth = the latest `dome_assessment` step; history = all steps.
