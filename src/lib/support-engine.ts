/**
 * RealWorldSupportEngine — doménově nezávislá vrstva nad DOME assessmentem:
 * 1 Need Detection → 2 Prioritization → 3 Service Matching → 4 Human Handoff →
 * 5 Transport → 6 Summary (dome-core HANDOFF_*) → 7 Follow-up → 8 Goal Continuity.
 * Čistý modul (bez tajemství). Konkrétní služby a trasy smí přijít JEN z ověřeného zdroje
 * (SupportServiceRegistry / TransportProvider). Dokud žádný zdroj není napojen, nic se nevymýšlí.
 */
import type { ChoiceId, HandoffState, InterventionLevel } from "./dome-core";

/* ---------- 1. Need Detection (kombinace signálů, ne jedno slovo) ---------- */

export const NEED_SIGNALS = {
  no_money:
    /\b0\s*(kč|korun)|nemám\s+(žádné\s+)?peníze|bez\s+peněz|nemám\s+ani\s+korunu|nula\s+korun/i,
  no_food: /nemám\s+(co\s+)?(jíst|jídlo|na\s+jídlo)|hlad/i,
  no_shelter_tonight:
    /(nemám|není)\s+kde\s+(dnes\s+|dneska\s+)?(spát|přespat|být)|na\s+ulici|bez\s+střechy|dnešní\s+noc/i,
  housing_loss_risk: /výpověď\s+z\s+nájmu|vystěhov|přijdu\s+o\s+byt|ztrát\w*\s+bydlen/i,
  alone: /jsem\s+sám|jsem\s+sama|nemám\s+nikoho/i,
  no_transport_money: /nemám\s+na\s+(jízdenku|dopravu|tramvaj|autobus)/i,
  no_documents: /nemám\s+(občank|občanský|doklad|OP\b)|ztratil\w*\s+(doklad|občank)/i,
  no_credit: /nemám\s+kredit|bez\s+kreditu|nemám\s+data|bez\s+dat/i,
  mop: /\bMOP\b|mimořádn\w+\s+okamžit\w+\s+pomoc/i,
  debts: /dluh|exekuc|insolvenc/i,
  admin_deadline: /lhůt|odvolání|do\s+\d+\s+dn/i,
  safety: /zabij|vyhrožuj\w*\s+.*(zabit|ublíž)|bije\s+mě|chci\s+se\s+zabít|sebevra|nechci\s+žít/i,
} as const;
export type NeedSignal = keyof typeof NEED_SIGNALS;

export type NeedProfile =
  "NONE" | "ADMINISTRATIVE_SUPPORT" | "OPTIONS_SUPPORT" | "HIGH_IMMEDIATE_SUPPORT" | "SAFETY";

export function detectImmediateNeeds(userText: string): {
  signals: NeedSignal[];
  profile: NeedProfile;
  floor: InterventionLevel;
} {
  const signals = (Object.keys(NEED_SIGNALS) as NeedSignal[]).filter((k) =>
    NEED_SIGNALS[k].test(userText),
  );
  const has = (s: NeedSignal) => signals.includes(s);
  if (has("safety")) return { signals, profile: "SAFETY", floor: "SAFETY_HANDOFF" };
  const existential = [has("no_money"), has("no_food"), has("no_shelter_tonight")].filter(
    Boolean,
  ).length;
  if ((has("no_shelter_tonight") && (has("no_money") || has("no_food"))) || existential >= 2)
    return { signals, profile: "HIGH_IMMEDIATE_SUPPORT", floor: "ACTIVE_HANDOFF" };
  if (
    (has("debts") && (has("no_money") || has("housing_loss_risk"))) ||
    has("housing_loss_risk") ||
    (has("admin_deadline") && signals.length >= 3)
  )
    return { signals, profile: "OPTIONS_SUPPORT", floor: "OPTIONS" };
  if (has("mop") || has("admin_deadline"))
    return { signals, profile: "ADMINISTRATIVE_SUPPORT", floor: "SELF" };
  return { signals, profile: "NONE", floor: "SELF" };
}

const RANK: InterventionLevel[] = [
  "SELF",
  "OPTIONS",
  "CONNECT",
  "ACTIVE_HANDOFF",
  "SAFETY_HANDOFF",
];
export const maxLevel = (a: InterventionLevel, b: InterventionLevel) =>
  RANK.indexOf(a) >= RANK.indexOf(b) ? a : b;

/* ---------- 3. Service Registry + Matching ---------- */

export const SERVICE_TYPES = [
  "DAY_CENTER",
  "NIGHT_SHELTER",
  "SOCIAL_SERVICE",
  "FOOD_SUPPORT",
  "HOUSING_SUPPORT",
  "DEBT_COUNSELLING",
  "BENEFITS_SUPPORT",
  "MUNICIPAL_SOCIAL_WORK",
  "CRISIS_SERVICE",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** Každá schopnost je true jen pokud ji zdroj výslovně ověřil; null = neznámo (nikdy netvrdit). */
export type SupportService = {
  id: string;
  name: string;
  service_type: ServiceType;
  address: string;
  phone: string | null;
  website: string | null;
  opening_hours: string | null;
  open_now: boolean | null;
  accepts_walk_in: boolean | null;
  food_support: boolean | null;
  day_center: boolean | null;
  overnight_support: boolean | null;
  housing_support: boolean | null;
  social_worker: boolean | null;
  benefits_support: boolean | null;
  mop_support: boolean | null;
  debt_support: boolean | null;
  free_of_charge: boolean | null;
  transport_info: string | null;
  source: string;
  source_verified_at: string;
  status: "VERIFIED" | "UNVERIFIED";
};

export interface SupportServiceRegistry {
  readonly name: string;
  search(q: { area: string | null; needs: NeedSignal[] }): Promise<SupportService[]>;
}

/** Výchozí registr: žádný ověřený zdroj není napojen → nikdy nic nevrátí (žádná mock data). */
export const NO_REGISTRY: SupportServiceRegistry = { name: "none", search: async () => [] };

/** Priorita v krizi: riziko → dnes → bez objednání → víc potřeb (gateway) → zdarma → navázání → administrativa. */
export function scoreService(s: SupportService, needs: NeedSignal[]): number {
  if (s.status !== "VERIFIED") return -1;
  const need = (n: NeedSignal) => needs.includes(n);
  let score = 0;
  if (need("no_shelter_tonight") && s.overnight_support) score += 40;
  if (need("no_food") && s.food_support) score += 20;
  if (s.open_now) score += 30;
  if (s.accepts_walk_in) score += 20;
  const multi = [
    s.social_worker,
    s.food_support,
    s.overnight_support,
    s.housing_support,
    s.benefits_support,
    s.debt_support,
  ].filter(Boolean).length;
  score += multi * 8; // gateway service: jeden pracovník, víc navazujících cest
  if (s.social_worker) score += 15;
  if (need("no_money") && s.free_of_charge) score += 10;
  if (need("mop") && (s.mop_support || s.benefits_support)) score += 8;
  if (need("debts") && s.debt_support) score += 5;
  return score;
}

export function matchServices(list: SupportService[], needs: NeedSignal[]): SupportService[] {
  return list
    .map((s) => ({ s, sc: scoreService(s, needs) }))
    .filter((x) => x.sc >= 0)
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.s);
}

/* ---------- 5. Transport ---------- */

export type TransportLeg = {
  mode: "WALK" | "TRAM" | "BUS" | "METRO" | "TRAIN";
  line: string | null;
  direction: string | null;
  from: string;
  to: string;
  minutes: number | null;
};
export type TransportPlan = {
  legs: TransportLeg[];
  total_minutes: number | null;
  disruptions: string[];
  source: string;
  verified_at: string;
};

export interface TransportProvider {
  readonly name: string;
  route(q: { from: string; toAddress: string }): Promise<TransportPlan | null>;
}
/** Výchozí: žádná ověřená data MHD → žádná trasa (spoje se nevymýšlí). */
export const NO_TRANSPORT: TransportProvider = { name: "none", route: async () => null };

/* ---------- Stavy ---------- */

export type ImmediateNeedStatus =
  | "NONE"
  | "DETECTED"
  | "SUPPORT_IDENTIFIED"
  | "HANDOFF_OFFERED"
  | "HANDOFF_ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "CONNECTED"
  | "RESOLVING"
  | "DECLINED"
  | "UNKNOWN";
export type SupportTargetStatus =
  "UNVERIFIED" | "VERIFIED" | "CURRENTLY_OPEN" | "CURRENTLY_CLOSED" | "UNKNOWN";
export type TransportStatus =
  "NOT_NEEDED" | "NEEDED" | "AVAILABLE" | "UNVERIFIED" | "IN_PROGRESS" | "ARRIVED";

export function immediateNeedStatus(
  state: HandoffState,
  offered: boolean,
  target: SupportService | null,
): ImmediateNeedStatus {
  switch (state) {
    case "HANDOFF_DECLINED":
      return "DECLINED";
    case "USER_EN_ROUTE":
      return "EN_ROUTE";
    case "HANDOFF_READY":
      return "ARRIVED";
    case "HUMAN_CONNECTED":
      return "CONNECTED";
    case "HANDOFF_COMPLETED":
      return "RESOLVING";
    case "NONE":
      return "NONE";
    default:
      return target
        ? offered
          ? "HANDOFF_OFFERED"
          : "SUPPORT_IDENTIFIED"
        : offered
          ? "HANDOFF_OFFERED"
          : "DETECTED";
  }
}
export function supportTargetStatus(t: SupportService | null): SupportTargetStatus {
  if (!t) return "UNKNOWN";
  if (t.status !== "VERIFIED") return "UNVERIFIED";
  return t.open_now === true
    ? "CURRENTLY_OPEN"
    : t.open_now === false
      ? "CURRENTLY_CLOSED"
      : "VERIFIED";
}
export function transportStatus(
  state: HandoffState,
  needed: boolean,
  plan: TransportPlan | null,
): TransportStatus {
  if (state === "HANDOFF_READY" || state === "HUMAN_CONNECTED" || state === "HANDOFF_COMPLETED")
    return "ARRIVED";
  if (state === "USER_EN_ROUTE") return plan ? "IN_PROGRESS" : "UNVERIFIED";
  if (!needed) return "NOT_NEEDED";
  return plan ? "AVAILABLE" : "NEEDED";
}

/* ---------- 4. HumanHandoff (ukládá se v assessment JSONB, bez změny schématu) ---------- */

export type HumanHandoff = {
  id: string;
  case_id: string;
  user_goal: string;
  reason: string;
  immediate_needs: string[];
  target_service: string | null;
  target_address: string | null;
  target_phone: string | null;
  target_source: string;
  target_verified: boolean;
  transport_plan: TransportPlan | null;
  handoff_summary: string;
  user_choice: ChoiceId | null;
  status: ImmediateNeedStatus;
  immediate_need_status: ImmediateNeedStatus;
  support_target_status: SupportTargetStatus;
  transport_status: TransportStatus;
  detected_signals: NeedSignal[];
  need_profile: NeedProfile;
  call_first_allowed: boolean;
  created_at: string;
  updated_at: string;
};

/** Spustí engine nad (už invariantně ošetřeným) assessmentem. */
export async function applySupportEngine(
  a: Record<string, unknown>,
  ctx: {
    caseId: string;
    userText: string;
    choices: ChoiceId[];
    area?: string | null;
    previous?: HumanHandoff | null;
    registry?: SupportServiceRegistry;
    transport?: TransportProvider;
    now?: Date;
    derive: (
      lvl: InterventionLevel,
      gap: boolean,
      targetVerified: boolean,
      routeVerified: boolean,
    ) => HandoffState;
  },
): Promise<Record<string, unknown>> {
  const registry = ctx.registry ?? NO_REGISTRY;
  const transport = ctx.transport ?? NO_TRANSPORT;
  const now = (ctx.now ?? new Date()).toISOString();
  const det = detectImmediateNeeds(ctx.userText);
  const declined = ctx.choices.some((c) => c === "DECLINE" || c === "SELF");

  // Detektor je jen spodní hranice; po odmítnutí se nabídka nevnucuje (SAFETY ano).
  let lvl = a["intervention_level"] as InterventionLevel;
  if (det.floor === "SAFETY_HANDOFF" || !declined) lvl = maxLevel(lvl, det.floor);
  a["intervention_level"] = lvl;
  const gap = a["immediate_need_gap"] as { detected: boolean; needs: string[]; reason: string };
  if (det.profile === "HIGH_IMMEDIATE_SUPPORT" || det.profile === "SAFETY") gap.detected = true;
  a["support_path_required"] = gap.detected || lvl === "ACTIVE_HANDOFF" || lvl === "SAFETY_HANDOFF";

  const sp = a["support_path"] as Record<string, unknown>;
  sp["intervention_level"] = lvl;
  if (lvl !== "SELF" && sp["relevance"] === "none")
    sp["relevance"] = lvl === "ACTIVE_HANDOFF" ? "urgent" : "recommended";

  // 3. Matching jen z ověřeného registru
  const matches = matchServices(
    await registry.search({ area: ctx.area ?? null, needs: det.signals }),
    det.signals,
  );
  const target = matches[0] ?? null;
  let plan: TransportPlan | null = null;
  if (target && ctx.area)
    plan = await transport.route({ from: ctx.area, toAddress: target.address });

  if (target) {
    sp["target_name"] = target.name;
    sp["target_address"] = target.address;
    sp["target_source"] = target.source;
    sp["verified_at"] = target.source_verified_at;
    sp["target_phone"] = target.phone;
  }
  sp["route"] = plan
    ? {
        summary: plan.legs
          .map((l) => `${l.mode}${l.line ? " " + l.line : ""} ${l.from} → ${l.to}`)
          .join(", "),
        source: plan.source,
        verified_at: plan.verified_at,
      }
    : null;
  sp["navigation_available"] = !!plan;
  sp["alternatives"] = matches.slice(1, 4).map((s) => ({
    name: s.name,
    address: s.address,
    source: s.source,
    verified_at: s.source_verified_at,
  }));

  const state = ctx.derive(lvl, gap.detected, !!target, !!plan);
  a["handoff_state"] = state;
  const offered = lvl === "ACTIVE_HANDOFF" || lvl === "CONNECT" || lvl === "OPTIONS";
  const ins = immediateNeedStatus(state, offered, target);
  const lastChoice = ctx.choices.at(-1) ?? null;

  const handoff: HumanHandoff = {
    id: ctx.previous?.id ?? `${ctx.caseId}:handoff`,
    case_id: ctx.caseId,
    user_goal: (a["user_goal"] as { text?: string })?.text ?? "",
    reason: String(gap.reason || sp["reason"] || ""),
    immediate_needs: gap.needs,
    target_service: target?.name ?? null,
    target_address: target?.address ?? null,
    target_phone: target?.phone ?? null,
    target_source: target?.source ?? "none",
    target_verified: !!target,
    transport_plan: plan,
    handoff_summary: String(a["say_to_worker"] ?? ""),
    user_choice: lastChoice,
    status: ins,
    immediate_need_status: ins,
    support_target_status: supportTargetStatus(target),
    transport_status: transportStatus(state, a["support_path_required"] === true, plan),
    detected_signals: det.signals,
    need_profile: det.profile,
    // Bez kreditu nikdy nenavrhovat jako první krok volání.
    call_first_allowed: !det.signals.includes("no_credit"),
    created_at: ctx.previous?.created_at ?? now,
    updated_at: now,
  };
  a["human_handoff"] = handoff;
  a["immediate_need_status"] = handoff.immediate_need_status;
  a["support_target_status"] = handoff.support_target_status;
  a["transport_status"] = handoff.transport_status;
  a["engine_version"] = "real-world-support/2.0";
  return a;
}
