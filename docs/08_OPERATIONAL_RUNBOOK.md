# 08 — Operational runbook

| Symptom                                 | Likely cause                                    | Safe steps                                                           |
| --------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `bun install` fails                     | Bun missing/old, network                        | Install Bun ≥1.1; keep `bun.lock`; never delete it to "fix"          |
| Type errors                             | edited `routeTree.gen.ts` or missing route file | never edit the generated file; create the referenced route           |
| Test failure                            | real regression                                 | run single file `bunx vitest run src/test/<file>`; do not skip tests |
| Build fails                             | import of server module into client             | server-only code stays in `*.server.ts` / dynamic import in handlers |
| Lint errors                             | formatting                                      | `bunx eslint --fix .`                                                |
| "Chybí veřejný klíč…"                   | publishable key empty                           | set `VITE_SUPABASE_PUBLISHABLE_KEY`                                  |
| Redirect to `/cekani`                   | user not approved                               | admin approves in DB (`urad_approve_user`)                           |
| "Přihlášení vypršelo" (401)             | expired session                                 | sign out / in                                                        |
| "AI není nakonfigurována."              | no `LOVABLE_API_KEY`                            | set server secret                                                    |
| "Došly AI kredity…" (402)               | gateway credits                                 | top up workspace                                                     |
| "Stav případu se mezitím změnil…" (409) | concurrent edit                                 | reload page; nothing was saved                                       |
| `42501 permission denied`               | missing GRANT / RLS                             | inspect with `01_preflight_audit.sql`; do not weaken RLS             |
| `DEPRECATED_USE_EXPECTED_VERSION`       | old app build calling 2-param RPC               | deploy current build                                                 |

Diagnostics: browser console + network tab; server logs (`urad_record_dome_assessment` and
`AI gateway <status>` lines). Never paste tokens or keys into logs or tickets.
