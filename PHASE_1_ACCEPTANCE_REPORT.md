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

READY_WITH_WARNINGS (gate v1.0 — nahrazeno finálním stavem v sekci O)

---

# PHASE 1 FINAL ACCEPTANCE PATCH

## J. FINAL PATCHES
- Bez změny DB schématu, RLS, RPC kontraktu a autorizačního modelu. Fáze 2 (Evidence/Timeline/Deadline Engine) neimplementována — jen boundary hooks.
- `case-state.ts`: `EVIDENCE_KINDS`, `VerifiableEvidence`, `evidenceId`, vstup `verifiableEvidence` (hook pro Evidence Engine, zatím prázdný); `Need.amount_status/amount_mention`, `Need.deadline_status/deadline_mention/deadline_anchor`; `DEADLINE_ANCHORS`; validace vazeb; `normalizeNeed` pro dříve uložené stavy 1.0.
- `dome-core.ts`: strukturované schéma a instrukce pro `evidence`, `amount_mention`, `deadline_mention`, `deadline_anchor`.
- Původní textová heuristika („číslo se v textu vyskytuje") odstraněna.
- Kontroly v tomto kole: type check OK, 47/47 automatických testů OK (z toho 4 nové: amount binding, deadline binding, evidence boundary, legacy normalizace vazeb), produkční build OK.

## K. LIVE ACCOUNT TEST
**NEPROVEDEN.** Kroky A–J nebyly spuštěny.
Důvod: aplikace používá vaše vlastní externí přihlášení; testovací prostředí nemá žádnou přihlášenou relaci ani schválený účet a nemohu si ho samo vytvořit (registrace vyžaduje potvrzení e-mailem a schválení administrátorem). Nic z kroků A–J proto nemohu vykázat jako prošlé.
Potřebné ruční kroky (ve schváleném účtu):
A. vytvořit případ · B. akci → Hotovo · C. akci → Čekám + důvod · D. akci → Nejde to + důvod · E. obnovit stránku · F. odhlásit/přihlásit · G. ověřit, že B–D zůstaly · H. spustit nové vyhodnocení · I. ověřit, že B–D zůstaly i po něm · J. otevřít případ ve dvou záložkách, v jedné změnit akci, ve druhé změnit jinou → druhá musí zobrazit „Stav případu se mezitím změnil. Obnovte stránku."
Automaticky ověřeno jen bez reálného ukládání: zachování stavů akcí při novém vyhodnocení (testy logiky), dialogy důvodu, zámek závislostí a zobrazení konfliktu verze (UI testy s napodobeným serverem).

## L. EVIDENCE BOUNDARY
FACT = vyžaduje ověřitelnou evidenci: `DOCUMENT | OFFICIAL_SOURCE | SYSTEM_RECORD | OTHER_VERIFIABLE_SOURCE`. Odkaz od modelu se přijme jen, pokud ho server zná v seznamu ověřitelných podkladů (nahrané dokumenty + hook `verifiableEvidence`). Evidence id `<druh>:<odkaz>`. Výrok uživatele (source USER) nikdy nedostane FACT, ani s evidencí. Neověřitelný odkaz → VERIFICATION. Validace odmítne FACT bez evidence nebo s neznámým druhem. Dnes je reálně dostupný jen DOCUMENT; ostatní druhy čekají na Evidence Engine. **Splněno.**

## M. AMOUNT BINDING
Částka platí jen s vazbou MENTION → NEED → AMOUNT: doslovná citace (`amount_mention`) musí existovat ve výrocích uživatele nebo v obsahu dokumentu, obsahovat právě jedno číslo a to musí odpovídat částce; stejná citace u více potřeb = nejednoznačné. Jinak `amount = null`, `amount_status = UNKNOWN`. Dříve uložené částky bez citace se při načtení mění na UNKNOWN. **Splněno.**

## N. DEADLINE BINDING
Lhůta platí jen s citací (`deadline_mention`) obsahující lhůtu a s vazbou `deadline_anchor` na NEED (jen tuto potřebu), ACTION (existující akci), EVENT nebo PROCEDURE (pojmenované). Sdílená citace, chybějící/neznámá vazba → `deadline = null`, `deadline_status = UNKNOWN`. Datum se nedopočítává (Deadline Engine = Fáze 2). **Splněno.**

## O. FINAL ACCEPTANCE
Body 1–3 splněny a ověřeny automatickými testy. Povinný live smoke test (bod 6) nebyl proveden, takže podmínka pro READY_FOR_PHASE_2 není splněna a Fáze 2 se nespouští. Po úspěšném provedení kroků K.A–K.J lze stav změnit na READY_FOR_PHASE_2.

BLOCKED

---

# D2 CONCURRENCY HARDENING (samostatný krok před Fází 2)

## Pre-flight audit — kód aplikace (provedeno)
- Jediná write path pro `dome_assessment`: `recordAssessment` v `src/lib/dome.server.ts`, volaná ze 2 míst v `src/lib/dome.functions.ts`: `assessCase` (nové vyhodnocení) a `updateActionStatus` (změna stavu akce). Obě volají dnes **2-param** RPC.
- Klientský kód zapisuje do `urad_case_steps` jen `kind: "user_input"` (`urad-api.ts`); dokumenty zapisuje server jako `user_document`. Žádný kód nevkládá `dome_assessment` přímo.
- `recordAssessment` dnes **nepředává** `expectedVersion`; verze se kontroluje jen v aplikaci (neatomicky).
- Počáteční verze: první stav má `metadata.version = 1`, tedy očekávaná verze `0` — kompatibilní s návrhem. Legacy assessments bez `case_state` = verze 0.

## Pre-flight audit — skutečné DB (NEPROVEDENO)
Nemám přístup k SQL vašeho Supabase projektu (jen veřejný klíč, ten nečte definice funkcí, policies ani granty). Nelze tedy ověřit: definici a overloady RPC, RLS policies, granty, ani to, zda RLS policy pro INSERT do `urad_case_steps` nepovolí klientovi vložit `kind = 'dome_assessment'` přímo přes API. Připraveno ke spuštění: `supabase/d2/01_preflight_audit.sql`.

## Připravené SQL (NEAPLIKOVÁNO)
- `supabase/d2/02_migration_atomic_rpc.sql` — 3-param RPC `(uuid, jsonb, integer)`, `SELECT … FOR UPDATE` na řádku `urad_cases`, povinná `p_expected_version` (NULL odmítnuta), `CONCURRENCY_CONFLICT` (P0001), kontrola `auth.uid()`, `urad_has_access()`, vlastnictví, `hypothesis.status = 'unverified'`, nová verze = očekávaná + 1, jen INSERT.
- `supabase/d2/03_deprecate_2param.sql` — stará funkce explicitně selže; spustit až po nasazení kódu.
- `supabase/d2/04_concurrency_test.sql` — test dvou souběžných transakcí + negativní testy.

## Kód aplikace
Beze změny. Přepnutí `recordAssessment` na 3-param variantu by před aplikací SQL rozbilo ukládání, proto čeká na potvrzení migrace.

## Gate status
BLOCKED
