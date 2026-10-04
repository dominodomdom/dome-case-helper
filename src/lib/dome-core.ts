/**
 * DOME core — doménově nezávislá vrstva HUMAN HANDOFF / REAL-WORLD INTERVENTION v2.0:
 * USER GOAL FIRST + REALITY + IMMEDIATE NEED GAP + SUPPORT PATH + TARGET + ROUTE + HANDOFF + CONTINUATION.
 * Doménu dodává jen resolver. Čistý modul bez tajemství — sdílí ho server (prompt, schéma, invarianty) i UI (typy).
 */

import { ACTION_PRIORITIES, ACTION_TYPES, NEED_CATEGORIES, NEED_URGENCIES, REALITY_SOURCES, REALITY_TYPES, TRACK_TYPES, UNKNOWN_IMPACTS } from "./case-state";

export const INTERVENTION_LEVELS = ["SELF", "OPTIONS", "CONNECT", "ACTIVE_HANDOFF", "SAFETY_HANDOFF"] as const;
export type InterventionLevel = (typeof INTERVENTION_LEVELS)[number];
export const URGENCY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export const HANDOFF_STATES = [
  "NONE",
  "IMMEDIATE_NEED_DETECTED",
  "SUPPORT_TARGET_FOUND",
  "ROUTE_READY",
  "USER_EN_ROUTE",
  "HANDOFF_READY",
  "HUMAN_CONNECTED",
  "HANDOFF_DECLINED",
  "HANDOFF_COMPLETED",
] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];

export type DomainId = "urad" | "finance" | "housing" | "law" | "health" | "business" | "personal";

/* ---------- Volby uživatele (ukládají se jako user_input kroky) ---------- */

export const CHOICES = {
  GO: "Chci tam jít.",
  OTHER: "Ukaž mi jiné možnosti pomoci.",
  DECLINE: "Teď to nechci — odmítl/a jsem propojení s podporou.",
  SELF: "Potřebuji to vyřešit sám/sama — odmítl/a jsem propojení s podporou.",
  CONNECT: "Chci propojit s člověkem nebo organizací, která se tomu věnuje.",
  OPTIONS: "Ukaž mi možnosti pomoci.",
  AT_PLACE: "Jsem na místě.",
  PHONE_HANDOVER: "Souhlasím s předáním shrnutí pracovníkovi.",
  CONNECTED: "Pracovník převzal moji situaci.",
  DONE: "Předání je dokončené.",
} as const;
export type ChoiceId = keyof typeof CHOICES;

export const CHOICE_PREFIX = "[VOLBA UŽIVATELE";
export function formatChoice(id: ChoiceId): string {
  return `${CHOICE_PREFIX}:${id}] ${CHOICES[id]}`;
}
export function parseChoice(text: string | null | undefined): ChoiceId | null {
  const m = /^\[VOLBA UŽIVATELE:([A-Z_]+)\]/.exec(text ?? "");
  return m && m[1] && m[1] in CHOICES ? (m[1] as ChoiceId) : null;
}

/** Deterministický stav předání z voleb uživatele — model ho nesmí „přeskočit“. */
export function deriveHandoffState(input: {
  choices: ChoiceId[];
  gapDetected: boolean;
  level: InterventionLevel;
  targetVerified: boolean;
  routeVerified: boolean;
}): HandoffState {
  const { choices, gapDetected, level, targetVerified, routeVerified } = input;
  // poslední relevantní volba rozhoduje
  for (let i = choices.length - 1; i >= 0; i--) {
    const c = choices[i];
    if (c === "DONE") return "HANDOFF_COMPLETED";
    if (c === "CONNECTED") return "HUMAN_CONNECTED";
    if (c === "AT_PLACE" || c === "PHONE_HANDOVER") return "HANDOFF_READY";
    if (c === "GO" || c === "CONNECT") return "USER_EN_ROUTE";
    if (c === "DECLINE" || c === "SELF") return level === "SAFETY_HANDOFF" ? "IMMEDIATE_NEED_DETECTED" : "HANDOFF_DECLINED";
  }
  if (routeVerified && targetVerified) return "ROUTE_READY";
  if (targetVerified) return "SUPPORT_TARGET_FOUND";
  if (gapDetected || level === "ACTIVE_HANDOFF" || level === "SAFETY_HANDOFF") return "IMMEDIATE_NEED_DETECTED";
  return "NONE";
}

/* ---------- Doménové resolvery ---------- */

const DOMAIN_RESOLVERS: Record<DomainId, string> = {
  urad: "Doména ÚŘAD: agenda Úřadu práce ČR — dávky, příspěvky, příspěvek na bydlení, příspěvek/doplatek na živobytí, mimořádná okamžitá pomoc (MOP), odvolání, doplnění řízení. Rozhodnutí o MOP nemusí být okamžité, proto při akutní nouzi nelze na MOP spoléhat jako na řešení dnešní noci. Typy podpory: kontaktní pracoviště ÚP, sociální pracovník obce/městské části, terénní sociální služby, kontaktní centrum, noclehárna, azylový dům, potravinová pomoc, odborné sociální poradenství, dluhová poradna.",
  finance: "Doména FINANCE: rozpočet, dluhy, exekuce, insolvence. Podpora: dluhové poradny, odborné poradenství.",
  housing: "Doména HOUSING: bydlení, nájem, ztráta bydlení. Podpora: sociální pracovník, housing support, azylové domy.",
  law: "Doména LAW: právní situace. Podpora: bezplatná právní poradna. Žádné právní závěry.",
  health: "Doména HEALTH: zdravotní situace. Bez diagnostiky. Podpora: praktický lékař, linky pomoci, záchranná služba.",
  business: "Doména BUSINESS: podnikání. Podpora: živnostenský úřad, poradenská centra.",
  personal: "Doména PERSONAL: osobní rozvoj. Podpora: kariérní a osobní poradenství.",
};

const CORE_PRINCIPLES = `Jsi DOME, asistent, který pomáhá člověku vyřešit jeho konkrétní situaci. Vyhodnocuješ VŽDY celý dosavadní kontext případu.

USER GOAL FIRST:
- "user_goal.text" = cíl tak, jak ho uživatel sám formuloval, co nejblíže jeho slovům (nebo jak ho výslovně změnil). NIKDY ho nepřepisuj na jinou "skutečnou" potřebu.
- Uživateli nikdy neříkej "ve skutečnosti potřebujete…", "zjistili jsme, že za tím je…". Neodhaluj interní úvahy. Nediagnostikuj, nemanipuluj, nic nezamlčuj.

IMMEDIATE NEED GAP:
- "immediate_need_gap" = co musí být vyřešeno dříve, než bude cíl uživatele prakticky účinný (např. cíl MOP, ale dnes nemá jídlo ani kde spát a rozhodnutí nemusí být okamžité).
- Obojí se řeší SOUČASNĚ: "now_actions" (TEĎ: dostat člověka k pomoci, základní potřeby, kontakt s pracovníkem) a "then_actions" (POTOM: pokračovat v cíli uživatele). Nikdy "nejdřív dokumenty, pak se podíváme, kde budete spát".
- Signály čti z celého kontextu, nečekej, až je uživatel všechny pojmenuje. Bez akutních signálů gap.detected = false a netlač.

INTERVENCE (intervention_level):
- SELF: žádná služba nedává smysl, nebo ji uživatel odmítl. support_path.relevance = "none".
- OPTIONS: existuje relevantní bezplatná služba (dluhy → dluhová poradna, bydlení → sociální pracovník, právo → právní poradna) a uživatel ji neodmítl. Nabídka je dobrovolná, cestu "řešit sám" zachovej.
- CONNECT: složitější situace (více problémů, lhůta, hrozí ztráta příjmu/bydlení, neví si rady); propojení výrazně pomůže. Dobrovolné.
- ACTIVE_HANDOFF: největší hodnotu teď nemá další textová rada, ale osobní kontakt s pracovníkem/službou (např. žádné peníze + žádné jídlo + žádné místo na noc). Buď praktický a veď k akci.
- SAFETY_HANDOFF: bezprostřední ohrožení života/zdraví či násilí. Prioritou je bezpečí (112, 155, 158), ne administrativa. Platí i když uživatel chce řešit sám.

AUTONOMIE:
- Kroky "[VOLBA UŽIVATELE:...]" jsou rozhodnutí uživatele. Po DECLINE/SELF respektuj volbu: pokračuj jeho cílem, neargumentuj, stejnou nabídku neopakuj (výjimka: zásadní nová skutečnost nebo bezpečnostní riziko).
- Po GO (jde na místo) se ptej jen na to, co mu pomůže se tam dostat. Po AT_PLACE/CONNECTED už nevýslýchej: pracovník přebírá praktickou pomoc, DOME podporuje pracovníka i uživatele a pokračuje v cíli (formulář, dokumenty).

DOKUMENTY NEJSOU VRÁTNÝ:
- Doklady jsou podpůrná informace, nikdy podmínka pomoci. Při akutní nouzi se NEPTEJ jako první na doklady. Formuluj: "Pokud máte občanský průkaz a další dokumenty, vezměte je s sebou. Pokud je nemáte, neodkládejte kvůli tomu kontakt s pomocí."

PRAVDIVOST:
- Hypotéza je vždy NEOVĚŘENÁ. "verified" jen z obsahu nahraného dokumentu (uveď zdroj). Nikdy netvrď, že jsi něco ověřil, kontaktoval nebo zajistil.
- NEMÁŠ přístup k aktuálním datům o organizacích, adresách, otevírací době, kapacitě ani dopravě. support_path.target_name a target_address vrať null, pokud je uživatel sám neuvedl (pak target_source = "user_reported"), jinak "none". Nevymýšlej organizace, adresy, časy, spoje ani kapacity. target_type popiš obecně (např. "sociální pracovník městské části", "noclehárna").
- Neslibuj přiznání dávky ani přijetí službou. Nepodávej nic za uživatele. Žádné právní závěry. Nikdy neoznač případ za vyřešený na základě domněnky.

JAZYK A MOST, NE CHECKLIST:
- V akutní situaci nepiš "Podle dostupných informací…", "Možná byste mohl…", "Vyhledejte si…", "Současně vyhledejte…", "Připravte si dokumenty…". Nevytvářej další seznam úkolů — buď most k člověku.
- Nikdy nenavrhuj jako jediný krok "zavolejte tam", pokud uživatel uvedl, že nemá kredit/data. Preferuj osobní příchod.
- Nikdy nepředpokládej "jděte pěšky". Trasu ani spoje neuváděj (nemáš ověřená data MHD).
- MOP: "O přiznání MOP rozhoduje ÚP." Nikdy netvrď, že MOP bude přiznána ani že z ní bude zaplacen nocleh. DOME může připravit text žádosti, podklady, vysvětlit postup a shrnutí.
- Krizový příklad: "MOP můžeme připravit. Protože ale rozhodnutí o MOP nemusí vyřešit dnešní noc, je teď nejpraktičtější dostat vás k pracovníkovi, který může řešit dnešní jídlo a nocleh a zároveň vám pomoct pokračovat v žádosti."

CASE CORE ("case_draft") — strukturovaný stav případu:
- reality: každá informace zvlášť. CLAIM = co uvedl uživatel (i "Mám 0 Kč" je CLAIM, dokud není doloženo). FACT jen s ověřitelnou evidencí: evidence {kind DOCUMENT|OFFICIAL_SOURCE|SYSTEM_RECORD|OTHER_VERIFIABLE_SOURCE, ref}; u dokumentu ref = přesný název dokumentu z chronologie. Bez evidence evidence null a typ CLAIM/VERIFICATION. document_name ponech null. INTERPRETATION = tvůj výklad (nikdy právní závěr). VERIFICATION = co je potřeba ověřit.
- person: jen informace relevantní pro případ, které zazněly; jinak null / [].
- needs: skutečné potřeby, ne požadavek. "Potřebuji 5 000 Kč" není potřeba — rozlož na důvody (nocleh, strava, doprava…). amount jen pokud uživatel částku výslovně uvedl právě k této potřebě; amount_mention = doslovná citace té věty (obsahuje jen tuto jednu částku), jinak amount i amount_mention null. deadline jen pokud zazněl/je v dokumentu: deadline_mention = doslovná citace, deadline_anchor = {type NEED|ACTION|EVENT|PROCEDURE, key} (NEED → klíč této potřeby, ACTION → klíč akce, EVENT/PROCEDURE → název události/řízení); jinak vše null. Když si vazbou nejsi jistý, dej null. urgency UNKNOWN, když nevíš. tracks: SURVIVAL (24–72 h), ADMINISTRATIVE, HOUSING, INCOME, SUPPORT.
- actions: konkrétní kroky s prioritou NOW / TODAY / FIRST_WORKING_DAY / THIS_WEEK / LATER. Nezaměňuj urgentní problém za urgentní úřední úkon (nocleh NOW, žádost o dávku FIRST_WORKING_DAY). Typy: OBTAIN_EVIDENCE, PREPARE_APPLICATION, SUBMIT_APPLICATION, VERIFY_LEGAL_BASIS, FOLLOW_UP_DEADLINE, CONTACT_SUPPORT, SECURE_BASIC_NEED, GENERAL. depends_on = klíče akcí, které musí být hotové dřív. Každá zásadní akce má need_keys. Při krizi vytvoř okamžitý plán napříč relevantními tracky, ne jen "podejte dávku".
- unknowns: jen otázky, jejichž odpověď může změnit postup; why_it_matters je povinné.
- klíče (key) drž stabilní mezi vyhodnoceními (krátké, popisné, česky bez diakritiky).
- Nikdy "máte nárok". Piš: "Tato možnost se jeví jako relevantní, ale je potřeba ověřit X." MOP je jen možný mechanismus, ne cíl uživatele.

VÝSTUP:
- "current_question" = PRÁVĚ JEDNA otázka — nejdůležitější teď (při ACTIVE_HANDOFF obvykle kde se nachází nebo zda může jít na místo; při SAFETY na bezpečí).
- "primary_next_action" = jeden praktický krok teď.
- "say_to_worker" = krátká věta v 1. osobě, kterou uživatel řekne pracovníkovi; jen fakta, která uvedl, + jeho cíl. Např. "Dnes nemám peníze a nemám kde spát. Potřebuji pomoct s dnešní situací a zároveň chci pokračovat v žádosti o MOP." Při SELF prázdný řetězec.
- "user_message" = 1–2 lidské věty pro uživatele: potvrď jeho cíl a prakticky reaguj na realitu (bez interních pojmů).
- "handoff_state_suggestion" = tvůj návrh stavu; server ho stejně odvodí z voleb uživatele.
- "confidence": "low" nebo "medium". Piš česky, stručně, lidsky.`;

export function buildSystemPrompt(domain: DomainId): string {
  return `${CORE_PRINCIPLES}\n\n${DOMAIN_RESOLVERS[domain]}`;
}

const str = { type: "string" } as const;
const enumOf = (v: readonly string[]) => ({ type: "string", enum: [...v] }) as const;
const nullableStrS = { type: ["string", "null"] } as const;
const CASE_DRAFT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["reality", "person", "needs", "actions", "unknowns"],
  properties: {
    reality: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "type", "text", "source", "document_name", "evidence", "need_keys"], properties: {
      key: str, type: enumOf(REALITY_TYPES), text: str, source: enumOf(REALITY_SOURCES), document_name: nullableStrS,
      evidence: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["kind", "ref"], properties: { kind: enumOf(EVIDENCE_KINDS), ref: str } }] }, need_keys: { type: "array", items: str } } } },
    person: { type: "object", additionalProperties: false, required: ["current_status", "employment_status", "education_status", "housing_status", "income_status", "available_resources", "relevant_social_context", "relevant_procedures", "relevant_documents"], properties: {
      current_status: nullableStrS, employment_status: nullableStrS, education_status: nullableStrS, housing_status: nullableStrS, income_status: nullableStrS,
      available_resources: { type: "array", items: str }, relevant_social_context: { type: "array", items: str }, relevant_procedures: { type: "array", items: str }, relevant_documents: { type: "array", items: str } } },
    needs: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "category", "description", "amount", "amount_mention", "urgency", "deadline", "deadline_mention", "deadline_anchor", "tracks"], properties: {
      key: str, category: enumOf(NEED_CATEGORIES), description: str, amount: { type: ["number", "null"] }, amount_mention: nullableStrS,
      urgency: enumOf(NEED_URGENCIES), deadline: nullableStrS, deadline_mention: nullableStrS,
      deadline_anchor: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["type", "key"], properties: { type: enumOf(DEADLINE_ANCHORS), key: str } }] }, tracks: { type: "array", items: enumOf(TRACK_TYPES) } } } },
    actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "title", "description", "type", "priority", "track", "need_keys", "depends_on"], properties: {
      key: str, title: str, description: str, type: enumOf(ACTION_TYPES), priority: enumOf(ACTION_PRIORITIES), track: { type: ["string", "null"], enum: [...TRACK_TYPES, null] }, need_keys: { type: "array", items: str }, depends_on: { type: "array", items: str } } } },
    unknowns: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "question", "why_it_matters", "need_keys", "impact"], properties: {
      key: str, question: str, why_it_matters: str, need_keys: { type: "array", items: str }, impact: enumOf(UNKNOWN_IMPACTS) } } },
  },
} as const;
const strArr = { type: "array", items: str } as const;
const nullableStr = { type: ["string", "null"] } as const;

export const ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "user_goal", "user_message", "situation", "urgency", "intervention_level", "immediate_need_gap",
    "now_actions", "then_actions", "hypothesis", "stated_by_user", "verified", "to_verify",
    "missing_information", "required_documents", "current_question", "next_step", "primary_next_action",
    "say_to_worker", "support_path", "handoff_state_suggestion", "confidence", "case_draft",
  ],
  properties: {
    user_goal: {
      type: "object", additionalProperties: false, required: ["text", "source"],
      properties: { text: str, source: { type: "string", enum: ["user_stated"] } },
    },
    user_message: str,
    situation: str,
    urgency: { type: "string", enum: [...URGENCY_LEVELS] },
    intervention_level: { type: "string", enum: [...INTERVENTION_LEVELS] },
    immediate_need_gap: {
      type: "object", additionalProperties: false, required: ["detected", "needs", "reason"],
      properties: { detected: { type: "boolean" }, needs: strArr, reason: str },
    },
    now_actions: strArr,
    then_actions: strArr,
    hypothesis: {
      type: "object", additionalProperties: false, required: ["text", "status"],
      properties: { text: str, status: { type: "string", enum: ["unverified"] } },
    },
    stated_by_user: strArr,
    verified: strArr,
    to_verify: strArr,
    missing_information: strArr,
    required_documents: strArr,
    current_question: {
      type: "object", additionalProperties: false, required: ["text", "reason"],
      properties: { text: str, reason: str },
    },
    next_step: {
      type: "object", additionalProperties: false, required: ["text", "condition"],
      properties: { text: str, condition: str },
    },
    primary_next_action: str,
    say_to_worker: str,
    support_path: {
      type: "object", additionalProperties: false,
      required: [
        "relevance", "intervention_level", "reason", "target_type", "target_name", "target_address",
        "target_source", "services", "immediate_needs", "required_documents", "next_action",
        "navigation_available", "handoff_available",
      ],
      properties: {
        relevance: { type: "string", enum: ["none", "optional", "recommended", "urgent"] },
        intervention_level: { type: "string", enum: [...INTERVENTION_LEVELS] },
        reason: str,
        target_type: str,
        target_name: nullableStr,
        target_address: nullableStr,
        target_source: { type: "string", enum: ["none", "user_reported"] },
        services: strArr,
        immediate_needs: strArr,
        required_documents: strArr,
        next_action: str,
        navigation_available: { type: "boolean" },
        handoff_available: { type: "boolean" },
      },
    },
    handoff_state_suggestion: { type: "string", enum: [...HANDOFF_STATES] },
    case_draft: CASE_DRAFT_SCHEMA,
    confidence: { type: "string", enum: ["low", "medium"] },
  },
} as const;

/** Serverové pojistky — platí bez ohledu na výstup modelu. */
export function enforceAssessmentInvariants(
  a: Record<string, unknown>,
  ctx: { choices: ChoiceId[] } = { choices: [] },
): Record<string, unknown> {
  a["hypothesis"] = { ...(a["hypothesis"] as object), status: "unverified" };
  if (a["confidence"] !== "medium") a["confidence"] = "low";
  const lvl = INTERVENTION_LEVELS.includes(a["intervention_level"] as InterventionLevel)
    ? (a["intervention_level"] as InterventionLevel)
    : "SELF";
  a["intervention_level"] = lvl;

  const gap = { detected: false, needs: [] as string[], reason: "", ...((a["immediate_need_gap"] as object) ?? {}) };
  gap.detected = gap.detected === true;
  a["immediate_need_gap"] = gap;
  a["support_path_required"] = gap.detected || lvl === "ACTIVE_HANDOFF" || lvl === "SAFETY_HANDOFF";

  const sp = { ...((a["support_path"] as Record<string, unknown>) ?? {}) };
  sp["intervention_level"] = lvl;
  // Bez ověřeného externího zdroje nesmí existovat konkrétní místo ani navigace.
  if (sp["target_source"] !== "user_reported") {
    sp["target_name"] = null;
    sp["target_address"] = null;
    sp["target_source"] = "none";
  }
  sp["navigation_available"] = false;
  sp["verified_at"] = null; // čas ověření z externího zdroje — žádný zdroj zatím není
  sp["route"] = null; // ověřená trasa — žádný zdroj zatím není
  a["support_path"] = sp;

  a["handoff_state"] = deriveHandoffState({
    choices: ctx.choices,
    gapDetected: gap.detected,
    level: lvl,
    targetVerified: false, // pouze z ověřeného externího zdroje
    routeVerified: false,
  });
  if (typeof a["say_to_worker"] !== "string") a["say_to_worker"] = "";
  a["core_version"] = "dome-core/2.0";
  return a;
}

/* ---------- Shrnutí pro pracovníka ---------- */

export const HANDOFF_SECTIONS = ["cil", "aktualni_situace", "potrebuje_ted", "dokumenty", "puvodni_cil"] as const;

export const HANDOFF_SYSTEM = `Připrav stručné "Shrnutí pro pracovníka" (sociální pracovník / úředník). Uživatel ho pracovníkovi sám ukáže. Česky, věcně, ve 3. osobě ("uživatel uvedl, že…").
Sekce (section):
- "cil": cíl uživatele jeho slovy,
- "aktualni_situace": co uživatel uvedl o své situaci (každá skutečnost zvlášť),
- "potrebuje_ted": co potřebuje nyní (dnešní základní potřeby, kontakt, pokračování cíle),
- "dokumenty": jaké dokumenty má / nemá (jen pokud zaznělo),
- "puvodni_cil": krátce původní administrativní cíl (např. "MOP").
Každá položka má štítek:
- FACT: jen co je doloženo obsahem nahraného dokumentu (uveď který),
- USER_REPORTED: co uživatel sám uvedl,
- UNVERIFIED: domněnky a odhady.
Jen informace potřebné k pochopení aktuální situace. Nikdy nevydávej domněnku za fakt. Nediagnostikuj. Netvrď, že DOME někoho kontaktoval.`;

export const HANDOFF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["section", "label", "text"],
        properties: {
          section: { type: "string", enum: [...HANDOFF_SECTIONS] },
          label: { type: "string", enum: ["FACT", "USER_REPORTED", "UNVERIFIED"] },
          text: str,
        },
      },
    },
  },
} as const;

/** FACT bez nahraného dokumentu neexistuje. */
export function enforceHandoffLabels<T extends { label?: string | undefined }>(items: T[], documents: number): T[] {
  return items.map((it) => ({
    ...it,
    label: it.label === "FACT" && documents === 0 ? "UNVERIFIED" : (it.label ?? "UNVERIFIED"),
  }));
}
