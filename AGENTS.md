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
- Server DOME functions act as the signed-in user (publishable key + user bearer, RLS applies): verify user, urad_has_access and case ownership, then save via the 2-param SECURITY DEFINER RPC urad_record_dome_assessment(p_case_id, p_assessment), which re-checks everything — why: no service_role key anywhere; the database stays the only authority.
