<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Backend is the user's EXISTING external Supabase project; never enable Lovable Cloud or create tables — the app must not own its data model.
- All table/column/RPC names live in src/lib/supabase-config.ts SCHEMA and are accessed only via src/lib/urad-api.ts; access is decided solely by backend RPC urad_my_access / urad_has_access, never client state.
- Signed-in + approved pages live under src/routes/_chraneno/ (ssr:false gate) — session is in localStorage so the server cannot gate.
- DOME assessment je serverový výstup. Klient nikdy nesmí zapisovat dome_assessment přímo. Každý assessment musí být uložen jako immutable case step (přes RPC urad_record_dome_assessment ze src/lib/dome.functions.ts). DOME nesmí označit hypotézu jako fakt bez ověřeného podkladu.
- Server DOME functions act as the signed-in user (publishable key + user bearer, RLS applies): verify user, urad_has_access and case ownership, then save via the atomic 3-param SECURITY DEFINER RPC urad_record_dome_assessment(p_case_id, p_assessment, p_expected_version) (row lock on urad_cases, CONCURRENCY_CONFLICT → HTTP 409, initial expected version 0), which re-checks everything — why: no service_role key anywhere; the database stays the only authority.
- DOME analysis is domain-agnostic in src/lib/dome-core.ts (principles, structured schema, server-side invariants); domains plug in only via DOMAIN_RESOLVERS — why: FINANCE/HOUSING/LAW/HEALTH/BUSINESS reuse the same intervention model. Concrete places/navigation require a verified external data source; until then the server forces target null and navigation_available=false.
- Human handoff state (handoff_state) is derived deterministically from "[VOLBA UŽIVATELE:ID]" user_input steps by deriveHandoffState in src/lib/dome-core.ts, identically on server and client — why: the model can never skip a step, decline is respected, and SAFETY cannot be switched off. SUPPORT_TARGET_FOUND/ROUTE_READY are reachable only from a verified external source.
- Real-world support (need detection, service matching, transport, HumanHandoff object) lives in src/lib/support-engine.ts and runs server-side after enforceAssessmentInvariants; its output is stored inside the assessment JSONB — why: no schema change, and concrete services/routes enter only through SupportServiceRegistry/TransportProvider implementations backed by a verified source (defaults return nothing).
- Canonical case model is DomeCaseState in src/lib/case-state.ts (schema-versioned), stored as assessment.case_state in urad_case_steps; built and validated server-side, user action-status changes go through updateActionStatus (server fn, optimistic version check) and are saved as a new immutable assessment step — why: no new tables, full history, invalid state is never persisted. Legacy assessments are read only through normalizeCaseState. Future engines plug in via the CaseEngine interface.
- Phase 1 persists DomeCaseState as JSONB in urad_case_steps; this is not a decision for all future entities — re-review the data model before Phase 3. Why: keep the schema decision reversible.

- AI calls go only through the AiProvider interface in src/lib/ai-provider.server.ts (default Lovable AI Gateway, selected by server env AI_PROVIDER) — why: domain logic must not depend on a single vendor.
