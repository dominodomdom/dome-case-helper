/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(), createServerFn: () => ({}) }));
vi.mock("@/lib/dome.functions", () => ({ prepareHandoff: {} }));
vi.mock("@/lib/urad-api", () => ({ getAccessToken: vi.fn() }));

import {
  deriveHandoffState,
  enforceAssessmentInvariants,
  enforceHandoffLabels,
  formatChoice,
  parseChoice,
} from "@/lib/dome-core";
import { SupportPathCard, WorkerSummaryView } from "@/components/dome/SupportPath";
import type { DomeAssessment } from "@/lib/urad-api";

// Testovací vstup ve tvaru modelu pro scénář „MOP + 0 Kč + Praha + dnes nemám kde spát“.
function modelOutput(over: Record<string, unknown> = {}) {
  return {
    user_goal: { text: "Chci požádat o MOP.", source: "user_stated" },
    user_message: "Budeme řešit žádost o MOP. Zároveň nečekejme jen na dávku.",
    intervention_level: "ACTIVE_HANDOFF",
    immediate_need_gap: { detected: true, needs: ["nocleh", "jídlo", "kontakt s pracovníkem"], reason: "MOP nemusí být okamžitá" },
    now_actions: ["Dostat se k sociálnímu pracovníkovi"],
    then_actions: ["Pokračovat v žádosti o MOP"],
    hypothesis: { text: "x", status: "verified" },
    confidence: "high",
    say_to_worker: "Dnes nemám peníze a nemám kde spát. Potřebuji pomoct a chci pokračovat v žádosti o MOP.",
    support_path: {
      relevance: "urgent", intervention_level: "ACTIVE_HANDOFF", reason: "", target_type: "sociální pracovník městské části",
      target_name: "Vymyšlená noclehárna", target_address: "Vymyšlená 1, Praha", target_source: "none",
      services: [], immediate_needs: ["Nemáš dnes peníze ani místo na noc."], required_documents: [], next_action: "",
      navigation_available: true, handoff_available: true,
    },
    ...over,
  };
}

describe("dome-core invarianty v2.0", () => {
  it("ACTIVE_HANDOFF: cíl zachován, gap, support path, hypotéza neověřená", () => {
    const a = enforceAssessmentInvariants(modelOutput()) as any;
    expect((a.user_goal as { text: string }).text).toBe("Chci požádat o MOP.");
    expect(a.intervention_level).toBe("ACTIVE_HANDOFF");
    expect((a.immediate_need_gap as { detected: boolean }).detected).toBe(true);
    expect(a.support_path_required).toBe(true);
    expect((a.hypothesis as { status: string }).status).toBe("unverified");
    expect(a.confidence).toBe("low");
    expect(a.handoff_state).toBe("IMMEDIATE_NEED_DETECTED");
  });

  it("halucinovaná organizace/adresa a navigace jsou odstraněny", () => {
    const sp = (enforceAssessmentInvariants(modelOutput()) as any).support_path as any;
    expect(sp.target_name).toBeNull();
    expect(sp.target_address).toBeNull();
    expect(sp.target_source).toBe("none");
    expect(sp.navigation_available).toBe(false);
    expect(sp.route).toBeNull();
  });

  it("stavy podle voleb uživatele", () => {
    const base = { gapDetected: true, level: "ACTIVE_HANDOFF" as const, targetVerified: false, routeVerified: false };
    expect(deriveHandoffState({ ...base, choices: ["DECLINE"] })).toBe("HANDOFF_DECLINED");
    expect(deriveHandoffState({ ...base, choices: ["DECLINE", "GO"] })).toBe("USER_EN_ROUTE");
    expect(deriveHandoffState({ ...base, choices: ["GO", "AT_PLACE"] })).toBe("HANDOFF_READY");
    expect(deriveHandoffState({ ...base, choices: ["GO", "AT_PLACE", "CONNECTED"] })).toBe("HUMAN_CONNECTED");
    expect(deriveHandoffState({ ...base, choices: ["CONNECTED", "DONE"] })).toBe("HANDOFF_COMPLETED");
    // SAFETY: odmítnutí nevypne bezpečnost
    expect(deriveHandoffState({ ...base, level: "SAFETY_HANDOFF", choices: ["SELF"] })).toBe("IMMEDIATE_NEED_DETECTED");
    // bez ověřeného zdroje nikdy SUPPORT_TARGET_FOUND / ROUTE_READY
    expect(deriveHandoffState({ ...base, choices: [] })).toBe("IMMEDIATE_NEED_DETECTED");
  });

  it("volby se dají zapsat a přečíst", () => {
    expect(parseChoice(formatChoice("GO"))).toBe("GO");
    expect(parseChoice("obyčejný text")).toBeNull();
  });

  it("FACT bez dokumentu se mění na UNVERIFIED", () => {
    expect(enforceHandoffLabels([{ label: "FACT" }], 0)[0]!.label).toBe("UNVERIFIED");
    expect(enforceHandoffLabels([{ label: "FACT" }], 1)[0]!.label).toBe("FACT");
  });
});

describe("UI karta pomoci", () => {
  const a = enforceAssessmentInvariants(modelOutput()) as unknown as DomeAssessment;

  it("primární CTA, bez interních pojmů, doklad není blokátor", () => {
    const onChoice = vi.fn();
    render(<SupportPathCard caseId="c" a={a} state="IMMEDIATE_NEED_DETECTED" disabled={false} onChoice={onChoice} />);
    const btns = screen.getAllByRole("button").map((b) => b.textContent);
    expect(btns[0]).toBe("Chci tam jít");
    expect(btns).toContain("Potřebuji to vyřešit sám");
    expect(screen.getByTestId("target-unverified").textContent).toMatch(/Neověřeno/i);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/hypotéz|paralelní|ve skutečnosti|Vymyšlená|Podle dostupných informací/i);
    expect(text).toMatch(/neodkládejte kvůli tomu kontakt s pomocí/);
    fireEvent.click(screen.getByText("Chci tam jít"));
    expect(onChoice).toHaveBeenCalledWith("GO");
  });

  it("HANDOFF FLOW bez ověřených dat nepředstírá navigaci a nabízí co říct", () => {
    render(<SupportPathCard caseId="c" a={a} state="USER_EN_ROUTE" disabled={false} onChoice={vi.fn()} />);
    expect(screen.getByTestId("handoff-flow")).toBeTruthy();
    expect(screen.getByTestId("no-navigation")).toBeTruthy();
    expect(screen.queryByText("Navigovat tam")).toBeNull();
    expect((screen.getByLabelText("Co říct pracovníkovi") as HTMLTextAreaElement).value).toMatch(/MOP/);
    expect(screen.getByText("Kopírovat")).toBeTruthy();
    expect(screen.getByText("Předat shrnutí pracovníkovi")).toBeTruthy();
    expect(screen.getByText("Dobře. Dostaňme vás teď tam.")).toBeTruthy();
    expect(screen.getByLabelText("Kde jste")).toBeTruthy();
    expect(screen.getByTestId("goal-continues").textContent).toMatch(/MOP/);
  });

  it("HANDOFF_READY vyžaduje souhlas před předáním telefonu", () => {
    render(<SupportPathCard caseId="c" a={a} state="HANDOFF_READY" disabled={false} onChoice={vi.fn()} />);
    fireEvent.click(screen.getByText("Předat telefon pracovníkovi"));
    expect(screen.getByText(/pouze informace potřebné/)).toBeTruthy();
  });

  it("odmítnutí: karta se skryje, nenabízí se znovu", () => {
    render(<SupportPathCard caseId="c" a={a} state="HANDOFF_DECLINED" disabled={false} onChoice={vi.fn()} />);
    expect(screen.queryByText("Chci tam jít")).toBeNull();
    expect(screen.getByText(/pokračujeme v tom, co řešíte/)).toBeTruthy();
  });

  it("HUMAN_CONNECTED: pracovník přebírá, cíl pokračuje", () => {
    render(<SupportPathCard caseId="c" a={a} state="HUMAN_CONNECTED" disabled={false} onChoice={vi.fn()} />);
    expect(screen.getByTestId("human-connected").textContent).toMatch(/MOP/);
  });

  it("shrnutí pro pracovníka je strukturované se štítky", () => {
    render(<WorkerSummaryView items={[{ section: "cil", label: "USER_REPORTED", text: "Chci požádat o MOP." }, { section: "aktualni_situace", label: "UNVERIFIED", text: "x" }]} />);
    const t = screen.getByTestId("worker-summary").textContent ?? "";
    expect(t).toMatch(/Cíl uživatele/);
    expect(t).toMatch(/Uvedl uživatel/);
    expect(t).toMatch(/Neověřeno/);
  });
});
