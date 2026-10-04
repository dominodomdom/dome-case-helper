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
- Server DOME functions verify the user, urad_has_access and case ownership with a user-scoped client (publishable key + bearer, RLS applies) first; only then a server-only service_role client (URAD_SUPABASE_SERVICE_ROLE_KEY, read inside dome.server.ts) calls urad_record_dome_assessment — why: authenticated must not execute that RPC, and service_role is storage only, never authorization.
