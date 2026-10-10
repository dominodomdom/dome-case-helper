/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { deriveHandoffState, enforceAssessmentInvariants, type ChoiceId } from "@/lib/dome-core";
import {
  applySupportEngine,
  detectImmediateNeeds,
  matchServices,
  type SupportService,
  type SupportServiceRegistry,
  type TransportProvider,
} from "@/lib/support-engine";

const MOP = "Chci požádat o MOP. Mám 0 Kč. Jsem v Praze. Nemám kde dnes spát.";
function model(level = "SELF") {
  return {
    user_goal: { text: "Požádat o MOP.", source: "user_stated" },
    intervention_level: level,
    immediate_need_gap: { detected: false, needs: [], reason: "" },
    hypothesis: { text: "", status: "unverified" },
    say_to_worker: "x",
    support_path: {
      relevance: "none",
      target_type: "sociální pracovník",
      target_name: "Smyšlená",
      target_address: "Smyšlená 1",
      target_source: "none",
      services: [],
    },
  };
}
async function run(
  text: string,
  choices: ChoiceId[] = [],
  level = "SELF",
  registry?: SupportServiceRegistry,
  transport?: TransportProvider,
) {
  const a = enforceAssessmentInvariants(model(level), { choices });
  return (await applySupportEngine(a, {
    caseId: "c1",
    userText: text,
    choices,
    area: "Praha 8",
    ...(registry ? { registry } : {}),
    ...(transport ? { transport } : {}),
    derive: (l, g, t, r) =>
      deriveHandoffState({
        choices,
        level: l,
        gapDetected: g,
        targetVerified: t,
        routeVerified: r,
      }),
  })) as any;
}
const svc = (o: Partial<SupportService>): SupportService => ({
  id: "x",
  name: "S",
  service_type: "DAY_CENTER",
  address: "A 1",
  phone: null,
  website: null,
  opening_hours: null,
  open_now: null,
  accepts_walk_in: null,
  food_support: null,
  day_center: null,
  overnight_support: null,
  housing_support: null,
  social_worker: null,
  benefits_support: null,
  mop_support: null,
  debt_support: null,
  free_of_charge: null,
  transport_info: null,
  source: "test-registr",
  source_verified_at: "2026-10-04T10:00Z",
  status: "VERIFIED",
  ...o,
});

describe("ImmediateNeedsDetector (kombinace signálů)", () => {
  it("MOP + 0 Kč + dnešní noc → HIGH / ACTIVE_HANDOFF", () => {
    const d = detectImmediateNeeds(MOP);
    expect(d.profile).toBe("HIGH_IMMEDIATE_SUPPORT");
    expect(d.floor).toBe("ACTIVE_HANDOFF");
  });
  it("MOP se stabilním bydlením → jen administrativní", () => {
    expect(
      detectImmediateNeeds("Chci požádat o MOP na pračku, bydlím v nájmu a mám příjem.").profile,
    ).toBe("ADMINISTRATIVE_SUPPORT");
  });
  it("dluhy + exekuce + bez peněz → OPTIONS", () => {
    expect(detectImmediateNeeds("Mám dluhy a exekuci, nemám peníze.").floor).toBe("OPTIONS");
  });
  it("ohrožení života → SAFETY", () => {
    expect(detectImmediateNeeds("Partner mi vyhrožuje, že mě zabije.").floor).toBe(
      "SAFETY_HANDOFF",
    );
  });
});

describe("RealWorldSupportEngine", () => {
  it("MOP krize: cíl zachován, ACTIVE_HANDOFF, gap, nic nevymyšleno bez zdroje", async () => {
    const a = await run(MOP);
    expect(a.user_goal.text).toBe("Požádat o MOP.");
    expect(a.intervention_level).toBe("ACTIVE_HANDOFF");
    expect(a.immediate_need_gap.detected).toBe(true);
    expect(a.support_path.target_name).toBeNull();
    expect(a.support_path.navigation_available).toBe(false);
    expect(a.human_handoff.target_verified).toBe(false);
    expect(a.human_handoff.support_target_status).toBe("UNKNOWN");
    expect(a.immediate_need_status).toBe("HANDOFF_OFFERED");
    expect(a.transport_status).toBe("NEEDED");
  });
  it("odmítnutí: nevnucuje úroveň, stav DECLINED, cíl zůstává", async () => {
    const a = await run(MOP, ["SELF"]);
    expect(a.intervention_level).toBe("SELF");
    expect(a.immediate_need_status).toBe("DECLINED");
    expect(a.human_handoff.user_goal).toBe("Požádat o MOP.");
  });
  it("SAFETY nelze odmítnutím vypnout", async () => {
    const a = await run("Partner mi vyhrožuje, že mě zabije.", ["SELF"]);
    expect(a.intervention_level).toBe("SAFETY_HANDOFF");
  });
  it("neověřená služba z registru se nikdy nepoužije", async () => {
    const reg = {
      name: "t",
      search: async () => [svc({ status: "UNVERIFIED", name: "Neověřená" })],
    };
    const a = await run(MOP, [], "SELF", reg);
    expect(a.support_path.target_name).toBeNull();
  });
  it("ověřená gateway služba má přednost; trasa jen od dopravce", async () => {
    const reg = {
      name: "t",
      search: async () => [
        svc({ id: "food", name: "Jen jídlo", food_support: true }),
        svc({
          id: "gw",
          name: "Gateway",
          social_worker: true,
          overnight_support: true,
          food_support: true,
          accepts_walk_in: true,
          open_now: true,
        }),
      ],
    };
    const tr: TransportProvider = {
      name: "t",
      route: async () => ({
        legs: [{ mode: "TRAM", line: "14", direction: "X", from: "Praha 8", to: "Y", minutes: 10 }],
        total_minutes: 13,
        disruptions: [],
        source: "test-dopravce",
        verified_at: "2026-10-04T10:00Z",
      }),
    };
    const a = await run(MOP, [], "SELF", reg, tr);
    expect(a.support_path.target_name).toBe("Gateway");
    expect(a.support_target_status).toBe("CURRENTLY_OPEN");
    expect(a.support_path.navigation_available).toBe(true);
    expect(a.handoff_state).toBe("ROUTE_READY");
  });
  it("matching řadí podle priorit", () => {
    const r = matchServices(
      [svc({ id: "a" }), svc({ id: "b", overnight_support: true, open_now: true })],
      ["no_shelter_tonight"],
    );
    expect(r[0]!.id).toBe("b");
  });
  it("po příchodu: ARRIVED → CONNECTED, návrat k cíli", async () => {
    expect((await run(MOP, ["GO", "AT_PLACE"])).immediate_need_status).toBe("ARRIVED");
    const c = await run(MOP, ["GO", "AT_PLACE", "CONNECTED"]);
    expect(c.immediate_need_status).toBe("CONNECTED");
    expect(c.transport_status).toBe("ARRIVED");
  });
  it("bez kreditu: volání není první krok", async () => {
    expect((await run(MOP + " Nemám kredit.")).human_handoff.call_first_allowed).toBe(false);
  });
});
