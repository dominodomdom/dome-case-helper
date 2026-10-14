# 06 — Testing and QA

## Commands
| Check | Command |
| --- | --- |
| Type check | `bunx tsgo --noEmit -p .` (or `bunx tsc --noEmit`) |
| Tests | `bun run test` |
| Lint | `bun run lint` (auto-fix: `bunx eslint --fix .`) |
| Build | `bun run build` |

## Suites (69 tests, all mocked)
| File | Covers |
| --- | --- |
| `case-state.test.ts` and `case-state-v1-1.test.ts` | DomeCaseState build/validate, CLAIM≠FACT, evidence boundary, amount/deadline binding, legacy normalisation, preserved DONE/WAITING/BLOCKED |
| `d2-concurrency.test.ts` | `recordAssessment`: 3-param call, version 0→1, 2 and 10 concurrent writers (in-memory lock fake), stale → 409, invalid versions, unauthorised/foreign case |
| `ai-provider.test.ts` | provider success, missing key, empty input, HTTP error mapping, refusal/failed/empty stream, unknown provider |
| `support-engine.test.ts` | need detection, service matching, no fabricated services |
| `dome-handoff.test.tsx` | handoff state derivation and UI |
| `case-core-ui.test.tsx` | action plan UI transitions, reason dialogs, dependency lock |
| `app-routing.test.tsx` | route tree smoke |

## Mock vs integration
No test touches the real Supabase or the AI gateway. Concurrency tests prove application logic
against a faithful fake RPC, **not** database atomicity.

## Not verified (manual procedures)
1. Real DB concurrency: run `supabase/d2/04_concurrency_test.sql` in the SQL editor.
2. RLS audit: run `supabase/d2/01_preflight_audit.sql`, confirm no client INSERT path for `dome_assessment`.
3. Signed-in E2E: create case → assessment → mark actions DONE/WAITING/BLOCKED → reload →
   re-login → new assessment keeps states → two tabs, change in both → second shows conflict message.
4. Document upload with real PDF/image.
