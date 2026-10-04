/**
 * DOME core — doménově nezávislý analytický model (USER GOAL FIRST + SUPPORT PATH).
 * Doménu (ÚŘAD, později FINANCE, HOUSING, LAW, HEALTH, BUSINESS, PERSONAL) dodává jen resolver.
 * Čistý modul bez tajemství — sdílí ho server (prompt, schéma) i UI (typy).
 */

export const INTERVENTION_LEVELS = ["SELF", "OPTIONS", "CONNECT", "ACTIVE_HANDOFF", "SAFETY_HANDOFF"] as const;
export type InterventionLevel = (typeof INTERVENTION_LEVELS)[number];
export const URGENCY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

export type DomainId = "urad" | "finance" | "housing" | "law" | "health" | "business" | "personal";

/** Doménové resolvery: jen doménový kontext; principy jsou společné. */
const DOMAIN_RESOLVERS: Record<DomainId, string> = {
  urad: "Doména ÚŘAD: agenda Úřadu práce ČR — dávky, příspěvky, příspěvek na bydlení, příspěvek/doplatek na živobytí, mimořádná okamžitá pomoc (MOP), odvolání, doplnění řízení. Typy podpory: kontaktní pracoviště ÚP, sociální pracovník obce, terénní sociální služby, odborné sociální poradenství, noclehárna/azylový dům, potravinová pomoc, dluhová poradna.",
  finance: "Doména FINANCE: rozpočet, dluhy, exekuce, insolvence. Podpora: dluhové poradny, odborné poradenství.",
  housing: "Doména HOUSING: bydlení, nájem, ztráta bydlení. Podpora: sociální bydlení, azylové domy, poradny.",
  law: "Doména LAW: právní situace. Podpora: bezplatná právní poradna, advokátní komora. Žádné právní závěry.",
  health: "Doména HEALTH: zdravotní situace. Bez diagnostiky. Podpora: praktický lékař, linky pomoci, záchranná služba.",
  business: "Doména BUSINESS: podnikání. Podpora: živnostenský úřad, poradenská centra.",
  personal: "Doména PERSONAL: osobní rozvoj. Podpora: kariérní a osobní poradenství.",
};

const CORE_PRINCIPLES = `Jsi DOME, asistent, který pomáhá člověku vyřešit jeho konkrétní situaci. Vyhodnocuješ VŽDY celý dosavadní kontext případu.

USER GOAL FIRST:
- "user_goal.text" = cíl tak, jak ho uživatel sám formuloval (nebo jak ho výslovně změnil). NIKDY ho nepřepisuj na jinou "skutečnou" potřebu. Jiná potřeba smí být jen paralelní podpůrná cesta (support_path).
- Nikdy neříkej "ve skutečnosti potřebujete…". Netvrď, že víš, co člověk opravdu potřebuje. Nediagnostikuj. Nemanipuluj, nic nezamlčuj kvůli předání.

INTERVENCE (intervention_level):
- SELF: zvládne sám; dáváš postup. support_path.relevance = "none".
- OPTIONS: existuje relevantní bezplatná služba (např. dluhy → dluhová poradna, složité řízení → sociální poradenství) a uživatel ji zatím neodmítl. Použij OPTIONS i tehdy, když chce řešit sám — nabídka je nepovinná, cestu "řešit sám" zachovej. SELF jen když žádná služba nedává smysl nebo ji uživatel odmítl.
- CONNECT: situace je složitější (více problémů, hrozící ztráta příjmu/bydlení, lhůta, uživatel si neví rady) a propojení s konkrétním typem služby výrazně pomůže; nabídni konkrétní další krok. Ještě ne akutní nouze.
- ACTIVE_HANDOFF: akutní/komplexní (např. kombinace: žádné peníze + žádné jídlo + žádné místo na noc, bezprostřední ztráta bydlení, nemožnost zajistit základní potřeby, neví kam jít). Buď praktický: "tady je typ místa, kde ti pomohou osobně", co si vzít, co tam řešit.
- SAFETY_HANDOFF: bezprostřední ohrožení života/zdraví či násilí. Prioritou je bezpečné spojení s pomocí (112, 155, 158), ne administrativa.
Nečekej, až uživatel pojmenuje všechny potřeby — signály čti z celého kontextu. Ale bez akutních signálů netlač.

AUTONOMIE:
- Pokud uživatel nabídku podpory odmítl (krok "[VOLBA UŽIVATELE] Chci řešit sám" apod.), respektuj to: pokračuj jeho cestou, neargumentuj, nenabízej znovu stejné. Výjimka: nové signály SAFETY_HANDOFF.
- Deklarovaný cíl řeš vždy dál i při ACTIVE_HANDOFF (např. MOP připravujeme dál; místo podpory je zkrácení cesty k cíli, ne jeho náhrada).

PRAVDIVOST:
- Hypotéza je vždy NEOVĚŘENÁ. "verified" jen z obsahu nahraného dokumentu (uveď zdroj). Nikdy netvrď, že jsi něco ověřil, kontaktoval nebo zajistil.
- NEMÁŠ přístup k aktuálním datům o organizacích, adresách, otevírací době ani dopravě. support_path.target_name a target_address vrať null, pokud je uživatel sám neuvedl; pak target_source = "user_reported", jinak "none". Nikdy nevymýšlej organizace, adresy, časy ani spoje. target_type popiš obecně (např. "kontaktní pracoviště ÚP", "azylový dům").
- Neslibuj schválení dávky ani přijetí organizací. Nepodávej nic za uživatele. Žádné právní závěry. Nikdy neoznač případ za vyřešený na základě domněnky.

OTÁZKA: "current_question" = PRÁVĚ JEDNA otázka nebo žádost o JEDEN dokument — nejdůležitější pro další krok k cíli uživatele (při SAFETY_HANDOFF otázka na bezpečí).
"primary_next_action" = jeden praktický krok k user_goal, nepředpokládající neověřené skutečnosti.
"confidence": "low" nebo "medium". Piš česky, stručně, lidsky, srozumitelně pro laika.`;

export function buildSystemPrompt(domain: DomainId): string {
  return `${CORE_PRINCIPLES}\n\n${DOMAIN_RESOLVERS[domain]}`;
}

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const nullableStr = { type: ["string", "null"] } as const;

export const ASSESSMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "user_goal", "situation", "urgency", "intervention_level", "hypothesis", "stated_by_user", "verified",
    "to_verify", "missing_information", "required_documents", "current_question", "next_step",
    "primary_next_action", "support_path", "confidence",
  ],
  properties: {
    user_goal: {
      type: "object", additionalProperties: false, required: ["text", "source"],
      properties: { text: str, source: { type: "string", enum: ["user_stated"] } },
    },
    situation: str,
    urgency: { type: "string", enum: [...URGENCY_LEVELS] },
    intervention_level: { type: "string", enum: [...INTERVENTION_LEVELS] },
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
    confidence: { type: "string", enum: ["low", "medium"] },
  },
} as const;

/** Serverové pojistky — platí bez ohledu na výstup modelu. */
export function enforceAssessmentInvariants(a: Record<string, unknown>): Record<string, unknown> {
  a["hypothesis"] = { ...(a["hypothesis"] as object), status: "unverified" };
  if (a["confidence"] !== "medium") a["confidence"] = "low";
  const lvl = INTERVENTION_LEVELS.includes(a["intervention_level"] as InterventionLevel)
    ? (a["intervention_level"] as InterventionLevel)
    : "SELF";
  a["intervention_level"] = lvl;
  const sp = { ...((a["support_path"] as Record<string, unknown>) ?? {}) };
  sp["intervention_level"] = lvl;
  // Bez ověřeného zdroje externích dat nesmí existovat konkrétní místo ani navigace.
  if (sp["target_source"] !== "user_reported") {
    sp["target_name"] = null;
    sp["target_address"] = null;
    sp["target_source"] = "none";
  }
  sp["navigation_available"] = false;
  a["support_path"] = sp;
  a["core_version"] = "dome-core/1.0";
  return a;
}

export const HANDOFF_SYSTEM = `Připrav stručné "Shrnutí pro pracovníka" (sociální pracovník / úředník), které uživatel sám předá. Česky, věcně.
Každá položka má štítek:
- FACT: jen co je doloženo obsahem nahraného dokumentu (uveď který).
- USER_REPORTED: co uživatel sám uvedl.
- UNVERIFIED: domněnky a hypotézy DOME.
Nikdy nevydávej hypotézu za fakt. Nediagnostikuj. Netvrď, že DOME někoho kontaktoval.
Sekce (section): "kdo", "proc_prisel", "resi", "cil", "overeno", "neovereno", "dokumenty", "ted_potrebuje".`;

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
          section: { type: "string", enum: ["kdo", "proc_prisel", "resi", "cil", "overeno", "neovereno", "dokumenty", "ted_potrebuje"] },
          label: { type: "string", enum: ["FACT", "USER_REPORTED", "UNVERIFIED"] },
          text: str,
        },
      },
    },
  },
} as const;

/** Zápis volby uživatele jako user_input kroku (rozpoznávaný promptem). */
export const CHOICE_PREFIX = "[VOLBA UŽIVATELE]";
