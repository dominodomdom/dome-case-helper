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
    expect(d.reality[0]!.evidence_ids).toEqual(["document:rozhodnuti.pdf"]);
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
  const need1 = (n: any, text = TEXT, extra: any[] = [], actions: any[] = []) => buildCaseState({ caseId: ID, userGoal: null, interpretation: null, userText: text, documents: 0, previous: null,
    draft: { ...draft, needs: [{ key: "k", category: "FOOD", description: "jídlo", amount: null, urgency: "HIGH", deadline: null, tracks: [], ...n }, ...extra], actions } }).needs.find((x) => x.id === "need_k")!;
  it("AMOUNT BINDING: jen MENTION → NEED → AMOUNT, jinak null/UNKNOWN", () => {
    const T = "Potřebuji 5 000 Kč na nájem. Na jídlo mi chybí 800 Kč.";
    expect(need1({ amount: 5000, amount_mention: null }, T).amount).toBeNull(); // číslo v textu nestačí
    const ok = need1({ amount: 5000, amount_mention: "Potřebuji 5 000 Kč na nájem" }, T);
    expect([ok.amount, ok.amount_status, ok.amount_mention]).toEqual([5000, "KNOWN", "potřebuji 5 000 kč na nájem"]);
    expect(need1({ amount: 800, amount_mention: "Potřebuji 5 000 Kč na nájem" }, T).amount).toBeNull(); // citace s jinou částkou
    expect(need1({ amount: 5000, amount_mention: "Potřebuji 5 000 Kč na nájem. Na jídlo mi chybí 800 Kč" }, T).amount).toBeNull(); // dvě čísla = nejednoznačné
    expect(need1({ amount: 5000, amount_mention: "Potřebuji 5 000 Kč na pivo" }, T).amount).toBeNull(); // citace neexistuje
    const shared = need1({ amount: 5000, amount_mention: "Potřebuji 5 000 Kč na nájem" }, T,
      [{ key: "j", category: "HOUSING", description: "nájem", amount: 5000, amount_mention: "Potřebuji 5 000 Kč na nájem", urgency: "HIGH", deadline: null, tracks: [] }]);
    expect([shared.amount, shared.amount_status]).toEqual([null, "UNKNOWN"]); // stejná citace u dvou potřeb
  });
  it("DEADLINE BINDING: lhůta jen s citací a vazbou NEED/ACTION/EVENT/PROCEDURE", () => {
    const T = "Odvolání lze podat do 15 dnů od doručení. Nájem musím zaplatit do pátku.";
    expect(need1({ deadline: "do 15 dnů", deadline_mention: "Odvolání lze podat do 15 dnů od doručení" }, T).deadline).toBeNull(); // bez vazby
    const p = need1({ deadline: "do 15 dnů", deadline_mention: "Odvolání lze podat do 15 dnů od doručení", deadline_anchor: { type: "PROCEDURE", key: "Odvolání proti rozhodnutí" } }, T);
    expect([p.deadline, p.deadline_status, p.deadline_anchor]).toEqual(["do 15 dnů", "KNOWN", { type: "PROCEDURE", ref: "Odvolání proti rozhodnutí" }]);
    expect(need1({ deadline: "do pátku", deadline_mention: "Nájem musím zaplatit do pátku", deadline_anchor: { type: "NEED", key: "k" } }, T).deadline_anchor).toEqual({ type: "NEED", ref: "need_k" });
    expect(need1({ deadline: "do pátku", deadline_mention: "Nájem musím zaplatit do pátku", deadline_anchor: { type: "NEED", key: "jina" } }, T).deadline).toBeNull(); // cizí potřeba
    expect(need1({ deadline: "do pátku", deadline_mention: "Nájem musím zaplatit do pátku", deadline_anchor: { type: "ACTION", key: "neexistuje" } }, T).deadline).toBeNull();
    expect(need1({ deadline: "do pátku", deadline_mention: "Nájem musím zaplatit do pátku", deadline_anchor: { type: "ACTION", key: "zaplatit" } }, T, [],
      [{ key: "zaplatit", title: "Zaplatit nájem", description: "", type: "GENERAL", priority: "THIS_WEEK", track: null, need_keys: [], depends_on: [] }]).deadline_anchor).toEqual({ type: "ACTION", ref: "act_zaplatit" });
    expect(need1({ deadline: "15. 11. 2026", deadline_mention: "Nájem musím zaplatit do pátku", deadline_anchor: { type: "NEED", key: "k" } }, T).deadline).toBeNull(); // lhůta není v citaci
    expect(need1({ deadline: "do 15 dnů", deadline_mention: "Odvolání lze podat do 15 dnů od doručení", deadline_anchor: { type: "EVENT", key: "" } }, T).deadline).toBeNull();
  });
  it("EVIDENCE BOUNDARY: FACT vyžaduje ověřitelnou evidenci libovolného druhu, kterou server zná", () => {
    const mk = (r: any, ev: any[] = []) => buildCaseState({ caseId: ID, userGoal: null, interpretation: null, userText: TEXT, documents: 0, verifiableEvidence: ev, previous: null, draft: { ...draft, reality: [r] } }).reality[0]!;
    const off = mk({ key: "a", type: "FACT", text: "x", source: "OFFICIAL_SOURCE", evidence: { kind: "OFFICIAL_SOURCE", ref: "MPSV:zivotni-minimum" }, need_keys: [] }, [{ kind: "OFFICIAL_SOURCE", ref: "MPSV:zivotni-minimum" }]);
    expect([off.type, off.source, off.evidence_ids]).toEqual(["FACT", "OFFICIAL_SOURCE", ["official_source:mpsv:zivotni-minimum"]]);
    expect(mk({ key: "a", type: "FACT", text: "x", source: "SYSTEM", evidence: { kind: "SYSTEM_RECORD", ref: "r1" }, need_keys: [] }, [{ kind: "SYSTEM_RECORD", ref: "r1" }]).source).toBe("SYSTEM");
    expect(mk({ key: "a", type: "FACT", text: "x", source: "OFFICIAL_SOURCE", evidence: { kind: "OFFICIAL_SOURCE", ref: "neznamy" }, need_keys: [] }).type).toBe("VERIFICATION"); // neověřitelný odkaz
    expect(mk({ key: "a", type: "FACT", text: "x", source: "USER", evidence: { kind: "SYSTEM_RECORD", ref: "r1" }, need_keys: [] }, [{ kind: "SYSTEM_RECORD", ref: "r1" }]).type).toBe("CLAIM"); // USER nikdy FACT
  });
  it("LEGACY: uložená částka/lhůta bez vazby se při načtení stane UNKNOWN", () => {
    const s = build();
    const legacy = { case_state: { ...s, needs: [{ ...s.needs[0]!, amount: 1500, amount_mention: undefined, deadline: "zítra", deadline_anchor: undefined }] } };
    const n = normalizeCaseState(legacy, ID)!.needs[0]!;
    expect([n.amount, n.amount_status, n.deadline, n.deadline_status]).toEqual([null, "UNKNOWN", null, "UNKNOWN"]);
    console.log("ERRS", validateCaseState(normalizeCaseState(legacy, ID)!));
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
