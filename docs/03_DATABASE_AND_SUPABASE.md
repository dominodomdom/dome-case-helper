# 03 — Database and Supabase

## Connection
Existing external Supabase project (not Lovable Cloud). URL + publishable key from
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, falling back to defaults in
`src/lib/supabase-config.ts`. No service_role key anywhere.

## Used objects (from code)
| Object | Used by | Operation |
| --- | --- | --- |
| `urad_user_access` | client | read own row (fallback) |
| `urad_cases` | client + server | select own, insert (with `module_id` of active ÚŘAD module) |
| `urad_case_steps` | client: insert `user_input`; server: insert `user_document`, select | |
| RPC `urad_my_access`, `urad_has_access` | client + server | access decision |
| RPC `urad_record_dome_assessment(uuid, jsonb, integer)` | server only | save assessment (atomic version check) |

Admin RPCs (`urad_approve_user` etc.) exist in the DB but are not called by the app.

## Saving
Only `recordAssessment` (`dome.server.ts`) writes `dome_assessment`, via the 3-param RPC, acting as
the user (publishable key + user bearer). Initial expected version 0; new = expected + 1.
`CONCURRENCY_CONFLICT` → HTTP 409.

## Known assumptions — UNVERIFIED against the live DB
- RLS on `urad_case_steps` prevents a client from inserting `kind = 'dome_assessment'` directly
  (run `supabase/d2/01_preflight_audit.sql`).
- The RPC really locks `urad_cases` FOR UPDATE and serialises concurrent writers
  (run `supabase/d2/04_concurrency_test.sql`).
- 2-param RPC still exists until `supabase/d2/03_deprecate_2param.sql` is run.
- RLS limits `urad_cases`/`urad_case_steps` reads to the owner.
Observed live (anonymous): RPC calls and step reads → 42501.
