/**
 * CASE CORE — canonical DomeCaseState (schema 1.0).
 * Jediný datový kontrakt analytického stavu případu. Ukládá se uvnitř assessment JSONB
 * (urad_case_steps) přes urad_record_dome_assessment — žádné nové tabulky.
 * Čistý modul: sdílí ho server (stavba, validace) i UI (typy, normalizace starých hodnocení).
 */
import { detectImmediateNeeds, type NeedSignal } from "./support-engine";

export const DOME_CASE_SCHEMA_VERSION = "1.0";

/* ---------- Enumy ---------- */
export const REALITY_TYPES = ["FACT", "CLAIM", "INTERPRETATION", "VERIFICATION"] as const;
export const CERTAINTIES = ["VERIFIED", "LIKELY", "POSSIBLE", "UNKNOWN", "NOT_AVAILABLE"] as const;
export const REALITY_SOURCES = ["USER", "DOCUMENT", "OFFICIAL_SOURCE", "SYSTEM", "OTHER"] as const;
export const NEED_CATEGORIES = ["HOUSING", "FOOD", "HYGIENE", "TRANSPORT", "HEALTH", "DOCUMENT", "INCOME", "LEGAL", "EDUCATION", "OTHER"] as const;
export const NEED_URGENCIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
export const NEED_STATUSES = ["OPEN", "PARTIALLY_COVERED", "COVERED", "UNKNOWN"] as const;
export const TRACK_TYPES = ["SURVIVAL", "ADMINISTRATIVE", "HOUSING", "INCOME", "SUPPORT"] as const;
export const ACTION_PRIORITIES = ["NOW", "TODAY", "FIRST_WORKING_DAY", "THIS_WEEK", "LATER"] as const;
export const ACTION_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "DONE"] as const;
export const ACTION_TYPES = ["GENERAL", "OBTAIN_EVIDENCE", "PREPARE_APPLICATION", "SUBMIT_APPLICATION", "VERIFY_LEGAL_BASIS", "FOLLOW_UP_DEADLINE", "CONTACT_SUPPORT", "SECURE_BASIC_NEED"] as const;
export const UNKNOWN_IMPACTS = ["HIGH", "MEDIUM", "LOW"] as const;
export const CASE_STATUSES = ["NEW", "IN_ANALYSIS", "ACTIVE", "WAITING", "STABILIZED", "CLOSED"] as const;

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
  currency: "CZK";
  urgency: NeedUrgency;
  deadline: string | null; // null = DEADLINE_UNKNOWN
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
  metadata: { last_updated: string; version: number; legacy_normalized: boolean; signals: NeedSignal[] };
};

const TRACK_META: Record<TrackType, { title: string; horizon: string }> = {
  SURVIVAL: { title: "Dnešek a nejbližší dny", horizon: "24–72 hodin" },
  ADMINISTRATIVE: { title: "Úřední kroky", horizon: "nejbližší pracovní dny" },
  HOUSING: { title: "Bydlení", horizon: "stabilizace bydlení" },
  INCOME: { title: "Příjem", horizon: "obnova příjmu" },
  SUPPORT: { title: "Podpora", horizon: "sociální služby, obec, NNO" },
};

export const emptyPerson = (): PersonMap => ({
  current_status: null, employment_status: null, education_status: null, housing_status: null, income_status: null,
  available_resources: [], relevant_social_context: [], relevant_procedures: [], relevant_documents: [],
});

/* ---------- Vstup od modelu (draft s klíči místo ID) ---------- */
export type CaseDraft = {
  reality: { key: string; type: string; text: string; source: string; need_keys: string[] }[];
  person: PersonMap;
  needs: { key: string; category: string; description: string; amount: number | null; urgency: string; deadline: string | null; tracks: string[] }[];
  actions: { key: string; title: string; description: string; type: string; priority: string; track: string | null; need_keys: string[]; depends_on: string[] }[];
  unknowns: { key: string; question: string; why_it_matters: string; need_keys: string[]; impact: string }[];
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "x";
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

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
  previous: DomeCaseState | null;
  now?: Date;
}): DomeCaseState {
  const now = (input.now ?? new Date()).toISOString();
  const d = input.draft ?? {};
  const prev = input.previous;
  const det = detectImmediateNeeds(input.userText);
  const prevCreated = (id: string, list: { id: string; created_at: string }[] | undefined) => list?.find((x) => x.id === id)?.created_at ?? now;

  const needs: Need[] = (d.needs ?? []).map((n) => {
    const id = `need_${slug(n.key || n.description)}`;
    const old = prev?.needs.find((x) => x.id === id);
    return {
      id,
      category: pick(n.category, NEED_CATEGORIES, "OTHER"),
      description: String(n.description ?? ""),
      amount: typeof n.amount === "number" && n.amount > 0 ? n.amount : null,
      currency: "CZK",
      urgency: pick(n.urgency, NEED_URGENCIES, "UNKNOWN"),
      deadline: typeof n.deadline === "string" && n.deadline.trim() ? n.deadline : null,
      evidence_ids: [],
      status: old?.status ?? "OPEN",
      track_ids: (n.tracks ?? []).filter((t) => TRACK_TYPES.includes(t as TrackType)).map((t) => `track_${t.toLowerCase()}`),
      route_ids: [],
      created_at: old?.created_at ?? now,
    };
  });
  // Krizová pojistka z detektoru: dnešní nocleh nesmí chybět, pokud ho uživatel uvedl.
  const tonight = needs.find((n) => n.category === "HOUSING" && (n.urgency === "CRITICAL" || n.urgency === "HIGH"));
  if (det.signals.includes("no_shelter_tonight") && tonight) {
    tonight.urgency = "CRITICAL";
    if (!tonight.track_ids.includes("track_survival")) tonight.track_ids.push("track_survival");
  } else if (det.signals.includes("no_shelter_tonight") && !needs.some((n) => n.category === "HOUSING" && n.urgency === "CRITICAL")) {
    needs.unshift({
      id: "need_dnesni_nocleh", category: "HOUSING", description: "Bezpečné místo na dnešní noc", amount: null, currency: "CZK",
      urgency: "CRITICAL", deadline: null, evidence_ids: [], status: prev?.needs.find((x) => x.id === "need_dnesni_nocleh")?.status ?? "OPEN",
      track_ids: ["track_survival"], route_ids: [], created_at: prevCreated("need_dnesni_nocleh", prev?.needs),
    });
  }
  const needIds = new Set(needs.map((n) => n.id));
  const needKey = (k: string) => `need_${slug(k)}`;

  // Tracks: aktivuje je potřeba (model) i krizový detektor.
  const trackTypes = new Set<TrackType>();
  needs.forEach((n) => n.track_ids.forEach((t) => trackTypes.add(t.replace("track_", "").toUpperCase() as TrackType)));
  if (det.profile === "HIGH_IMMEDIATE_SUPPORT" || det.profile === "SAFETY") ["SURVIVAL", "SUPPORT"].forEach((t) => trackTypes.add(t as TrackType));
  if (det.signals.includes("no_shelter_tonight") || det.signals.includes("housing_loss_risk")) trackTypes.add("HOUSING");
  if (det.signals.includes("mop") || det.signals.includes("admin_deadline")) trackTypes.add("ADMINISTRATIVE");
  (d.actions ?? []).forEach((a) => a.track && TRACK_TYPES.includes(a.track as TrackType) && trackTypes.add(a.track as TrackType));
  const tracks: Track[] = TRACK_TYPES.filter((t) => trackTypes.has(t)).map((t) => {
    const id = `track_${t.toLowerCase()}`;
    return { id, type: t, ...TRACK_META[t], active: true, need_ids: needs.filter((n) => n.track_ids.includes(id)).map((n) => n.id), created_at: prevCreated(id, prev?.tracks) };
  });
  const trackIds = new Set(tracks.map((t) => t.id));
  needs.forEach((n) => (n.track_ids = n.track_ids.filter((t) => trackIds.has(t))));

  const reality: RealityItem[] = (d.reality ?? []).map((r) => {
    let type = pick(r.type, REALITY_TYPES, "CLAIM");
    const source = pick(r.source, REALITY_SOURCES, "USER");
    // CLAIM ≠ FACT: FACT jen z dokumentu / oficiálního zdroje a jen když dokument existuje.
    if (type === "FACT" && !((source === "DOCUMENT" && input.documents > 0) || source === "OFFICIAL_SOURCE")) type = "CLAIM";
    const certainty: Certainty = type === "FACT" ? "VERIFIED" : type === "CLAIM" ? "POSSIBLE" : type === "VERIFICATION" ? "UNKNOWN" : "POSSIBLE";
    const id = `real_${slug(r.key || r.text)}`;
    return {
      id, type, text: String(r.text ?? ""), certainty, source, evidence_ids: [],
      related_need_ids: (r.need_keys ?? []).map(needKey).filter((x) => needIds.has(x)), related_route_ids: [],
      created_at: prevCreated(id, prev?.reality),
    };
  });

  const actKey = (k: string) => `act_${slug(k)}`;
  const rawActions = d.actions ?? [];
  const actionIds = new Set(rawActions.map((a) => actKey(a.key || a.title)));
  const actions: Action[] = rawActions.map((a) => {
    const id = actKey(a.key || a.title);
    const old = prev?.actions.find((x) => x.id === id);
    const track = a.track && trackIds.has(`track_${a.track.toLowerCase()}`) ? `track_${a.track.toLowerCase()}` : null;
    return {
      id, title: String(a.title ?? ""), description: String(a.description ?? ""),
      type: pick(a.type, ACTION_TYPES, "GENERAL"),
      priority: pick(a.priority, ACTION_PRIORITIES, "LATER"),
      status: old?.status ?? "TODO", status_reason: old?.status_reason ?? null,
      track_id: track,
      need_ids: (a.need_keys ?? []).map(needKey).filter((x) => needIds.has(x)),
      evidence_ids: [], deadline_id: null, route_id: null,
      depends_on_action_ids: (a.depends_on ?? []).map(actKey).filter((x) => actionIds.has(x) && x !== id),
      created_at: old?.created_at ?? now, completed_at: old?.completed_at ?? null,
    };
  });
  // Uživatelem upravené akce, které model tentokrát vynechal, se neztrácejí.
  prev?.actions.forEach((o) => {
    if (!actions.some((a) => a.id === o.id) && o.status !== "TODO") actions.push({ ...o, track_id: o.track_id && trackIds.has(o.track_id) ? o.track_id : null, need_ids: o.need_ids.filter((x) => needIds.has(x)), depends_on_action_ids: [] });
  });

  const unknowns: Unknown[] = (d.unknowns ?? [])
    .filter((u) => u.why_it_matters?.trim()) // otázka bez důvodu se neklade
    .map((u) => ({
      id: `unk_${slug(u.key || u.question)}`, question: String(u.question ?? ""), why_it_matters: String(u.why_it_matters),
      affects_need_ids: (u.need_keys ?? []).map(needKey).filter((x) => needIds.has(x)), affects_route_ids: [],
      impact: pick(u.impact, UNKNOWN_IMPACTS, "MEDIUM"),
    }));

  // Deadline hook (Deadline Engine = Fáze 2): lhůta zjištěná z dokumentu se jen eviduje, datum se nedopočítává.
  const links: FutureLinks = prev?.links ? { ...prev.links, deadlines: [...prev.links.deadlines] } : { routes: [], evidence: [], deadlines: [], risks: [], gaps: [] };
  reality
    .filter((r) => r.source === "DOCUMENT" && /lhůt|do\s+\d+\s+dn|odvolání/i.test(r.text))
    .forEach((r) => {
      const id = `dl_${r.id.slice(5)}`;
      if (!links.deadlines.some((x) => x.id === id)) links.deadlines.push({ id, label: r.text, date: null, source: "DOCUMENT" });
    });

  const state: DomeCaseState = {
    dome_case_schema_version: DOME_CASE_SCHEMA_VERSION,
    case_id: input.caseId,
    status: actions.length === 0 ? "IN_ANALYSIS" : "ACTIVE",
    user_goal: prev?.user_goal ?? input.userGoal, // cíl uživatele se nepřepisuje
    system_interpretation: input.interpretation,
    reality,
    person: { ...emptyPerson(), ...(d.person ?? {}) },
    needs, tracks, actions, unknowns,
    links,
    metadata: { last_updated: now, version: (prev?.metadata.version ?? 0) + 1, legacy_normalized: false, signals: det.signals },
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
    if (r.type === "FACT" && r.source === "USER") e.push(`reality ${r.id}: tvrzení uživatele nesmí být FACT`);
    r.related_need_ids.forEach((x) => needIds.has(x) || e.push(`reality ${r.id}: neznámá potřeba ${x}`));
  });
  s.needs.forEach((n) => {
    uniq(n.id);
    if (!NEED_CATEGORIES.includes(n.category)) e.push(`need ${n.id}: category`);
    if (!NEED_URGENCIES.includes(n.urgency)) e.push(`need ${n.id}: urgency`);
    if (!NEED_STATUSES.includes(n.status)) e.push(`need ${n.id}: status`);
    n.track_ids.forEach((x) => trackIds.has(x) || e.push(`need ${n.id}: neznámý track ${x}`));
  });
  s.tracks.forEach((t) => { uniq(t.id); if (!TRACK_TYPES.includes(t.type)) e.push(`track ${t.id}: type`); });
  s.actions.forEach((a) => {
    uniq(a.id);
    if (!ACTION_PRIORITIES.includes(a.priority)) e.push(`action ${a.id}: priority`);
    if (!ACTION_STATUSES.includes(a.status)) e.push(`action ${a.id}: status`);
    if (!ACTION_TYPES.includes(a.type)) e.push(`action ${a.id}: type`);
    if (a.track_id && !trackIds.has(a.track_id)) e.push(`action ${a.id}: neznámý track`);
    a.need_ids.forEach((x) => needIds.has(x) || e.push(`action ${a.id}: neznámá potřeba ${x}`));
    a.depends_on_action_ids.forEach((x) => actionIds.has(x) || e.push(`action ${a.id}: neznámá závislost ${x}`));
  });
  if (hasCycle(s.actions)) e.push("cyklická závislost akcí");
  s.unknowns.forEach((u) => { uniq(u.id); if (!u.why_it_matters) e.push(`unknown ${u.id}: chybí důvod`); });
  return e;
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
export function applyActionStatus(s: DomeCaseState, actionId: string, status: ActionStatus, reason: string | null, now = new Date()): DomeCaseState {
  const a = s.actions.find((x) => x.id === actionId);
  if (!a) throw new Error("Akce v aktuálním stavu případu neexistuje.");
  if (!ACTION_STATUSES.includes(status)) throw new Error("Neplatný stav akce.");
  if ((status === "WAITING" || status === "BLOCKED") && !reason?.trim()) throw new Error("U stavu Čeká / Blokováno uveďte důvod.");
  const iso = now.toISOString();
  return {
    ...s,
    actions: s.actions.map((x) =>
      x.id === actionId
        ? { ...x, status, status_reason: status === "WAITING" || status === "BLOCKED" ? reason!.trim() : null, completed_at: status === "DONE" ? iso : null }
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
    if (cs && cs.dome_case_schema_version === DOME_CASE_SCHEMA_VERSION && Array.isArray(cs.actions)) {
      return { ...cs, person: { ...emptyPerson(), ...(cs.person ?? {}) }, links: cs.links ?? { routes: [], evidence: [], deadlines: [], risks: [], gaps: [] }, unknowns: cs.unknowns ?? [], reality: cs.reality ?? [], needs: cs.needs ?? [], tracks: cs.tracks ?? [] };
    }
    // Legacy (dome-core 1.x/2.0): převedeme jen to, co v něm skutečně je — bez akcí a bez vymýšlení.
    const arr = (k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : []);
    const t = new Date(0).toISOString();
    const reality: RealityItem[] = [
      ...arr("stated_by_user").map((x, i) => ({ id: `real_legacy_c${i}`, type: "CLAIM" as const, text: x, certainty: "POSSIBLE" as const, source: "USER" as const })),
      ...arr("verified").map((x, i) => ({ id: `real_legacy_f${i}`, type: "FACT" as const, text: x, certainty: "VERIFIED" as const, source: "DOCUMENT" as const })),
      ...arr("to_verify").map((x, i) => ({ id: `real_legacy_v${i}`, type: "VERIFICATION" as const, text: x, certainty: "UNKNOWN" as const, source: "SYSTEM" as const })),
    ].map((r) => ({ ...r, evidence_ids: [], related_need_ids: [], related_route_ids: [], created_at: t }));
    const goal = (a["user_goal"] as { text?: string } | undefined)?.text ?? null;
    return {
      dome_case_schema_version: DOME_CASE_SCHEMA_VERSION, case_id: caseId, status: "IN_ANALYSIS", user_goal: goal,
      system_interpretation: (a["hypothesis"] as { text?: string } | undefined)?.text ?? null,
      reality, person: emptyPerson(), needs: [], tracks: [], actions: [],
      unknowns: arr("missing_information").map((q, i) => ({ id: `unk_legacy_${i}`, question: q, why_it_matters: "Převzato ze staršího vyhodnocení.", affects_need_ids: [], affects_route_ids: [], impact: "MEDIUM" as const })),
      links: { routes: [], evidence: [], deadlines: [], risks: [], gaps: [] },
      metadata: { last_updated: t, version: 0, legacy_normalized: true, signals: [] },
    };
  } catch {
    return null;
  }
}

/* ---------- Hooky budoucích enginů (Fáze 2+) ---------- */
export interface CaseEngine {
  readonly name: "LEGAL_ROUTE" | "EVIDENCE" | "DEADLINE" | "RISK" | "CROSS_LINK" | "GAP" | "ROUTE_COMPETITION" | "SECOND_LOOK";
  /** Vrací upravený stav; musí projít validateCaseState. */
  apply(state: DomeCaseState): Promise<DomeCaseState>;
}
export const CASE_ENGINES: CaseEngine[] = []; // Fáze 1: žádný engine není aktivní
