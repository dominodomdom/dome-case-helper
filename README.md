# DOME OS — ÚŘAD

Administrative assistance workspace for Czech Labour Office agendas (benefits, housing, MOP,
appeals, deadlines). A signed-in, admin-approved user describes their situation; the server-side
DOME engine produces an **unverified** structured assessment (one most-important question, action
plan, needs, tracks) stored as immutable steps in the existing Supabase project.
DOME gives no legal conclusions and never files anything on the user's behalf.

## Stack

TanStack Start v1 (React 19, Vite 7, server functions), Tailwind v4, shadcn/ui, Supabase JS,
Vitest. Package manager: **Bun** (`bun.lock`).

## Quick start

```sh
bun install
cp .env.example .env      # fill in values; see docs/07_RELEASE_AND_DEPLOYMENT.md
bun run dev               # http://localhost:8080 (Lovable sandbox) / Vite default locally
```

## Quality gates

```sh
bunx tsgo --noEmit -p .   # type check (or: bunx tsc --noEmit)
bun run test              # Vitest, all mocked — no real DB / AI calls
bun run lint              # ESLint + Prettier
bun run build             # production build (nitro, Cloudflare target)
```

## Documentation

| Doc                                       | Topic                        |
| ----------------------------------------- | ---------------------------- |
| [01](docs/01_SYSTEM_ARCHITECTURE.md)      | System architecture          |
| [02](docs/02_DOMAIN_MODEL.md)             | Domain model (DomeCaseState) |
| [03](docs/03_DATABASE_AND_SUPABASE.md)    | Database and Supabase        |
| [04](docs/04_SECURITY_AND_RLS.md)         | Security and RLS             |
| [05](docs/05_AI_PROVIDER_ARCHITECTURE.md) | AI provider architecture     |
| [06](docs/06_TESTING_AND_QA.md)           | Testing and QA               |
| [07](docs/07_RELEASE_AND_DEPLOYMENT.md)   | Release and deployment       |
| [08](docs/08_OPERATIONAL_RUNBOOK.md)      | Operational runbook          |
| [09](docs/09_RELEASE_READINESS.md)        | Release readiness            |
| [10](docs/10_IMPLEMENTATION_REPORT.md)    | Implementation report        |

Also: `AGENTS.md` (binding architecture rules), `PHASE_1_ACCEPTANCE_REPORT.md`,
`PHASE_2_ARCHITECTURE_PROPOSAL.md`, `supabase/d2/*.sql` (prepared SQL — run manually only).

**Status: not production-ready.** See docs/09_RELEASE_READINESS.md.
