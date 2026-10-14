/**
 * CASE CORE — canonical DomeCaseState (schema 1.1).
 * Jediný datový kontrakt analytického stavu případu. Ukládá se uvnitř assessment JSONB
 * (urad_case_steps) přes urad_record_dome_assessment — žádné nové tabulky.
 * Čistý modul: sdílí ho server (stavba, validace) i UI (typy, normalizace starých hodnocení).
 */
import { detectImmediateNeeds, type NeedSignal } from "./support-engine";

export const DOME_CASE_SCHEMA_VERSION = "1.1";
export const LEGACY_DOME_CASE_SCHEMA_VERSIONS = ["1.0", "1.1"] as const;

/* ---------- Enumy ---------- */
export const REALITY_TYPES = ["FACT", "CLAIM", "INTERPRETATION", "VERIFICATION"] as const;
export const CERTAINTIES = ["VERIFIED", "LIKELY", "POSSIBLE", "UNKNOWN", "NOT_AVAILABLE"] as const;
export const REALITY_SOURCES = ["USER", "DOCUMENT", "OFFICIAL_SOURCE", "SYSTEM", "OTHER"] as const;
export const NEED_CATEGORIES = [
  "HOUSING",
  "FOOD",
  "HYGIENE",
  "TRANSPORT",
  "HEALTH",
  "DOCUMENT",
  "INCOME",
  "LEGAL",
  "EDUCATION",
  "OTHER",
] as const;
/** Druhy ověřitelné evidence. FACT vyžaduje evidenci, kterou server umí doložit (ne jen tvrzení modelu). */
export const EVIDENCE_KINDS = [
  "DOCUMENT",
  "OFFICIAL_SOURCE",
  "SYSTEM_RECORD",
  "OTHER_VERIFIABLE_SOURCE",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
/** Ověřitelný podklad dostupný serveru. DOCUMENT = nahraný dokument; ostatní druhy dodá až Evidence Engine (Fáze 2) — boundary hook. */
export type VerifiableEvidence = { kind: EvidenceKind; ref: string };
export const DEADLINE_ANCHORS = ["NEED", "ACTION", "EVENT", "PROCEDURE"] as const;
export type DeadlineAnchorType = (typeof DEADLINE_ANCHORS)[number];
export const evidenceId = (e: VerifiableEvidence) =>
  `${e.kind.toLowerCase()}:${e.ref.toLowerCase().trim()}`;
export const NEED_URGENCIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
export const NEED_STATUSES = ["OPEN", "PARTIALLY_COVERED", "COVERED", "UNKNOWN"] as const;
export const TRACK_TYPES = ["SURVIVAL", "ADMINISTRATIVE", "HOUSING", "INCOME", "SUPPORT"] as const;
export const ACTION_PRIORITIES = [
  "NOW",
  "TODAY",
  "FIRST_WORKING_DAY",
  "THIS_WEEK",
  "LATER",
] as const;
export const ACTION_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "DONE"] as const;
export const ACTION_TYPES = [
  "GENERAL",
  "OBTAIN_EVIDENCE",
  "PREPARE_APPLICATION",
  "SUBMIT_APPLICATION",
  "VERIFY_LEGAL_BASIS",
  "FOLLOW_UP_DEADLINE",
  "CONTACT_SUPPORT",
  "SECURE_BASIC_NEED",
] as const;
export const UNKNOWN_IMPACTS = ["HIGH", "MEDIUM", "LOW"] as const;
export const CASE_STATUSES = [
  "NEW",
  "IN_ANALYSIS",
  "ACTIVE",
  "WAITING",
  "STABILIZED",
  "CLOSED",
] as const;

export type RealityType = (typeof REALITY_TYPES)[number];
export type Certainty = (typeof CERTAINTIES)[number];
export type RealitySource = (typeof REALITY_SOURCES)[number];
export type NeedCategory = (typeof NEED_CATEGORIES)[number];
export type NeedUrgency = (typeof NEED_URGENCIES)[number];
export type NeedStatus = (typeof NEED_STATUSES)[number];
export type TrackType = (typeof TRACK_TYPES)[number];
export type ActionPriority = (typeof ACTION_PRIORITIES)[number];
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export type ActionType = (typeof ACTION_TYPES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];

/* ---------- Entity ---------- */
export type RealityItem = {
  id: string;
  type: RealityType;
  text: string;
  certainty: Certainty;
  source: RealitySource;
  evidence_ids: string[];
  related_need_ids: string[];
  related_route_ids: string[]; // hook: Legal Route Engine
  created_at: string;
};

export type PersonMap = {
  current_status: string | null;
  employment_status: string | null;
  education_status: string | null;
  housing_status: string | null;
  income_status: string | null;
  available_resources: string[];
  relevant_social_context: string[];
  relevant_procedures: string[];
  relevant_documents: string[];
};

export type Need = {
  id: string;
  category: NeedCategory;
  description: string;
  amount: number | null; // null = AMOUNT_UNKNOWN
  amount_status: "KNOWN" | "UNKNOWN";
  /** Přesná citace, ze které částka pochází (MENTION → NEED → AMOUNT). */
  amount_mention: string | null;
  currency: "CZK";
  urgency: NeedUrgency;
  deadline: string | null; // null = DEADLINE_UNKNOWN
  deadline_status: "KNOWN" | "UNKNOWN";
  deadline_mention: string | null;
  /** K čemu se lhůta váže. Hook pro Deadline Engine (Fáze 2). */
  deadline_anchor: { type: DeadlineAnchorType; ref: string } | null;
  evidence_ids: string[];
  status: NeedStatus;
  track_ids: string[];
  route_ids: string[]; // hook
  created_at: string;
};

export type Track = {
  id: string;
  type: TrackType;
  title: string;
  horizon: string;
  active: boolean;
  need_ids: string[];
  created_at: string;
};

export type Action = {
  id: string;
  title: string;
  description: string;
  type: ActionType;
  priority: ActionPriority;
  status: ActionStatus;
  status_reason: string | null;
  track_id: string | null;
  need_ids: string[];
  evidence_ids: string[];
  deadline_id: string | null; // hook: Deadline Engine
  route_id: string | null; // hook: Legal Route Engine
  depends_on_action_ids: string[];
  created_at: string;
  completed_at: string | null;
};

export type Unknown = {
  id: string;
  question: string;
  why_it_matters: string;
  affects_need_ids: string[];
  affects_route_ids: string[];
  impact: (typeof UNKNOWN_IMPACTS)[number];
};

/** Hooky pro Fázi 2+ (prázdné, ale součást kontraktu). */
export type FutureLinks = {
  routes: { id: string; label: string; status: "REQUIRES_VERIFICATION" }[];
  evidence: { id: string; label: string; source: RealitySource; reality_ids: string[] }[];
  deadlines: { id: string; label: string; date: string | null; source: RealitySource }[];
  risks: { id: string; label: string }[];
  gaps: { id: string; route_id: string | null; label: string }[];
};

/** Additive v1.1 entities. These are descriptive records, not verification by themselves. */
export type CaseDocument = {
  id: string;
  name: string;
  source: RealitySource;
  uploaded_at: string | null;
  extraction_status: "UNKNOWN" | "PENDING" | "SUCCEEDED" | "FAILED";
};
export type CaseEvidence = {
  id: string;
  kind: EvidenceKind;
  ref: string;
  source: RealitySource;
  verified: boolean;
  reality_ids: string[];
};
export type CaseEvidenceLink = {
  id: string;
  evidence_id: string;
  reality_id: string;
  relation: "SUPPORTS" | "CONTRADICTS" | "MENTIONS";
};
export type CaseTimelineEvent = {
  id: string;
  label: string;
  date: string | null;
  date_status: "KNOWN" | "UNKNOWN";
  source: RealitySource;
  evidence_ids: string[];
};
export type CaseDeadline = {
  id: string;
  label: string;
  date: string | null;
  date_status: "KNOWN" | "UNKNOWN";
  source: RealitySource;
  anchor_type: DeadlineAnchorType | null;
  anchor_ref: string | null;
  evidence_ids: string[];
};
export type CaseRisk = {
  id: string;
  label: string;
  level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  status: "OPEN" | "MITIGATED" | "RESOLVED" | "UNKNOWN";
  source: RealitySource;
  related_need_ids: string[];
  evidence_ids: string[];
};

export type DomeCaseState = {
  dome_case_schema_version: typeof DOME_CASE_SCHEMA_VERSION;
  case_id: string;
  status: CaseStatus;
  user_goal: string | null;
  system_interpretation: string | null;
  reality: RealityItem[];
  person: PersonMap;
  needs: Need[];
  tracks: Track[];
  actions: Action[];
  unknowns: Unknown[];
  links: FutureLinks;
  /** Schema 1.1 additions. Optional to read historic v1.0 payloads safely. */
  documents?: CaseDocument[];
  evidence?: CaseEvidence[];
  evidence_links?: CaseEvidenceLink[];
  timeline?: CaseTimelineEvent[];
  deadlines?: CaseDeadline[];
  risks?: CaseRisk[];
  metadata: {
    last_updated: string;
    version: number;
    legacy_normalized: boolean;
    signals: NeedSignal[];
  };
};

const TRACK_META: Record<TrackType, { title: string; horizon: string }> = {
  SURVIVAL: { title: "Dnešek a nejbližší dny", horizon: "24–72 hodin" },
  ADMINISTRATIVE: { title: "Úřední kroky", horizon: "nejbližší pracovní dny" },
  HOUSING: { title: "Bydlení", horizon: "stabilizace bydlení" },
  INCOME: { title: "Příjem", horizon: "obnova příjmu" },
  SUPPORT: { title: "Podpora", horizon: "sociální služby, obec, NNO" },
};

export const emptyPerson = (): PersonMap => ({
  current_status: null,
  employment_status: null,
  education_status: null,
  housing_status: null,
  income_status: null,
  available_resources: [],
  relevant_social_context: [],
  relevant_procedures: [],
  relevant_documents: [],
});

/* ---------- Vstup od modelu (draft s klíči místo ID) ---------- */
export type CaseDraft = {
  reality: {
    key: string;
    type: string;
    text: string;
    source: string;
    document_name?: string | null;
    evidence?: { kind: string; ref: string } | null;
    need_keys: string[];
  }[];
  person: PersonMap;
  needs: {
    key: string;
    category: string;
    description: string;
    amount: number | null;
    amount_mention?: string | null;
    urgency: string;
    deadline: string | null;
    deadline_mention?: string | null;
    deadline_anchor?: { type: string; key: string } | null;
    tracks: string[];
  }[];
  actions: {
    key: string;
    title: string;
    description: string;
    type: string;
    priority: string;
    track: string | null;
    need_keys: string[];
    depends_on: string[];
  }[];
  unknowns: {
    key: string;
    question: string;
    why_it_matters: string;
    need_keys: string[];
    impact: string;
  }[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "x";
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/**
 * Sestaví nový canonical stav z draftu modelu + předchozího stavu.
 * Pravidla: CLAIM nikdy nepovýší na FACT; FACT bez dokumentu → CLAIM; částky/lhůty jen pokud je model výslovně uvedl;
 * statusy akcí z předchozího stavu se zachovají (rozhodl o nich uživatel).
 */
export function buildCaseState(input: {
  caseId: string;
  userGoal: string | null;
  interpretation: string | null;
  draft: Partial<CaseDraft> | null | undefined;
  userText: string;
  documents: number;
  /** Názvy skutečně nahraných dokumentů (FACT musí odkazovat na jeden z nich). */
  documentNames?: string[];
  /** Text, ze kterého smí pocházet citace částek a lhůt (výroky uživatele + obsah dokumentů). */
  evidenceText?: string;
  /** Další ověřitelné podklady mimo dokumenty (Evidence Engine hook; zatím vždy prázdné). */
  verifiableEvidence?: VerifiableEvidence[];
  previous: DomeCaseState | null;
  now?: Date;
}): DomeCaseState {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  const evidence = norm(input.evidenceText ?? input.userText);
  const joinThousands = (x: string) => x.replace(/(\d)[\s.\u00a0](?=\d{3}\b)/g, "$1"); // 5 000 / 5.000 → 5000
  const numbersIn = (x: string) => [...new Set(joinThousands(x).match(/\d+/g) ?? [])];
  /** Citace musí doslova existovat ve výrocích uživatele / obsahu dokumentu. */
  const quoted = (m: unknown): string | null =>
    typeof m === "string" && m.trim().length >= 3 && evidence.includes(norm(m)) ? norm(m) : null;
  // Seznam ověřitelných podkladů: nahrané dokumenty + případné další ověřené zdroje (hook).
  const verifiable = new Set([
    ...(input.documentNames ?? [])
      .filter(Boolean)
      .map((n) => evidenceId({ kind: "DOCUMENT", ref: n })),
    ...(input.verifiableEvidence ?? []).map(evidenceId),
  ]);
  const rawNeeds = (d0: Partial<CaseDraft>) => d0.needs ?? [];

  /** AMOUNT: MENTION → NEED → AMOUNT. Jinak null/UNKNOWN. */
  const amountMentions = new Map<string, number>();
  rawNeeds(input.draft ?? {}).forEach((n) => {
    const q = quoted(n.amount_mention);
    if (q) amountMentions.set(q, (amountMentions.get(q) ?? 0) + 1);
  });
  const bindAmount = (
    n: CaseDraft["needs"][number],
  ): { amount: number | null; mention: string | null } => {
    const v = n.amount;
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
      return { amount: null, mention: null };
    const q = quoted(n.amount_mention);
    if (!q || amountMentions.get(q) !== 1) return { amount: null, mention: null }; // žádná / sdílená citace = nejednoznačné
    const nums = numbersIn(q);
    if (nums.length !== 1 || nums[0] !== String(Math.round(v)))
      return { amount: null, mention: null }; // citace musí obsahovat právě tuto jednu částku
    return { amount: v, mention: q };
  };

  /** DEADLINE: MENTION → (NEED | ACTION | EVENT | PROCEDURE) → DEADLINE. Jinak null/UNKNOWN. */
  const deadlineMentions = new Map<string, number>();
  rawNeeds(input.draft ?? {}).forEach((n) => {
    const q = quoted(n.deadline_mention);
    if (q) deadlineMentions.set(q, (deadlineMentions.get(q) ?? 0) + 1);
  });
  const draftActionIds = new Set(
    (input.draft?.actions ?? []).map((a) => `act_${slug(a.key || a.title)}`),
  );
  const bindDeadline = (
    n: CaseDraft["needs"][number],
    needId: string,
  ): { deadline: string | null; mention: string | null; anchor: Need["deadline_anchor"] } => {
    const none = { deadline: null, mention: null, anchor: null };
    if (typeof n.deadline !== "string" || !n.deadline.trim()) return none;
    const q = quoted(n.deadline_mention);
    if (!q || deadlineMentions.get(q) !== 1) return none;
    const dl = norm(n.deadline);
    const dn = numbersIn(dl);
    if (!(q.includes(dl) || (dn.length > 0 && dn.every((x) => numbersIn(q).includes(x)))))
      return none;
    const at = n.deadline_anchor;
    if (!at || !DEADLINE_ANCHORS.includes(at.type as DeadlineAnchorType)) return none;
    const key = typeof at.key === "string" ? at.key.trim() : "";
    let ref: string | null = null;
    if (at.type === "NEED") ref = !key || `need_${slug(key)}` === needId ? needId : null;
    else if (at.type === "ACTION")
      ref = key && draftActionIds.has(`act_${slug(key)}`) ? `act_${slug(key)}` : null;
    else ref = key || null; // EVENT / PROCEDURE: pojmenovaná událost / řízení
    if (!ref) return none;
    return {
      deadline: n.deadline.trim(),
      mention: q,
      anchor: { type: at.type as DeadlineAnchorType, ref },
    };
  };
  const now = (input.now ?? new Date()).toISOString();
  const d = input.draft ?? {};
  const prev = input.previous;
  const det = detectImmediateNeeds(input.userText);
  const prevCreated = (id: string, list: { id: string; created_at: string }[] | undefined) =>
    list?.find((x) => x.id === id)?.created_at ?? now;

  const needs: Need[] = (d.needs ?? []).map((n) => {
    const id = `need_${slug(n.key || n.description)}`;
    const old = prev?.needs.find((x) => x.id === id);
    const am = bindAmount(n);
    const dl = bindDeadline(n, id);
    return {
      id,
      category: pick(n.category, NEED_CATEGORIES, "OTHER"),
      description: String(n.description ?? ""),
      amount: am.amount,
      amount_status: am.amount === null ? "UNKNOWN" : "KNOWN",
      amount_mention: am.mention,
      currency: "CZK",
      urgency: pick(n.urgency, NEED_URGENCIES, "UNKNOWN"),
      deadline: dl.deadline,
      deadline_status: dl.deadline === null ? "UNKNOWN" : "KNOWN",
      deadline_mention: dl.mention,
      deadline_anchor: dl.anchor,
      evidence_ids: [],
      status: old?.status ?? "OPEN",
      track_ids: (n.tracks ?? [])
        .filter((t) => TRACK_TYPES.includes(t as TrackType))
        .map((t) => `track_${t.toLowerCase()}`),
      route_ids: [],
      created_at: old?.created_at ?? now,
    };
  });
  // Krizová pojistka z detektoru: dnešní nocleh nesmí chybět, pokud ho uživatel uvedl.
  const tonight = needs.find(
    (n) => n.category === "HOUSING" && (n.urgency === "CRITICAL" || n.urgency === "HIGH"),
  );
  if (det.signals.includes("no_shelter_tonight") && tonight) {
    tonight.urgency = "CRITICAL";
    if (!tonight.track_ids.includes("track_survival")) tonight.track_ids.push("track_survival");
  } else if (
    det.signals.includes("no_shelter_tonight") &&
    !needs.some((n) => n.category === "HOUSING" && n.urgency === "CRITICAL")
  ) {
    needs.unshift({
      id: "need_dnesni_nocleh",
      category: "HOUSING",
      description: "Bezpečné místo na dnešní noc",
      amount: null,
      amount_status: "UNKNOWN",
      amount_mention: null,
      currency: "CZK",
      urgency: "CRITICAL",
      deadline: null,
      deadline_status: "UNKNOWN",
      deadline_mention: null,
      deadline_anchor: null,
      evidence_ids: [],
      status: prev?.needs.find((x) => x.id === "need_dnesni_nocleh")?.status ?? "OPEN",
      track_ids: ["track_survival"],
      route_ids: [],
      created_at: prevCreated("need_dnesni_nocleh", prev?.needs),
    });
  }
  const needIds = new Set(needs.map((n) => n.id));
  const needKey = (k: string) => `need_${slug(k)}`;

  // Tracks: aktivuje je potřeba (model) i krizový detektor.
  const trackTypes = new Set<TrackType>();
  needs.forEach((n) =>
    n.track_ids.forEach((t) => trackTypes.add(t.replace("track_", "").toUpperCase() as TrackType)),
  );
  if (det.profile === "HIGH_IMMEDIATE_SUPPORT" || det.profile === "SAFETY")
    ["SURVIVAL", "SUPPORT"].forEach((t) => trackTypes.add(t as TrackType));
  if (det.signals.includes("no_shelter_tonight") || det.signals.includes("housing_loss_risk"))
    trackTypes.add("HOUSING");
  if (det.signals.includes("mop") || det.signals.includes("admin_deadline"))
    trackTypes.add("ADMINISTRATIVE");
  (d.actions ?? []).forEach(
    (a) =>
      a.track && TRACK_TYPES.includes(a.track as TrackType) && trackTypes.add(a.track as TrackType),
  );
  const tracks: Track[] = TRACK_TYPES.filter((t) => trackTypes.has(t)).map((t) => {
    const id = `track_${t.toLowerCase()}`;
    return {
      id,
      type: t,
      ...TRACK_META[t],
      active: true,
      need_ids: needs.filter((n) => n.track_ids.includes(id)).map((n) => n.id),
      created_at: prevCreated(id, prev?.tracks),
    };
  });
  const trackIds = new Set(tracks.map((t) => t.id));
  needs.forEach((n) => (n.track_ids = n.track_ids.filter((t) => trackIds.has(t))));

  const reality: RealityItem[] = (d.reality ?? []).map((r) => {
    let type = pick(r.type, REALITY_TYPES, "CLAIM");
    let source = pick(r.source, REALITY_SOURCES, "USER");
    // CLAIM ≠ FACT: FACT jen s ověřitelnou evidencí, kterou server zná (dokument / oficiální zdroj / systémový záznam / jiný ověřitelný zdroj).
    const claimed: VerifiableEvidence | null =
      r.evidence &&
      EVIDENCE_KINDS.includes(r.evidence.kind as EvidenceKind) &&
      typeof r.evidence.ref === "string"
        ? { kind: r.evidence.kind as EvidenceKind, ref: r.evidence.ref }
        : typeof r.document_name === "string" && r.document_name.trim()
          ? { kind: "DOCUMENT", ref: r.document_name }
          : null;
    const evId = claimed && verifiable.has(evidenceId(claimed)) ? evidenceId(claimed) : null;
    if (source === "USER" && type === "FACT") type = "CLAIM"; // tvrzení uživatele se nikdy samo nestane FACT
    if (type === "FACT" && !evId) type = source === "USER" ? "CLAIM" : "VERIFICATION";
    if (type === "FACT" && claimed)
      source =
        claimed.kind === "DOCUMENT"
          ? "DOCUMENT"
          : claimed.kind === "OFFICIAL_SOURCE"
            ? "OFFICIAL_SOURCE"
            : claimed.kind === "SYSTEM_RECORD"
              ? "SYSTEM"
              : "OTHER";
    else if (source !== "USER" && source !== "SYSTEM") source = "OTHER"; // nedoložený zdroj se nevydává za dokument/úřad
    const certainty: Certainty =
      type === "FACT" ? "VERIFIED" : type === "VERIFICATION" ? "UNKNOWN" : "POSSIBLE";
    const id = `real_${slug(r.key || r.text)}`;
    return {
      id,
      type,
      text: String(r.text ?? ""),
      certainty,
      source,
      evidence_ids: type === "FACT" && evId ? [evId] : [],
      related_need_ids: (r.need_keys ?? []).map(needKey).filter((x) => needIds.has(x)),
      related_route_ids: [],
      created_at: prevCreated(id, prev?.reality),
    };
  });

  const actKey = (k: string) => `act_${slug(k)}`;
  const rawActions = d.actions ?? [];
  const actionIds = new Set(rawActions.map((a) => actKey(a.key || a.title)));
  const actions: Action[] = rawActions.map((a) => {
    const id = actKey(a.key || a.title);
    const old = prev?.actions.find((x) => x.id === id);
    const track =
      a.track && trackIds.has(`track_${a.track.toLowerCase()}`)
        ? `track_${a.track.toLowerCase()}`
        : null;
    return {
      id,
      title: String(a.title ?? ""),
      description: String(a.description ?? ""),
      type: pick(a.type, ACTION_TYPES, "GENERAL"),
      priority: pick(a.priority, ACTION_PRIORITIES, "LATER"),
      status: old?.status ?? "TODO",
      status_reason: old?.status_reason ?? null,
      track_id: track,
      need_ids: (a.need_keys ?? []).map(needKey).filter((x) => needIds.has(x)),
      evidence_ids: [],
      deadline_id: null,
      route_id: null,
      depends_on_action_ids: (a.depends_on ?? [])
        .map(actKey)
        .filter((x) => actionIds.has(x) && x !== id),
      created_at: old?.created_at ?? now,
      completed_at: old?.completed_at ?? null,
    };
  });
  // Uživatelem upravené akce, které model tentokrát vynechal, se neztrácejí.
  prev?.actions.forEach((o) => {
    if (!actions.some((a) => a.id === o.id) && o.status !== "TODO")
      actions.push({
        ...o,
        track_id: o.track_id && trackIds.has(o.track_id) ? o.track_id : null,
        need_ids: o.need_ids.filter((x) => needIds.has(x)),
        depends_on_action_ids: [],
      });
  });

  const unknowns: Unknown[] = (d.unknowns ?? [])
    .filter((u) => u.why_it_matters?.trim()) // otázka bez důvodu se neklade
    .map((u) => ({
      id: `unk_${slug(u.key || u.question)}`,
      question: String(u.question ?? ""),
      why_it_matters: String(u.why_it_matters),
      affects_need_ids: (u.need_keys ?? []).map(needKey).filter((x) => needIds.has(x)),
      affects_route_ids: [],
      impact: pick(u.impact, UNKNOWN_IMPACTS, "MEDIUM"),
    }));

  // Deadline hook (Deadline Engine = Fáze 2): lhůta zjištěná z dokumentu se jen eviduje, datum se nedopočítává.
  const links: FutureLinks = prev?.links
    ? { ...prev.links, deadlines: [...prev.links.deadlines] }
    : { routes: [], evidence: [], deadlines: [], risks: [], gaps: [] };
  reality
    .filter((r) => r.source === "DOCUMENT" && /lhůt|do\s+\d+\s+dn|odvolání/i.test(r.text))
    .forEach((r) => {
      const id = `dl_${r.id.slice(5)}`;
      if (!links.deadlines.some((x) => x.id === id))
        links.deadlines.push({ id, label: r.text, date: null, source: "DOCUMENT" });
    });

  const state: DomeCaseState = {
    dome_case_schema_version: DOME_CASE_SCHEMA_VERSION,
    case_id: input.caseId,
    status: actions.length === 0 ? "IN_ANALYSIS" : "ACTIVE",
    user_goal: prev?.user_goal ?? input.userGoal, // cíl uživatele se nepřepisuje
    system_interpretation: input.interpretation,
    reality,
    person: { ...emptyPerson(), ...(d.person ?? {}) },
    needs,
    tracks,
    actions,
    unknowns,
    links,
    documents: (prev?.documents ?? []).map((x) => ({ ...x })),
    evidence: (prev?.evidence ?? []).map((x) => ({ ...x, reality_ids: [...x.reality_ids] })),
    evidence_links: (prev?.evidence_links ?? []).map((x) => ({ ...x })),
    timeline: (prev?.timeline ?? []).map((x) => ({ ...x, evidence_ids: [...x.evidence_ids] })),
    deadlines: (prev?.deadlines ?? []).map((x) => ({ ...x, evidence_ids: [...x.evidence_ids] })),
    risks: (prev?.risks ?? []).map((x) => ({
      ...x,
      related_need_ids: [...x.related_need_ids],
      evidence_ids: [...x.evidence_ids],
    })),
    metadata: {
      last_updated: now,
      version: (prev?.metadata.version ?? 0) + 1,
      legacy_normalized: false,
      signals: det.signals,
    },
  };
  return state;
}

/* ---------- Validace (před uložením) ---------- */
export function validateCaseState(s: DomeCaseState): string[] {
  const e: string[] = [];
  if (!/^[0-9a-f-]{36}$/i.test(s.case_id)) e.push("neplatné case_id");
  if (s.dome_case_schema_version !== DOME_CASE_SCHEMA_VERSION) e.push("neplatná schema_version");
  if (!Number.isInteger(s.metadata.version) || s.metadata.version < 1) e.push("neplatná version");
  const ids = new Set<string>();
  const uniq = (id: string) => (ids.has(id) ? e.push(`duplicitní id ${id}`) : ids.add(id));
  const needIds = new Set(s.needs.map((n) => n.id));
  const trackIds = new Set(s.tracks.map((t) => t.id));
  const actionIds = new Set(s.actions.map((a) => a.id));
  s.reality.forEach((r) => {
    uniq(r.id);
    if (!REALITY_TYPES.includes(r.type)) e.push(`reality ${r.id}: type`);
    if (!CERTAINTIES.includes(r.certainty)) e.push(`reality ${r.id}: certainty`);
    if (r.type === "FACT" && r.source === "USER")
      e.push(`reality ${r.id}: tvrzení uživatele nesmí být FACT`);
    if (
      r.type === "FACT" &&
      (r.evidence_ids.length === 0 ||
        r.certainty !== "VERIFIED" ||
        !r.evidence_ids.every((x) =>
          EVIDENCE_KINDS.some((k) => x.startsWith(`${k.toLowerCase()}:`)),
        ))
    )
      e.push(`reality ${r.id}: FACT bez evidence`);
    if (r.type !== "FACT" && r.certainty === "VERIFIED")
      e.push(`reality ${r.id}: VERIFIED jen u FACT`);
    r.related_need_ids.forEach(
      (x) => needIds.has(x) || e.push(`reality ${r.id}: neznámá potřeba ${x}`),
    );
  });
  s.needs.forEach((n) => {
    uniq(n.id);
    if (!NEED_CATEGORIES.includes(n.category)) e.push(`need ${n.id}: category`);
    if (!NEED_URGENCIES.includes(n.urgency)) e.push(`need ${n.id}: urgency`);
    if (!NEED_STATUSES.includes(n.status)) e.push(`need ${n.id}: status`);
    if (n.amount !== null && !(typeof n.amount === "number" && n.amount > 0))
      e.push(`need ${n.id}: amount`);
    if (
      (n.amount === null) !== (n.amount_status === "UNKNOWN") ||
      (n.amount !== null && !n.amount_mention)
    )
      e.push(`need ${n.id}: částka bez vazby`);
    if (
      (n.deadline === null) !== (n.deadline_status === "UNKNOWN") ||
      (n.deadline !== null &&
        (!n.deadline_mention ||
          !n.deadline_anchor ||
          !DEADLINE_ANCHORS.includes(n.deadline_anchor.type)))
    )
      e.push(`need ${n.id}: lhůta bez vazby`);
    n.track_ids.forEach((x) => trackIds.has(x) || e.push(`need ${n.id}: neznámý track ${x}`));
  });
  s.tracks.forEach((t) => {
    uniq(t.id);
    if (!TRACK_TYPES.includes(t.type)) e.push(`track ${t.id}: type`);
  });
  s.actions.forEach((a) => {
    uniq(a.id);
    if (!ACTION_PRIORITIES.includes(a.priority)) e.push(`action ${a.id}: priority`);
    if (!ACTION_STATUSES.includes(a.status)) e.push(`action ${a.id}: status`);
    if (!ACTION_TYPES.includes(a.type)) e.push(`action ${a.id}: type`);
    if (a.track_id && !trackIds.has(a.track_id)) e.push(`action ${a.id}: neznámý track`);
    if ((a.status === "WAITING" || a.status === "BLOCKED") && !a.status_reason?.trim())
      e.push(`action ${a.id}: chybí důvod`);
    if (a.status === "DONE" && !a.completed_at) e.push(`action ${a.id}: DONE bez času`);
    a.need_ids.forEach((x) => needIds.has(x) || e.push(`action ${a.id}: neznámá potřeba ${x}`));
    a.depends_on_action_ids.forEach(
      (x) => actionIds.has(x) || e.push(`action ${a.id}: neznámá závislost ${x}`),
    );
  });
  if (hasCycle(s.actions)) e.push("cyklická závislost akcí");
  s.unknowns.forEach((u) => {
    uniq(u.id);
    if (!u.why_it_matters) e.push(`unknown ${u.id}: chybí důvod`);
  });

  // Schema 1.1: additive collections are optional for historic in-memory callers.
  const documents = s.documents ?? [];
  const evidence = s.evidence ?? [];
  const evidenceLinks = s.evidence_links ?? [];
  const timeline = s.timeline ?? [];
  const deadlines = s.deadlines ?? [];
  const risks = s.risks ?? [];
  const evidenceIds = new Set(evidence.map((x) => x.id));
  const realityIds = new Set(s.reality.map((x) => x.id));
  documents.forEach((d) => {
    uniq(d.id);
    if (!d.name.trim()) e.push(`document ${d.id}: chybí název`);
    if (!REALITY_SOURCES.includes(d.source)) e.push(`document ${d.id}: source`);
    if (!["UNKNOWN", "PENDING", "SUCCEEDED", "FAILED"].includes(d.extraction_status))
      e.push(`document ${d.id}: extraction_status`);
  });
  evidence.forEach((x) => {
    uniq(x.id);
    if (!EVIDENCE_KINDS.includes(x.kind)) e.push(`evidence ${x.id}: kind`);
    if (!x.ref.trim()) e.push(`evidence ${x.id}: chybí reference`);
    if (!REALITY_SOURCES.includes(x.source)) e.push(`evidence ${x.id}: source`);
    x.reality_ids.forEach(
      (id) => !realityIds.has(id) && e.push(`evidence ${x.id}: neznámá reality ${id}`),
    );
  });
  evidenceLinks.forEach((x) => {
    uniq(x.id);
    if (!evidenceIds.has(x.evidence_id)) e.push(`evidence_link ${x.id}: neznámá evidence`);
    if (!realityIds.has(x.reality_id)) e.push(`evidence_link ${x.id}: neznámá reality`);
    if (!["SUPPORTS", "CONTRADICTS", "MENTIONS"].includes(x.relation))
      e.push(`evidence_link ${x.id}: relation`);
  });
  timeline.forEach((x) => {
    uniq(x.id);
    if ((x.date === null) !== (x.date_status === "UNKNOWN"))
      e.push(`timeline ${x.id}: date_status`);
    if (x.date !== null && !isValidCalendarDate(x.date))
      e.push(`timeline ${x.id}: neplatné datum`);
    if (!REALITY_SOURCES.includes(x.source)) e.push(`timeline ${x.id}: source`);
    x.evidence_ids.forEach(
      (id) => !evidenceIds.has(id) && e.push(`timeline ${x.id}: neznámá evidence ${id}`),
    );
  });
  deadlines.forEach((x) => {
    uniq(x.id);
    if ((x.date === null) !== (x.date_status === "UNKNOWN"))
      e.push(`deadline ${x.id}: date_status`);
    if (x.date !== null && !isValidCalendarDate(x.date))
      e.push(`deadline ${x.id}: neplatné datum`);
    if (!REALITY_SOURCES.includes(x.source)) e.push(`deadline ${x.id}: source`);
    if ((x.anchor_type === null) !== (x.anchor_ref === null))
      e.push(`deadline ${x.id}: neúplná vazba anchor`);
    if (x.anchor_type !== null && !x.anchor_ref?.trim())
      e.push(`deadline ${x.id}: prázdná vazba anchor`);
    if (x.anchor_type && !DEADLINE_ANCHORS.includes(x.anchor_type))
      e.push(`deadline ${x.id}: anchor_type`);
    x.evidence_ids.forEach(
      (id) => !evidenceIds.has(id) && e.push(`deadline ${x.id}: neznámá evidence ${id}`),
    );
  });
  risks.forEach((x) => {
    uniq(x.id);
    if (!["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(x.level)) e.push(`risk ${x.id}: level`);
    if (!["OPEN", "MITIGATED", "RESOLVED", "UNKNOWN"].includes(x.status))
      e.push(`risk ${x.id}: status`);
    if (!REALITY_SOURCES.includes(x.source)) e.push(`risk ${x.id}: source`);
    x.related_need_ids.forEach(
      (id) => !needIds.has(id) && e.push(`risk ${x.id}: neznámá potřeba ${id}`),
    );
    x.evidence_ids.forEach(
      (id) => !evidenceIds.has(id) && e.push(`risk ${x.id}: neznámá evidence ${id}`),
    );
  });
  return e;
}

/** Přijímá pouze skutečné kalendářní datum ve formátu YYYY-MM-DD. */
function isValidCalendarDate(value: string): boolean {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function hasCycle(actions: Action[]): boolean {
  const map = new Map(actions.map((a) => [a.id, a.depends_on_action_ids]));
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const d of map.get(id) ?? []) if (visit(d)) return true;
    state.set(id, 2);
    return false;
  };
  return actions.some((a) => visit(a.id));
}

/** Akce je blokovaná, dokud nejsou hotové všechny akce, na kterých závisí. */
export function isActionBlocked(a: Action, all: Action[]): boolean {
  return a.depends_on_action_ids.some((d) => all.find((x) => x.id === d)?.status !== "DONE");
}

/** Změna statusu akce uživatelem → nová verze stavu (stará zůstává v historii kroků). */
export function applyActionStatus(
  s: DomeCaseState,
  actionId: string,
  status: ActionStatus,
  reason: string | null,
  now = new Date(),
): DomeCaseState {
  const a = s.actions.find((x) => x.id === actionId);
  if (!a) throw new Error("Akce v aktuálním stavu případu neexistuje.");
  if (!ACTION_STATUSES.includes(status)) throw new Error("Neplatný stav akce.");
  if ((status === "WAITING" || status === "BLOCKED") && !reason?.trim())
    throw new Error("U stavu Čeká / Blokováno uveďte důvod.");
  if ((status === "DONE" || status === "IN_PROGRESS") && isActionBlocked(a, s.actions))
    throw new Error("Tuto akci nejde začít, dokud nejsou hotové akce, na kterých závisí.");
  const iso = now.toISOString();
  return {
    ...s,
    actions: s.actions.map((x) =>
      x.id === actionId
        ? {
            ...x,
            status,
            status_reason: status === "WAITING" || status === "BLOCKED" ? reason!.trim() : null,
            completed_at: status === "DONE" ? iso : null,
          }
        : x,
    ),
    metadata: { ...s.metadata, last_updated: iso, version: s.metadata.version + 1 },
  };
}

/* ---------- Normalizer: starší assessment → DomeCaseState (nikdy nespadne) ---------- */
export function normalizeCaseState(assessment: unknown, caseId: string): DomeCaseState | null {
  try {
    if (!assessment || typeof assessment !== "object") return null;
    const a = assessment as Record<string, unknown>;
    const cs = a["case_state"] as DomeCaseState | undefined;
    if (
      cs &&
      LEGACY_DOME_CASE_SCHEMA_VERSIONS.includes(
        cs.dome_case_schema_version as (typeof LEGACY_DOME_CASE_SCHEMA_VERSIONS)[number],
      ) &&
      Array.isArray(cs.actions)
    ) {
      const legacyLinks = cs.links ?? {
        routes: [],
        evidence: [],
        deadlines: [],
        risks: [],
        gaps: [],
      };
      const legacyEvidence = Array.isArray(legacyLinks.evidence) ? legacyLinks.evidence : [];
      const legacyDeadlines = Array.isArray(legacyLinks.deadlines) ? legacyLinks.deadlines : [];
      const legacyRisks = Array.isArray(legacyLinks.risks) ? legacyLinks.risks : [];
      return {
        ...cs,
        dome_case_schema_version: DOME_CASE_SCHEMA_VERSION,
        documents: Array.isArray(cs.documents) ? cs.documents : [],
        evidence: Array.isArray(cs.evidence)
          ? cs.evidence
          : legacyEvidence.map((x) => ({
              id: x.id,
              kind: "OTHER_VERIFIABLE_SOURCE" as const,
              ref: x.id,
              source: x.source,
              verified: false,
              reality_ids: Array.isArray(x.reality_ids) ? x.reality_ids : [],
            })),
        evidence_links: Array.isArray(cs.evidence_links) ? cs.evidence_links : [],
        timeline: Array.isArray(cs.timeline) ? cs.timeline : [],
        deadlines: Array.isArray(cs.deadlines)
          ? cs.deadlines
          : legacyDeadlines.map((x) => ({
              id: x.id,
              label: x.label,
              date: x.date ?? null,
              date_status: x.date ? ("KNOWN" as const) : ("UNKNOWN" as const),
              source: x.source,
              anchor_type: null,
              anchor_ref: null,
              evidence_ids: [],
            })),
        risks: Array.isArray(cs.risks)
          ? cs.risks
          : legacyRisks.map((x) => ({
              id: x.id,
              label: x.label,
              level: "UNKNOWN" as const,
              status: "UNKNOWN" as const,
              source: "SYSTEM" as const,
              related_need_ids: [],
              evidence_ids: [],
            })),
        person: { ...emptyPerson(), ...(cs.person ?? {}) },
        links: legacyLinks,
        unknowns: cs.unknowns ?? [],
        reality: cs.reality ?? [],
        needs: (cs.needs ?? []).map(normalizeNeed),
        tracks: cs.tracks ?? [],
      };
    }
    // Legacy (dome-core 1.x/2.0): převedeme jen to, co v něm skutečně je — bez akcí a bez vymýšlení.
    const arr = (k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : []);
    const t = new Date(0).toISOString();
    const reality: RealityItem[] = [
      ...arr("stated_by_user").map((x, i) => ({
        id: `real_legacy_c${i}`,
        type: "CLAIM" as const,
        text: x,
        certainty: "POSSIBLE" as const,
        source: "USER" as const,
      })),
      // Starší "verified" nemá dohledatelnou evidenci → nikdy FACT; jen k (opětovnému) ověření.
      ...arr("verified").map((x, i) => ({
        id: `real_legacy_f${i}`,
        type: "VERIFICATION" as const,
        text: x,
        certainty: "LIKELY" as const,
        source: "OTHER" as const,
      })),
      ...arr("to_verify").map((x, i) => ({
        id: `real_legacy_v${i}`,
        type: "VERIFICATION" as const,
        text: x,
        certainty: "UNKNOWN" as const,
        source: "SYSTEM" as const,
      })),
    ].map((r) => ({
      ...r,
      evidence_ids: [],
      related_need_ids: [],
      related_route_ids: [],
      created_at: t,
    }));
    const goal = (a["user_goal"] as { text?: string } | undefined)?.text ?? null;
    return {
      dome_case_schema_version: DOME_CASE_SCHEMA_VERSION,
      case_id: caseId,
      status: "IN_ANALYSIS",
      user_goal: goal,
      system_interpretation: (a["hypothesis"] as { text?: string } | undefined)?.text ?? null,
      reality,
      person: emptyPerson(),
      needs: [],
      tracks: [],
      actions: [],
      unknowns: arr("missing_information").map((q, i) => ({
        id: `unk_legacy_${i}`,
        question: q,
        why_it_matters: "Převzato ze staršího vyhodnocení.",
        affects_need_ids: [],
        affects_route_ids: [],
        impact: "MEDIUM" as const,
      })),
      links: { routes: [], evidence: [], deadlines: [], risks: [], gaps: [] },
      documents: [],
      evidence: [],
      evidence_links: [],
      timeline: [],
      deadlines: [],
      risks: [],
      metadata: { last_updated: t, version: 0, legacy_normalized: true, signals: [] },
    };
  } catch {
    return null;
  }
}

/* ---------- Hooky budoucích enginů (Fáze 2+) ---------- */
export interface CaseEngine {
  readonly name:
    | "LEGAL_ROUTE"
    | "EVIDENCE"
    | "DEADLINE"
    | "RISK"
    | "CROSS_LINK"
    | "GAP"
    | "ROUTE_COMPETITION"
    | "SECOND_LOOK";
  /** Vrací upravený stav; musí projít validateCaseState. */
  apply(state: DomeCaseState): Promise<DomeCaseState>;
}
export const CASE_ENGINES: CaseEngine[] = []; // Fáze 1: žádný engine není aktivní

/** Uložená potřeba ze starší verze 1.0 bez vazby částky/lhůty → UNKNOWN (deterministicky, nic se nedomýšlí). */
function normalizeNeed(n: Need): Need {
  const am = typeof n.amount === "number" && n.amount_mention ? n.amount : null;
  const dlOk = typeof n.deadline === "string" && n.deadline_mention && n.deadline_anchor;
  return {
    ...n,
    amount: am,
    amount_status: am === null ? "UNKNOWN" : "KNOWN",
    amount_mention: am === null ? null : n.amount_mention,
    deadline: dlOk ? n.deadline : null,
    deadline_status: dlOk ? "KNOWN" : "UNKNOWN",
    deadline_mention: dlOk ? n.deadline_mention : null,
    deadline_anchor: dlOk ? n.deadline_anchor : null,
  };
}
