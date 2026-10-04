# DOME OS — ÚŘAD · PHASE 2 ARCHITECTURE PROPOSAL
Documents / Evidence / Timeline / Deadlines / Risks

Stav: **NÁVRH K REVIEW.** Nic z tohoto dokumentu není implementováno. Žádné SQL, RLS, RPC ani změny `DomeCaseState v1.0`.
Datum: 2026-10-04

---

## 1. Current State (inventory)

### 1.1 Persistence
| Objekt | Skutečnost |
|---|---|
| `public.urad_cases` | 16 sloupců; `description` = původní popis uživatele (nikdy se nepřepisuje). |
| `public.urad_case_steps` | `id, case_id, user_id, kind, content, document_name, assessment (JSONB), created_at`. Kroky jsou append-only (immutable chronologie). |
| `kind` | `user_input` (text, včetně `[VOLBA UŽIVATELE:ID]`), `user_document` (jen AI shrnutí v `content` + `document_name`), `dome_assessment` (JSONB). |
| RPC zápisu | `urad_record_dome_assessment(p_case_id uuid, p_assessment jsonb)`, SECURITY DEFINER, sám znovu ověřuje přístup a vlastnictví. Volá se jen ze serverové funkce jako přihlášený uživatel; žádný service_role klíč. |
| RLS | Uživatel vidí jen své případy/kroky; `user_input`/`user_document` zapisuje klient přes RLS, `dome_assessment` jen RPC. |

### 1.2 Canonical state (`assessment.case_state`, `dome_case_schema_version: "1.0"`)
| Entita | Klíčové pole | Hooky pro Fázi 2 |
|---|---|---|
| `RealityItem` | `type` FACT/CLAIM/INTERPRETATION/VERIFICATION, `certainty`, `source` USER/DOCUMENT/OFFICIAL_SOURCE/SYSTEM/OTHER | `evidence_ids` (`<kind>:<ref>`), `related_need_ids`, `related_route_ids` |
| `PersonMap` | status, bydlení, příjem, zdroje, kontext, řízení, dokumenty (text) | — |
| `Need` | category, urgency, `amount`+`amount_status`+`amount_mention`, `deadline`+`deadline_status`+`deadline_mention`+`deadline_anchor` | `evidence_ids`, `route_ids`, `track_ids` |
| `Track` | SURVIVAL/ADMINISTRATIVE/HOUSING/INCOME/SUPPORT, deterministická aktivace | `need_ids` |
| `Action` | priority, status (vlastní uživatel), `status_reason`, `depends_on_action_ids` | `evidence_ids`, `deadline_id`, `route_id` |
| `Unknown` | question, why_it_matters, impact | `affects_route_ids` |
| `links` | `routes`, `evidence`, `deadlines` (label, `date: null`), `risks`, `gaps` — dnes jen pasivní seznamy | — |
| `metadata` | `version` (optimistic concurrency), `last_updated`, `legacy_normalized`, `signals` | — |

### 1.3 Současné zpracování dokumentů
- Soubor se pošle serverové funkci `analyzeDocument`, AI vytvoří textové shrnutí, uloží se jako krok `user_document` (`content` = shrnutí, `document_name` = název souboru). **Soubor se neukládá.**
- Neexistuje: hash souboru, druh dokumentu, datum dokumentu, datum doručení, odesílatel, ID dokumentu, deduplikace.
- Evidence Boundary dnes: FACT jen když odkaz `document:<název>` odpovídá názvu skutečně nahraného dokumentu. Ostatní druhy evidence mají hook `verifiableEvidence` (zatím prázdný).

---

## 2. Phase 1 Frozen Contracts
Tyto kontrakty Fáze 2 **nesmí** změnit (význam ani chování):
1. `DomeCaseState v1.0` pole a jejich význam; staré stavy se dál čtou přes `normalizeCaseState`.
2. CLAIM ≠ FACT; USER nikdy přímým zdrojem FACT; FACT vyžaduje `evidence_ids` ověřitelné serverem.
3. Amount Binding (MENTION → NEED → AMOUNT) a Deadline Binding (MENTION + ANCHOR), jinak `UNKNOWN`.
4. Stavy akcí vlastní uživatel; AI je nikdy nepřepíše; WAITING/BLOCKED mají důvod; závislosti deterministické.
5. Každý nový stav = nový immutable `dome_assessment` krok přes stávající RPC; `metadata.version` + kontrola konfliktu.
6. `validateCaseState` před každým uložením; neplatný stav se neuloží.
7. `user_goal` se nepřepisuje; tracky a potřeby nejsou nárok; žádné právní závěry.
8. Žádná změna DB/RLS/RPC bez výslovného souhlasu.

---

## 3. Phase 2 Domain Model

```text
SOURCE (dokument / oficiální zdroj / systémový záznam / jiný ověřitelný zdroj / uživatel)
   │
   ▼
DOCUMENT ──► EVIDENCE ──(EvidenceLink)──► RealityItem (FACT jen s Evidence; jinak CLAIM/INTERPRETATION)
                │                              │
                │                              ├──► Need / Action  (evidence_ids)
                ├──► TimelineEvent (data rozlišená podle druhu)
                ├──► Deadline (anchor + start + provenance) ──► Action.deadline_id / Need
                └──► Risk (evidence + dotčené needs/actions)
USER výrok ─────────► RealityItem CLAIM (nikdy přímo FACT)
```

Principy:
- **Jeden canonical model.** Nové entity jsou součástí `DomeCaseState` (aditivní verze, viz §6), ne paralelní objekt.
- **Provenance je povinná.** Každá entita odkazuje, odkud pochází (krok `urad_case_steps.id`, dokument, evidence).
- **Datum je vždy typované.** Žádné obecné „datum"; neznámé = `null` + `*_status: UNKNOWN`.
- **Deterministická ID** (jako ve Fázi 1): odvozená ze zdroje, ne náhodná → stabilní mezi re-assessmenty.

---

## 4. Entity Definitions

Společné typy:
- `Provenance = { step_id: string | null; origin: "USER" | "DOCUMENT" | "OFFICIAL_SOURCE" | "SYSTEM_RECORD" | "OTHER_VERIFIABLE_SOURCE" | "DOME_ANALYSIS"; quote: string | null }`
- `Confidence = "VERIFIED" | "LIKELY" | "POSSIBLE" | "UNKNOWN"` (VERIFIED jen s ověřitelnou evidencí)
- `TypedDate = { value: string | null /* ISO date */; status: "KNOWN" | "UNKNOWN"; provenance: Provenance | null }`

### 4.1 Document
| Pole | Význam |
|---|---|
| `id` | `doc_<step_id>` (canonical; 1 nahrání = 1 krok `user_document`) |
| `content_hash` | SHA-256 souboru spočítaný serverem při nahrání (soubor se dál neukládá) |
| `file_name`, `mime_type`, `size_bytes` | metadata nahrání |
| `doc_kind` | `DECISION | NOTICE | CALL_TO_ACTION | APPLICATION_COPY | CONTRACT | STATEMENT | OTHER | UNKNOWN` |
| `issuer` | odesílatel jen pokud je v dokumentu (citace), jinak `null` |
| `reference_number` | č. j. jen z dokumentu, jinak `null` |
| `document_date` | `TypedDate` — datum uvedené na dokumentu |
| `delivery_date` | `TypedDate` — **jen** z doručenky/obálky/datové schránky nebo výslovné odpovědi uživatele (pak `origin: USER`, confidence max. POSSIBLE) |
| `uploaded_at` | čas kroku (systémový záznam, nikoli datum dokumentu) |
| `extraction` | `{ summary, quotes: string[], method: "AI_READ_V1" }` — shrnutí ≠ evidence; evidence jsou jen doslovné citace |
| `duplicate_of` | `doc_<…>` při shodném `content_hash` |
| `lifecycle` | `RECEIVED → EXTRACTED → (SUPERSEDED | DUPLICATE)`; nikdy se nemaže, jen označí |
| Vztah ke Case Core | `PersonMap.relevant_documents` zůstává text; nový odkaz přes `Evidence.document_id` |

Co je FACT: že dokument s daným hashem byl nahrán (SYSTEM_RECORD). Co v dokumentu stojí doslovně → Evidence. Výklad obsahu → INTERPRETATION.

### 4.2 Evidence
| Pole | Význam |
|---|---|
| `id` | `<kind>:<ref>` — **stejný formát jako Fáze 1 `evidence_ids`** (např. `document:doc_123#q2`) |
| `kind` | `DOCUMENT | OFFICIAL_SOURCE | SYSTEM_RECORD | OTHER_VERIFIABLE_SOURCE` (USER zde nikdy) |
| `document_id` | u DOCUMENT povinné |
| `quote` | doslovná citace, ověřená serverem proti `extraction.quotes`/textu |
| `locator` | strana/odstavec, pokud známo |
| `verified_by` | `SERVER_QUOTE_MATCH | SOURCE_REGISTRY` — jak server ověřil |
| `confidence` | VERIFIED jen při úspěšném ověření; jinak entita nevznikne |
| `lifecycle` | `ACTIVE → WITHDRAWN` (např. duplicitní/neplatný dokument) |
| `created_at` | |

### 4.3 EvidenceLink
| Pole | Význam |
|---|---|
| `id` | `el_<evidence>__<target>` |
| `evidence_id` | |
| `target` | `{ type: "REALITY" | "NEED" | "ACTION" | "DEADLINE" | "RISK" | "TIMELINE_EVENT"; id }` |
| `relation` | `SUPPORTS | CONTRADICTS | MENTIONS` |
| `created_by` | `DOME_ANALYSIS | SERVER_RULE` |

Pravidlo: `RealityItem.type = FACT` ⇔ existuje aspoň jeden `SUPPORTS` link z ACTIVE Evidence. `CONTRADICTS` FACT nevytváří, ale generuje Unknown/Risk. Fázové `evidence_ids` na entitách zůstávají a musí být konzistentní s linky (validace).

### 4.4 TimelineEvent
| Pole | Význam |
|---|---|
| `id` | `te_<source>_<slug>` |
| `event_kind` | `DOCUMENT_ISSUED | DOCUMENT_DELIVERED | APPLICATION_SUBMITTED | DECISION_ISSUED | PAYMENT | HOUSING_EVENT | USER_REPORTED_EVENT | CASE_STEP_RECORDED | OTHER` |
| `occurred_at` | `TypedDate` — datum události |
| `reported_at` | kdy to uživatel/systém uvedl (čas kroku) |
| `recorded_at` | čas vytvoření záznamu |
| `provenance` | povinná |
| `confidence` | podle zdroje (USER max POSSIBLE) |
| `document_id`, `evidence_ids` | volitelné |
| Řazení | podle `occurred_at.value`; UNKNOWN události se řadí zvlášť („datum neznámé") podle `reported_at`, nikdy se jim datum nepřiřadí |

Nesmí se zaměnit: `document_date` ≠ `delivery_date` ≠ `occurred_at` ≠ `recorded_at` ≠ `reported_at`.

### 4.5 Deadline
Nahrazuje pasivní `links.deadlines`; `Need.deadline*` z Fáze 1 zůstávají a odkazují sem.
| Pole | Význam |
|---|---|
| `id` | `dl_<anchor>_<slug>` (stejný prefix jako dnešní hook) |
| `label` | |
| `anchor` | `{ type: NEED | ACTION | EVENT | PROCEDURE; ref }` — povinné (shodné s Fáze 1) |
| `target` | entita, které se lhůta týká (Need/Action/procedura) |
| `rule` | `{ text: citace, period: { amount: number, unit: "DAY"|"WORKING_DAY"|"MONTH" } | null }` — jen z citace |
| `start` | `TypedDate` — začátek běhu (typicky `delivery_date`), jinak UNKNOWN |
| `due_date` | `TypedDate` — **spočítá se jen** když `start` KNOWN a `period` známé; jinak UNKNOWN. Pravidla počítání (víkend/svátek) v Fázi 2 jen jako *orientační* s `confidence: POSSIBLE` a textem „ověřte" — bez právní interpretace |
| `provenance`, `evidence_ids` | povinná citace |
| `status` | `UNKNOWN_DATE | OPEN | DUE_SOON | PASSED | MET | NOT_APPLICABLE` (MET/NOT_APPLICABLE jen volbou uživatele) |
| `confidence` | |

### 4.6 Risk
| Pole | Význam |
|---|---|
| `id` | `risk_<slug>` |
| `description` | formulace rizika, ne právní závěr („Hrozí, že…, pokud…") |
| `category` | `MISSED_DEADLINE | LOSS_OF_HOUSING | NO_INCOME | MISSING_EVIDENCE | CONTRADICTION | SAFETY | OTHER` |
| `severity` | `CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN` |
| `probability` | `LIKELY | POSSIBLE | UNLIKELY | UNKNOWN` (bez čísel) |
| `basis` | `evidence_ids` + `reality_ids` (CLAIM smí být základem, pak probability max POSSIBLE) |
| `affects` | `need_ids`, `action_ids`, `deadline_ids` |
| `mitigation_action_ids` | odkazy na existující Actions (žádné nové „skryté" akce) |
| `status` | `OPEN | MITIGATED | ACCEPTED | OBSOLETE` (MITIGATED odvozeno deterministicky z DONE mitigačních akcí) |
| `provenance`, `created_at` | |

---

## 5. Evidence Provenance Model
```text
SOURCE ─► Document (hash, typed dates) ─► Evidence (doslovná citace, ověřená serverem)
       ─► EvidenceLink(SUPPORTS) ─► RealityItem FACT ─► Need / Action / Deadline / Risk
USER   ─► RealityItem CLAIM ─► (smí podpořit Need/Risk jako CLAIM, nikdy FACT)
```
Pravidla (server, ne model):
1. Evidence vznikne jen pokud server ověří citaci v extrakci dokumentu nebo odkaz v registru zdrojů.
2. Model smí Evidence jen *navrhnout* (citace + dokument); server rozhodne.
3. FACT bez ACTIVE `SUPPORTS` linku = nevalidní stav.
4. Stažení evidence (WITHDRAWN) → dotčené FACT se deterministicky vrátí na VERIFICATION.
5. Odpověď uživatele na Unknown je vždy CLAIM; i když potvrzuje dokument, FACT drží dokument, ne uživatel.
6. Dnes reálně jen DOCUMENT. OFFICIAL_SOURCE/SYSTEM_RECORD/OTHER zůstávají hook (registr ověřených zdrojů = samostatné rozhodnutí).

---

## 6. JSONB vs Relational Decision

| Kritérium | Documents | Evidence / Links | Timeline | Deadlines | Risks |
|---|---|---|---|---|---|
| Velikost / růst | malý (metadata, citace), roste s počtem nahrání | malý | střední | malý | malý |
| Indexovatelnost / dotazy napříč případy | **ano budoucí** (duplicity podle hashe, vyhledávání) | ne | ne | **ano budoucí** (připomínky, „blížící se lhůty" napříč případy) | ne |
| Auditovatelnost | immutable kroky stačí | stačí | stačí | stačí | stačí |
| Concurrency | celý stav → konflikt verze | dtto | dtto | dtto | dtto |
| Cross-case reuse | **možné** (stejný dokument u více případů) | ne | ne | ne | ne |
| Legal Route Engine | odkazy přes ID | odkazy přes ID | — | **ano** | odkazy |

**Rozhodnutí (navržené):**
- **Fáze 2 = JSONB.** Všechny nové entity jako aditivní kolekce v `assessment.case_state` (žádná nová tabulka, žádné nové RPC). Důvod: data jsou malá, per-case, auditovaná immutable kroky a Fáze 1 kontrakty zůstávají.
- **Vyžaduje vaše schválení: `DomeCaseState v1.1`** — aditivní minor verze (nová volitelná pole `documents, evidence, evidence_links, timeline, deadlines, risks`; význam v1.0 polí beze změny; `links.deadlines/evidence/risks` se čtou jako legacy a mapují do nových kolekcí). Toto je STOP CONDITION „změna DomeCaseState" → bez souhlasu se neimplementuje.
- **Relační kandidáti (před Fází 3, samostatný návrh SQL):** `Document` (hash, cross-case, deduplikace) a `Deadline` (dotazy napříč případy, připomínky). Pokud se tam přesunou, JSONB ponese jen ID + snapshot.
- Soubory se dál **neukládají** (Storage = pozdější vrstva, platí paměťové pravidlo).

---

## 7. Persistence Strategy
- Beze změny: každý nový stav = nový `dome_assessment` krok přes `urad_record_dome_assessment(p_case_id, p_assessment)`.
- `analyzeDocument` (server) navíc spočítá `content_hash`, vytáhne doslovné citace a strukturovaná metadata (doc_kind, issuer, document_date, lhůty jako citace). Uloží je **do `content` kroku `user_document` jako JSON blok** vedle shrnutí? → **Open Decision D3** (sloupec `content` je text; JSON v textu je proveditelný bez změny schématu, ale méně čistý).
- `buildCaseState` → nové kolekce se sestaví deterministicky z kroků + draftu modelu + předchozího stavu; ověření citací probíhá na serveru.
- Velikost: citace omezit (např. max 20 citací × 500 znaků na dokument).

## 8. Cross-Link Strategy
| Hook z Fáze 1 | Použití ve Fázi 2 |
|---|---|
| `RealityItem.evidence_ids`, `Need.evidence_ids`, `Action.evidence_ids` | ID Evidence (`<kind>:<ref>`), konzistentní s EvidenceLink |
| `Action.deadline_id` | ID Deadline |
| `Need.deadline_anchor` | zdroj pro Deadline.anchor (stejný kontrakt) |
| `related_route_ids`, `route_id`, `route_ids`, `affects_route_ids`, `links.routes/gaps` | **beze změny, prázdné** — Legal Route Engine až ve vlastní fázi |

Validace: každé ID musí existovat; žádné osiřelé linky; žádné cykly; Risk.mitigation jen existující Actions.

## 9. Migration Strategy
- Žádná DB migrace. Staré kroky se nemění.
- Čtení: `normalizeCaseState` rozpozná v1.0 → doplní prázdné nové kolekce; `links.deadlines` → Deadline se `start/due_date = UNKNOWN`, status `UNKNOWN_DATE`.
- Staré `user_document` kroky → Document s `content_hash: null`, `document_date/delivery_date: UNKNOWN`, `extraction.quotes: []` → **nevznikne z nich Evidence ani FACT**, dokud uživatel dokument znovu nenahraje (nebo nebude schválen re-extrakční mechanismus).
- Zakázáno: falešný FACT, fiktivní deadline/částka, změna stavů akcí, změna v1.0 polí.

## 10. Security / RLS Impact
- Při JSONB variantě: **žádný dopad** na schéma, RLS, GRANTy ani RPC.
- Server dál jedná jako přihlášený uživatel; žádný service_role.
- Citace z dokumentů jsou citlivá data → zůstávají jen v krocích vlastníka (stávající RLS). Předání pracovníkovi jen se souhlasem (stávající handoff pravidlo).
- Hash souboru neprozrazuje obsah, ale umožní detekovat duplicitu jen v rámci vlastních kroků.

## 11. Concurrency Model
- Stávající optimistic `metadata.version` + kontrola před zápisem; nové entity sdílejí jednu verzi stavu.
- Známé omezení (z Fáze 1, C1): kontrola není atomická. Fáze 2 zvyšuje počet zápisů (dokumenty, změny lhůt) → **doporučeno** schválit atomickou kontrolu verze v RPC (`p_expected_version`). = změna RPC → **Open Decision D2**.
- Uživatelské volby u Deadline (MET/NOT_APPLICABLE) a Risk (ACCEPTED) se chovají jako stavy akcí: AI je nepřepíše.

## 12. Test Plan (před implementací)
| Oblast | Testy |
|---|---|
| Evidence provenance | každá Evidence má document_id/registr + ověřenou citaci; navržená citace, která v dokumentu není → Evidence nevznikne |
| Document → Evidence | hash, duplicita (`duplicate_of`), WITHDRAWN propaguje |
| Evidence → FACT | FACT ⇔ ACTIVE SUPPORTS link; WITHDRAWN → VERIFICATION |
| CLAIM ≠ FACT | USER odpověď potvrzující dokument zůstává CLAIM; USER nikdy kind evidence |
| Timeline ordering | řazení podle occurred_at; UNKNOWN zvlášť; document_date ≠ delivery_date ≠ recorded_at |
| Unknown dates | žádné datum se nedopočítá ani nepřevezme z jiného pole |
| Deadline binding | anchor povinný; rule jen z citace; due_date jen při KNOWN start + period |
| Deadline UNKNOWN fallback | chybí doručení → UNKNOWN_DATE, ne odhad |
| Risk provenance | risk bez basis nevznikne; CLAIM-based → probability ≤ POSSIBLE; MITIGATED jen z DONE akcí |
| Cross-link integrity | osiřelé ID, cykly, Risk → neexistující Action → validace selže |
| Concurrency | re-assessment během změny Deadline/Risk zachová uživatelské volby; konflikt verze → 409 |
| Persistence | neplatný stav se neuloží; vše přes stávající RPC |
| Backward compatibility | v1.0 stavy, legacy assessments, staré user_document → čitelné, bez nových FACT/lhůt/částek; všech 47 testů Fáze 1 beze změny |
| UI | zobrazení dokumentů, časové osy a lhůt s „datum neznámé"; žádné právní formulace |

## 13. Architectural Risks
1. Růst JSONB: každá změna ukládá celý stav včetně citací → kroky rostou (mitigace: limity citací, relační Document před Fází 3).
2. Neatomická verze (D2) se s více zápisy projeví častěji.
3. AI extrakce dat dokumentu může číst chybně → mitigace: data jen jako citace + ověření shody serverem, jinak UNKNOWN.
4. Výpočet lhůt je blízko právní interpretaci → v Fázi 2 jen orientační, označené k ověření.
5. Název dokumentu zadává uživatel → identita dokumentu musí stát na hashi, ne na názvu (dnešní `document:<název>` je slabší; přechod na `document:doc_<step_id>`).
6. Staré dokumenty bez citací nemohou nést FACT → uživatel může vnímat „ztrátu" dřívějšího „Doloženo" (už od Fáze 1 hardeningu).

## 14. Open Decisions (vyžadují vaše rozhodnutí)
| # | Rozhodnutí | Doporučení |
|---|---|---|
| D1 | Schválit `DomeCaseState v1.1` jako aditivní rozšíření (nová volitelná pole, v1.0 význam beze změny)? | **Ano** — jinak Fázi 2 nelze implementovat bez paralelního modelu |
| D2 | Atomická kontrola verze v RPC (`p_expected_version`)? Změna RPC. | Ano, připravím SQL k vašemu review |
| D3 | Kde uložit strukturovanou extrakci dokumentu: JSON v `content` kroku `user_document` (bez změny schématu) vs. nový JSONB sloupec / relační tabulka? | JSON v `content` pro Fázi 2; relační Document před Fází 3 |
| D4 | Evidence ID dokumentu: přejít z `document:<název>` na `document:doc_<step_id>` (s mapováním starých)? | Ano |
| D5 | Počítat `due_date` orientačně (kalendářní/pracovní dny), nebo jen zobrazit pravidlo a start? | Orientačně s označením „ověřte" |
| D6 | Datum doručení od uživatele: povolit jako CLAIM (confidence POSSIBLE), z něhož se orientačně počítá lhůta? | Ano, viditelně označené jako uvedené uživatelem |
| D7 | Re-extrakce starých dokumentů (vyžaduje nové nahrání) — nabízet v UI? | Ano, jako dobrovolná akce |

## 15. Recommended Implementation Order
1. **Po schválení D1 (+ D3, D4):** typy a validace v1.1 + `normalizeCaseState` + testy backward compatibility (bez UI).
2. Document Engine: hash + strukturovaná extrakce v `analyzeDocument`, Document entity.
3. Evidence + EvidenceLink + napojení FACT na linky (rozšíření Evidence Boundary).
4. Timeline Engine (typovaná data, UNKNOWN řazení).
5. Deadline Engine (anchor z Fáze 1, start z delivery_date, orientační due_date dle D5).
6. Risk Engine (basis, affects, mitigace přes existující Actions).
7. UI v současném vizuálu (dokumenty, časová osa, lhůty, rizika — progresivně rozbalitelné).
8. D2 (atomická verze) — kdykoli po schválení SQL, ideálně před krokem 5.
9. Phase 2 acceptance gate; před Fází 3 review relačního modelu (Document, Deadline).

**Stav: čeká na review. Implementace nezačne bez rozhodnutí D1.**
