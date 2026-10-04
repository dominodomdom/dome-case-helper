# DOME — první funkční smyčka nad skutečným případem

Vzhled `/pripady/:id` zůstává stejný. Mění se jen to, co se uvnitř pracovního prostoru děje.

## Smyčka

```text
otevření případu ─► načíst title + description z urad_cases
                    + dosavadní kroky DOME z databáze
        │
        ▼
DOME vyhodnotí (AI na serveru aplikace)
        │  vrátí strukturovaný stav:
        │   - hypotéza (vždy označená jako neověřená)
        │   - co uživatel uvedl
        │   - co je potřeba ověřit
        │   - co chybí zjistit
        │   - JEDNA nejdůležitější otázka / požadovaný dokument
        │   - navazující krok (jen pokud z ověřených údajů vyplývá)
        ▼
uživatel odpoví textem nebo nahraje dokument (foto/PDF)
        │
        └──► uložit krok ─► znovu vyhodnotit celý případ
```

Pravidla v zadání pro AI: vždy jen jedna otázka; nic nevydávat za fakt bez opory v odpovědi nebo dokumentu; nikdy neprohlásit případ za vyřešený bez ověřených údajů; žádné právní závěry ani podávání žádostí.

## Zobrazení (stávající vzhled)

- Nahoře: „Pracovní hypotéza" se štítkem *neověřeno*.
- Panel stavu: Uvedeno / K ověření / Chybí zjistit / Potřebné dokumenty.
- Výrazně: jedna aktuální otázka DOME + pole odpovědi a nahrání souboru.
- Pod tím: chronologie dosavadních kroků.

## Ukládání — vyžaduje váš souhlas se změnou databáze

Navrhuji jednu novou tabulku. **Nespustím ji sám** — po schválení vám dám SQL ke spuštění ve vašem Supabase.

```sql
create table public.urad_case_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.urad_cases(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('user_input','user_document','dome_assessment')),
  content text,                 -- text odpovědi uživatele
  document_name text,           -- jen název, soubor se neukládá
  assessment jsonb,             -- strukturovaný stav DOME
  created_at timestamptz not null default now()
);
grant select, insert on public.urad_case_steps to authenticated;
alter table public.urad_case_steps enable row level security;
create policy "own steps read" on public.urad_case_steps for select to authenticated
  using (user_id = auth.uid() and public.urad_has_access()
         and exists (select 1 from public.urad_cases c where c.id = case_id and c.user_id = auth.uid()));
create policy "own steps insert" on public.urad_case_steps for insert to authenticated
  with check (user_id = auth.uid() and public.urad_has_access()
         and exists (select 1 from public.urad_cases c where c.id = case_id and c.user_id = auth.uid()));
```

Soubory: obsah se pošle k analýze a výsledek (co v dokumentu DOME našel) se uloží do kroku; samotný soubor se neukládá (úložiště by byla další změna).

## Technické detaily

- Serverová funkce `src/lib/dome.functions.ts`: přijme `caseId` + přístupový token uživatele, ověří uživatele proti vašemu Supabase (publishable klíč + token, RLS platí), zkontroluje `urad_has_access()`, načte případ a kroky, zavolá Lovable AI (`openai/gpt-6-astra`, Responses API, strukturovaný výstup podle schématu), uloží krok `dome_assessment`.
- Názvy nové tabulky přidány do `SCHEMA` v `supabase-config.ts`; přístup jen přes `urad-api.ts`.
- `DomeWorkspace.tsx` přepojen na smyčku; ostatní stránky beze změny.
- Chyby AI (kredity, limity) se zobrazí srozumitelně, bez automatického opakování.
- Do `AGENTS.md` zapsat pravidlo: vyhodnocení DOME probíhá jen na serveru a výsledek je vždy uložen jako krok případu.
