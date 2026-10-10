# 01 — System architecture

## Purpose
Workspace that helps a person handle a Labour Office situation: keeps their own words, builds an
unverified working picture, asks one most-important question, keeps an action plan, and (in
crisis) prepares a human handoff — never a legal decision, never an automatic application.

## Layers
| Layer | Files | Responsibility |
| --- | --- | --- |
| Routes / UI | `src/routes/*`, `src/components/dome/*` | Landing, auth, waiting page, protected `/_chraneno/*` (ssr:false), workspace |
| Client data API | `src/lib/urad-api.ts`, `src/lib/supabase.ts`, `src/lib/supabase-config.ts` | Browser Supabase client (publishable key, RLS), all table/RPC names in `SCHEMA` |
| Server functions | `src/lib/dome.functions.ts` | `assessCase`, `analyzeDocument`, `prepareHandoff`, `updateActionStatus` (createServerFn) |
| Server internals | `src/lib/dome.server.ts` | User-scoped Supabase client, `verifyUser`, `recordAssessment`, AI orchestration |
| AI transport | `src/lib/ai-provider.server.ts` | `AiProvider` interface, Lovable AI Gateway implementation |
| Domain core | `src/lib/dome-core.ts`, `case-state.ts`, `support-engine.ts` | Prompt/schema, invariants, canonical `DomeCaseState`, handoff derivation, support engine |
| Database | external Supabase project | Source of truth; RLS + SECURITY DEFINER RPCs |

## Data flow
```text
browser --(publishable key + user session)--> Supabase: read cases/steps, insert user_input
browser --(server fn, user access token in body)--> server:
   verifyUser -> urad_has_access -> ownership -> load steps -> AI -> invariants
   -> buildCaseState/validate -> RPC urad_record_dome_assessment(case, assessment, expected_version)
```

## Auth / authz
Supabase Auth (email). Access is decided only by RPC `urad_my_access` / `urad_has_access`; the
protected layout redirects pending/rejected/suspended users to `/cekani`. Server functions repeat
the check on every call.

## Lovable dependencies
- Build: `@lovable.dev/vite-tanstack-config` (public npm package).
- Runtime: Lovable AI Gateway (`LOVABLE_API_KEY`) for all AI features.
- Hosting: Lovable preview/publish (Cloudflare Worker target). Other hosts UNVERIFIED.

## Current limits
No verified social-service registry or transport provider (concrete places/routes are never
shown). Documents are read, not stored. Phase 2 (evidence/timeline/deadline/risk engines) not
implemented.
