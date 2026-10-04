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
    const d = buildCaseState({ caseId: ID, userGoal: null, interpretation: null, userText: TEXT, documents: 1, documentNames: ["rozhodnuti.pdf"], previous: null,
      draft: { ...draft, reality: [{ key: "lhuta", type: "FACT", text: "Odvolání lze podat do 15 dnů od doručení.", source: "DOCUMENT", document_name: "rozhodnuti.pdf", need_keys: [] }] } });
    expect(d.reality[0]!.evidence_ids).toEqual(["doc:rozhodnuti.pdf"]);
    expect(d.reality[0]!.type).toBe("FACT");
    expect(d.links.deadlines).toHaveLength(1);
    expect(d.links.deadlines[0]!.date).toBeNull();
  });
  it("HARDENING: FACT bez existujícího dokumentu / s cizím názvem / ze zdroje USER nikdy není FACT", () => {
    const mk = (r: any, names: string[] = []) => buildCaseState({ caseId: ID, userGoal: null, interpretation: null, userText: TEXT, documents: names.length, documentNames: names, previous: null, draft: { ...draft, reality: [r] } }).reality[0]!;
    expect(mk({ key: "a", type: "FACT", text: "x", source: "DOCUMENT", document_name: "neexistuje.pdf", need_keys: [] }, ["jiny.pdf"]).type).not.toBe("FACT");
    expect(mk({ key: "a", type: "FACT", text: "x", source: "USER", document_name: null, need_keys: [] }).type).toBe("CLAIM");
    expect(mk({ key: "a", type: "FACT", text: "x", source: "OFFICIAL_SOURCE", document_name: null, need_keys: [] }).type).not.toBe("FACT");
    const v = mk({ key: "a", type: "CLAIM", text: "x", source: "USER", document_name: null, need_keys: [] });
    expect(v.certainty).not.toBe("VERIFIED");
  });
  it("HARDENING: validace odmítne FACT bez evidence, VERIFIED u CLAIM, WAITING bez důvodu", () => {
    const s = build();
    expect(validateCaseState({ ...s, reality: [{ ...s.reality[0]!, type: "FACT", source: "DOCUMENT", certainty: "VERIFIED" }] }).join()).toMatch(/FACT bez evidence/);
    expect(validateCaseState({ ...s, reality: [{ ...s.reality[0]!, certainty: "VERIFIED" }] }).join()).toMatch(/VERIFIED jen u FACT/);
    expect(validateCaseState({ ...s, actions: s.actions.map((a, i) => (i === 0 ? { ...a, status: "WAITING" as const, status_reason: null } : a)) }).join()).toMatch(/chybí důvod/);
  });
  it("HARDENING: částka a lhůta jen pokud zazněly (AMOUNT_UNKNOWN / DEADLINE_UNKNOWN)", () => {
    const n = (amount: any, deadline: any, text = TEXT) => buildCaseState({ caseId: ID, userGoal: null, interpretation: null, userText: text, documents: 0, previous: null,
      draft: { ...draft, needs: [{ key: "k", category: "FOOD", description: "jídlo", amount, urgency: "HIGH", deadline, tracks: [] }], actions: [] } }).needs.find((x) => x.id === "need_k")!;
    expect(n(1500, null).amount).toBeNull(); // vymyšlená částka
    expect(n(5000, null, "Potřebuji 5 000 Kč na nájem").amount).toBe(5000);
    expect(n(null, "15. 11. 2026").deadline).toBeNull(); // vymyšlená lhůta
    expect(n(null, "do 15 dnů", "odvolání do 15 dnů").deadline).toBe("do 15 dnů");
    expect(n(-3, null).amount).toBeNull();
  });
  it("HARDENING: blokovanou akci nelze dokončit ani začít; tracky jsou deterministické", () => {
    const s = build();
    expect(() => applyActionStatus(s, "act_podani", "DONE", null)).toThrow(/závisí/);
    expect(() => applyActionStatus(s, "act_podani", "IN_PROGRESS", null)).toThrow(/závisí/);
    expect(applyActionStatus(s, "act_podani", "BLOCKED", "čekám na doklady").actions.find((a) => a.id === "act_podani")!.status).toBe("BLOCKED");
    const t1 = build(null).tracks.map((t) => t.id);
    expect(build(null).tracks.map((t) => t.id)).toEqual(t1);
    expect(t1).toEqual(["track_survival", "track_administrative", "track_housing", "track_income", "track_support"]);
  });
  it("HARDENING: AI nepřepíše žádný uživatelský stav (TODO→každý stav)", () => {
    const s = build();
    for (const [st, why] of [["IN_PROGRESS", null], ["WAITING", "x"], ["BLOCKED", "y"], ["DONE", null]] as const) {
      const changed = applyActionStatus(s, "act_najit_nocleh", st, why);
      expect(build(changed).actions.find((a) => a.id === "act_najit_nocleh")!.status).toBe(st);
      // i když model akci vynechá
      expect(build(changed, { ...draft, actions: [] }).actions.find((a) => a.id === "act_najit_nocleh")!.status).toBe(st);
    }
  });
  it("HARDENING: normalizace legacy je deterministická a nevytváří FACT", () => {
    const legacy = { stated_by_user: ["a"], verified: ["b"], to_verify: ["c"], missing_information: ["d"], hypothesis: { text: "h", status: "unverified" } };
    const a1 = normalizeCaseState(legacy, ID), a2 = normalizeCaseState(legacy, ID);
    expect(a1).toEqual(a2);
    expect(a1!.reality.some((r) => r.type === "FACT" || r.certainty === "VERIFIED")).toBe(false);
    expect(normalizeCaseState({ hypothesis: { text: "v1" } }, ID)!.reality).toEqual([]); // dome-core 1.0 bez polí
    expect(normalizeCaseState({ case_state: { dome_case_schema_version: "0.9" }, user_goal: { text: "g" } }, ID)!.metadata.legacy_normalized).toBe(true);
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
