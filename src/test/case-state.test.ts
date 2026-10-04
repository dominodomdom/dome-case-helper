/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { applyActionStatus, buildCaseState, isActionBlocked, normalizeCaseState, validateCaseState, type CaseDraft } from "@/lib/case-state";

const ID = "11111111-1111-4111-8111-111111111111";
const TEXT = "Mám 0 Kč, jsem v Praze, nemám stabilní bydlení a dnes večer nemám kde spát. Potřebuji také vyřešit dávku a najít práci.";
const draft: CaseDraft = {
  reality: [
    { key: "nula", type: "FACT", text: "Mám 0 Kč.", source: "USER", need_keys: ["zakladni"] },
    { key: "mop_vyklad", type: "INTERPRETATION", text: "MOP může být relevantní cesta, ale je potřeba ověřit podmínky.", source: "SYSTEM", need_keys: [] },
  ],
  person: { current_status: null, employment_status: "bez práce (uvedl)", education_status: null, housing_status: "nestabilní", income_status: "0 Kč (uvedl)", available_resources: [], relevant_social_context: [], relevant_procedures: [], relevant_documents: [] },
  needs: [
    { key: "nocleh", category: "HOUSING", description: "Dnešní nocleh", amount: null, urgency: "CRITICAL", deadline: null, tracks: ["SURVIVAL", "HOUSING"] },
    { key: "zakladni", category: "FOOD", description: "Základní potřeby", amount: null, urgency: "HIGH", deadline: null, tracks: ["SURVIVAL"] },
    { key: "prijem", category: "INCOME", description: "Úřední řešení příjmu", amount: null, urgency: "MEDIUM", deadline: null, tracks: ["ADMINISTRATIVE"] },
    { key: "prace", category: "INCOME", description: "Pracovní stabilizace", amount: null, urgency: "MEDIUM", deadline: null, tracks: ["INCOME"] },
  ],
  actions: [
    { key: "najit_nocleh", title: "Zajistit dnešní bezpečný nocleh", description: "", type: "SECURE_BASIC_NEED", priority: "NOW", track: "SURVIVAL", need_keys: ["nocleh"], depends_on: [] },
    { key: "doklady", title: "Shromáždit doklady", description: "", type: "OBTAIN_EVIDENCE", priority: "TODAY", track: "ADMINISTRATIVE", need_keys: ["prijem"], depends_on: [] },
    { key: "podani", title: "Podat žádost na ÚP", description: "", type: "SUBMIT_APPLICATION", priority: "FIRST_WORKING_DAY", track: "ADMINISTRATIVE", need_keys: ["prijem"], depends_on: ["doklady"] },
    { key: "prace", title: "Registrace a hledání práce", description: "", type: "GENERAL", priority: "THIS_WEEK", track: "INCOME", need_keys: ["prace"], depends_on: [] },
    { key: "bydleni", title: "Dlouhodobé bydlení", description: "", type: "CONTACT_SUPPORT", priority: "LATER", track: "HOUSING", need_keys: ["nocleh"], depends_on: [] },
  ],
  unknowns: [
    { key: "bez_duvodu", question: "Kolik je vám let?", why_it_matters: "", need_keys: [], impact: "LOW" },
    { key: "prijem", question: "Kdy jste měl/a poslední příjem?", why_it_matters: "Může změnit, jakou dávku je vhodné zvážit.", need_keys: ["prijem"], impact: "HIGH" },
  ],
};
const build = (prev: any = null, d: any = draft) => buildCaseState({ caseId: ID, userGoal: "Dnes bezpečně přespat a vyřešit dávku a práci.", interpretation: null, draft: d, userText: TEXT, documents: 0, previous: prev });

describe("CASE CORE", () => {
  it("testovací scénář: needs, tracks, akce ve všech vrstvách, platná struktura", () => {
    const s = build();
    expect(validateCaseState(s)).toEqual([]);
    expect(s.dome_case_schema_version).toBe("1.0");
    expect(s.metadata.version).toBe(1);
    expect(s.tracks.map((t) => t.type)).toEqual(expect.arrayContaining(["SURVIVAL", "ADMINISTRATIVE", "HOUSING", "INCOME"]));
    expect(new Set(s.actions.map((a) => a.priority))).toEqual(new Set(["NOW", "TODAY", "FIRST_WORKING_DAY", "THIS_WEEK", "LATER"]));
    expect(s.actions.find((a) => a.priority === "NOW")!.need_ids).toContain("need_nocleh");
  });
  it("CLAIM nikdy není FACT bez dokumentu", () => {
    const r = build().reality.find((x) => x.text === "Mám 0 Kč.")!;
    expect(r.type).toBe("CLAIM");
    expect(r.certainty).not.toBe("VERIFIED");
  });
  it("žádné vymyšlené částky/lhůty; otázka bez důvodu se neklade", () => {
    const s = build();
    expect(s.needs.every((n) => n.amount === null && n.deadline === null)).toBe(true);
    expect(s.unknowns.map((u) => u.id)).toEqual(["unk_prijem"]);
  });
  it("závislost blokuje akci", () => {
    const s = build();
    const podani = s.actions.find((a) => a.id === "act_podani")!;
    expect(isActionBlocked(podani, s.actions)).toBe(true);
    const s2 = applyActionStatus(s, "act_doklady", "DONE", null);
    expect(isActionBlocked(s2.actions.find((a) => a.id === "act_podani")!, s2.actions)).toBe(false);
    expect(s2.metadata.version).toBe(2);
  });
  it("WAITING/BLOCKED vyžaduje důvod; status přežije nové vyhodnocení", () => {
    const s = build();
    expect(() => applyActionStatus(s, "act_najit_nocleh", "WAITING", "")).toThrow();
    const s2 = applyActionStatus(s, "act_najit_nocleh", "WAITING", "Čekám na odpověď noclehárny");
    const s3 = build(s2);
    const a = s3.actions.find((x) => x.id === "act_najit_nocleh")!;
    expect(a.status).toBe("WAITING");
    expect(a.status_reason).toBe("Čekám na odpověď noclehárny");
    expect(s3.metadata.version).toBe(3);
    expect(s3.user_goal).toBe(s.user_goal);
  });
  it("validace odmítne neplatné vazby a cyklus", () => {
    const s = build();
    const bad = { ...s, actions: s.actions.map((a) => (a.id === "act_doklady" ? { ...a, depends_on_action_ids: ["act_podani"] } : a)) };
    expect(validateCaseState(bad).join()).toMatch(/cyklick/);
    const bad2 = { ...s, actions: [{ ...s.actions[0]!, need_ids: ["need_neexistuje"] }] };
    expect(validateCaseState(bad2).length).toBeGreaterThan(0);
    expect(validateCaseState({ ...s, case_id: "x" })).toContain("neplatné case_id");
  });
  it("krizový detektor doplní dnešní nocleh i když model potřebu vynechá", () => {
    const s = build(null, { ...draft, needs: [], actions: [] });
    expect(s.needs[0]!.id).toBe("need_dnesni_nocleh");
    expect(s.tracks.map((t) => t.type)).toContain("SURVIVAL");
  });
  it("nocleh se neduplikuje; lhůta z dokumentu vytvoří deadline hook", () => {
    const s = build();
    expect(s.needs.filter((n) => n.category === "HOUSING" && n.urgency === "CRITICAL")).toHaveLength(1);
    const d = buildCaseState({ caseId: ID, userGoal: null, interpretation: null, userText: TEXT, documents: 1, previous: null,
      draft: { ...draft, reality: [{ key: "lhuta", type: "FACT", text: "Odvolání lze podat do 15 dnů od doručení.", source: "DOCUMENT", need_keys: [] }] } });
    expect(d.reality[0]!.type).toBe("FACT");
    expect(d.links.deadlines).toHaveLength(1);
    expect(d.links.deadlines[0]!.date).toBeNull();
  });
  it("starší assessment se normalizuje bez pádu", () => {
    expect(normalizeCaseState(null, ID)).toBeNull();
    expect(normalizeCaseState("nesmysl", ID)).toBeNull();
    const n = normalizeCaseState({ stated_by_user: ["Mám 0 Kč"], to_verify: ["příjem"], user_goal: { text: "MOP" } }, ID)!;
    expect(n.metadata.legacy_normalized).toBe(true);
    expect(n.reality[0]!.type).toBe("CLAIM");
    expect(n.actions).toEqual([]);
    expect(n.user_goal).toBe("MOP");
  });
});
