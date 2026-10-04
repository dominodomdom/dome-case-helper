# DOME OS — ÚŘAD · PHASE 1 ACCEPTANCE & HARDENING GATE v1.0

Datum: 2026-10-04 · Rozsah: audit + hardening Canonical Case Core v1.0. Fáze 2 nebyla zahájena.
Beze změny DB schématu, RLS, GRANTů a RPC. Žádný service_role klíč.

## Provedené hardening změny
| Oblast | Změna |
|---|---|
| CLAIM/FACT | FACT vyžaduje `document_name` odpovídající skutečně nahranému dokumentu; evidence `doc:<název>`. Jinak USER → CLAIM, ostatní → VERIFICATION. `OFFICIAL_SOURCE` se zatím degraduje (žádný oficiální zdroj není napojen). |
| Validace | `validateCaseState` nově odmítá: FACT bez evidence, VERIFIED mimo FACT, WAITING/BLOCKED bez důvodu, DONE bez času, neplatnou částku. |
| Need | Částka jen když číslo zaznělo v textu uživatele nebo dokumentu (jinak `null` = AMOUNT_UNKNOWN). Lhůta jen když její text/čísla zazněly (jinak `null` = DEADLINE_UNKNOWN). |
| Akce | Server (`applyActionStatus`) odmítne DONE/IN_PROGRESS u akce s nesplněnými závislostmi (dříve jen UI). |
| Concurrency | Nové AI vyhodnocení se staví nad *nejnovějším* uloženým stavem (přečteným po AI běhu) → uživatelské změny akcí provedené během analýzy se nepřepíší. Těsně před zápisem se verze znovu porovná; při rozdílu se zápis odmítne (409). `updateActionStatus` totéž před RPC. |
| Legacy | Starší pole `verified` (bez dohledatelné evidence) se normalizuje jako VERIFICATION/LIKELY, nikdy FACT. |

## A. PASSED
- `DomeCaseState` je jediný kanonický analytický stav; ukládá se jen jako `assessment.case_state`.
- `validateCaseState` běží před každým uložením (`assessCase`, `updateActionStatus`); chyba → výjimka → nic se neuloží.
- CLAIM nelze povýšit na FACT bez evidence; uživatelský vstup nikdy nedostane VERIFIED (testy + validace).
- Uživatelské stavy akcí (všechny 4 ne-TODO) přežijí nové AI vyhodnocení, i když model akci vynechá.
- WAITING/BLOCKED vyžadují důvod — UI, `applyActionStatus` i validace.
- Závislosti: deterministické `isActionBlocked`, vynucené na serveru i v UI; cykly a neznámé závislosti odmítá validace.
- Optimistic concurrency přes `metadata.version` (`expectedVersion`), konflikt → bezpečné odmítnutí s hláškou.
- Persistence jen přes `urad_record_dome_assessment(p_case_id, p_assessment)` ze serverových funkcí jako přihlášený uživatel; RPC se z prohlížeče nevolá. Každý stav = nový immutable step → chronologie zachována.
- Klientský bundle neobsahuje service_role ani secret klíč (nalezen jen řetězec prefixu v knihovně supabase-js).
- Tracky: pevné pořadí SURVIVAL/ADMINISTRATIVE/HOUSING/INCOME/SUPPORT, aktivace deterministická z needs/actions; UI ani data je nepopisují jako nárok.
- Need: AMOUNT_UNKNOWN/DEADLINE_UNKNOWN fungují, vymyšlená částka/lhůta se zahodí; need ≠ nárok (UI text neobsahuje „nárok").
- Legacy normalizace (dome-core 1.0, 2.0, cizí verze case_state) je deterministická a nevytváří FACT.
- Testy: 44/44 (z toho 7 nových hardening testů stavu, 5 UI smoke testů). Type check OK. Produkční build OK.

## B. FAILED
- Žádný test ani kontrola neselhala.

## C. WARNINGS
1. **Version check není atomický.** Kontrola verze a zápis jsou dva kroky (čtení → RPC). Zbývá okno v řádu milisekund, kdy dva souběžné zápisy mohou oba projít a vzniknou dva stavy se stejnou verzí. Žádná data se neztratí (oba kroky zůstanou v chronologii), ale „poslední" vyhraje. Plná atomicita vyžaduje změnu RPC (parametr `p_expected_version` a kontrolu v DB) — **jen s vaším souhlasem**.
2. Závislá akce může zůstat DONE, i když uživatel později vrátí její předchůdce na TODO (povoleno záměrně, nevaliduje se zpětně).
3. Ukotvení částky/lhůty je textové: částka, která zazněla v jiném kontextu (např. „0 Kč" vs. jiné číslo stejné hodnoty), se může přiřadit k jiné potřebě.
4. Model může dál přeformulovat `user_goal`; původní popis případu se nepřepisuje (zůstává v `urad_cases`).
5. UI smoke testy běží v testovacím prostředí s napodobeným serverovým voláním — **ne** ve skutečném prohlížeči s přihlášeným účtem. Reálné uložení přes RPC nebylo spuštěno automaticky.

## D. ARCHITECTURAL RISKS
- **JSONB CASE STATE je canonical persistence mechanismus Fáze 1.** Tím není rozhodnuto, že všechny budoucí doménové entity DOME OS (Evidence, Deadline, Legal Route, Risk…) musí navždy zůstat v jednom JSONB objektu.
- **Před Fází 3 je nutné znovu provést review datového modelu** (dotazování napříč případy, indexy, atomické verze, velikost objektu).
- Každá změna akce ukládá celý stav → růst `urad_case_steps` s počtem kliků.
- Bezpečnost FACT závisí na tom, že název dokumentu v chronologii je důvěryhodný (zadává ho uživatel při nahrání) — FACT znamená „doloženo nahraným dokumentem", ne „úředně ověřeno".

## E. CONCURRENCY STATUS
Optimistic (`metadata.version`), kontrola na serveru před každým zápisem, AI běh nepřepíše novější uživatelské změny, konflikt → 409 a hláška. **Stav: funkční, ne atomický** (viz C1).

## F. DATA INTEGRITY STATUS
CLAIM/FACT, VERIFIED, reason, závislosti, cykly, enumy, vazby, částky a lhůty jsou vynuceny serverem a validací. Neplatný stav se neuloží. **Stav: OK.**

## G. UI SMOKE TEST STATUS
CaseCorePanel: vykreslení plánu po prioritách, potřeb, reality, otázek; přechody IN_PROGRESS/DONE; dialogy důvodu WAITING/BLOCKED (Uložit zakázáno bez důvodu); dependency lock; zobrazení konfliktu verze. 5/5 v testovacím prostředí. Vizuál beze změny. **Neověřeno v živém prohlížeči s účtem.**

## H. BACKWARD COMPATIBILITY STATUS
Starší assessments se čtou přes `normalizeCaseState` (označeny `legacy_normalized`, jejich akce se do nového stavu nepřenáší jako uživatelské volby). Nové pole `document_name` je volitelné. Starší kroky v DB se nemění. **Stav: OK.**

## I. RECOMMENDATION
Přijmout Fázi 1. Před nebo během Fáze 2 se rozhodnout o atomické kontrole verze v RPC (C1) a provést ruční test v účtu (vytvořit případ, Hotovo, Čekám s důvodem, obnovit stránku).

READY_WITH_WARNINGS
