/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const calls: any[] = [];
let reply: any = { ok: true, data: { version: 2 } };
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => async (arg: any) => {
    calls.push(arg.data);
    return reply;
  },
  createServerFn: () => ({}),
}));
vi.mock("@/lib/dome.functions", () => ({ updateActionStatus: {} }));
vi.mock("@/lib/urad-api", () => ({ getAccessToken: async () => "token-xxxxxxxxxx" }));

import { CaseCorePanel } from "@/components/dome/CaseCore";
import { buildCaseState } from "@/lib/case-state";

const ID = "11111111-1111-4111-8111-111111111111";
const state = buildCaseState({
  caseId: ID,
  userGoal: "g",
  interpretation: null,
  userText: "Nemám kde dnes spát a mám 0 Kč.",
  documents: 0,
  previous: null,
  draft: {
    reality: [
      {
        key: "r",
        type: "CLAIM",
        text: "Mám 0 Kč.",
        source: "USER",
        document_name: null,
        need_keys: [],
      },
    ],
    person: undefined as any,
    needs: [
      {
        key: "n",
        category: "HOUSING",
        description: "Dnešní nocleh",
        amount: null,
        urgency: "CRITICAL",
        deadline: null,
        tracks: ["SURVIVAL"],
      },
    ],
    actions: [
      {
        key: "a",
        title: "Shromáždit doklady",
        description: "",
        type: "OBTAIN_EVIDENCE",
        priority: "TODAY",
        track: "SURVIVAL",
        need_keys: ["n"],
        depends_on: [],
      },
      {
        key: "b",
        title: "Podat žádost",
        description: "",
        type: "SUBMIT_APPLICATION",
        priority: "FIRST_WORKING_DAY",
        track: null,
        need_keys: [],
        depends_on: ["a"],
      },
    ],
    unknowns: [
      {
        key: "u",
        question: "Kde jste?",
        why_it_matters: "Podle toho hledáme pomoc.",
        need_keys: [],
        impact: "HIGH",
      },
    ],
  },
});

const row = (id: string) => within(screen.getByTestId(`action-${id}`));
beforeEach(() => {
  calls.length = 0;
  reply = { ok: true, data: { version: 2 } };
});

describe("CaseCorePanel smoke", () => {
  it("vykreslí plán po prioritách, potřeby (částka neznámá), realitu s jistotou, otázky s důvodem", () => {
    render(<CaseCorePanel caseId={ID} state={state} disabled={false} onChanged={() => {}} />);
    expect(screen.getByTestId("action-plan").textContent).toMatch(
      /Dnes.*Shromáždit doklady.*První pracovní den.*Podat žádost/s,
    );
    expect(screen.getByText(/částka zatím neznámá/)).toBeTruthy();
    expect(screen.getByText(/Uvedl\/a jste · možné/)).toBeTruthy();
    expect(screen.getByText(/Ptám se, protože/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/nárok/i);
  });

  it("přechody DONE / IN_PROGRESS posílají správný stav a verzi", async () => {
    const onChanged = vi.fn();
    render(<CaseCorePanel caseId={ID} state={state} disabled={false} onChanged={onChanged} />);
    fireEvent.click(row("act_a").getByText("Dělám na tom"));
    await waitFor(() =>
      expect(calls[0]).toMatchObject({
        actionId: "act_a",
        status: "IN_PROGRESS",
        reason: null,
        expectedVersion: 1,
      }),
    );
    fireEvent.click(row("act_a").getByText("Hotovo"));
    await waitFor(() => expect(calls[1]).toMatchObject({ status: "DONE" }));
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("WAITING i BLOCKED vyžadují důvod", async () => {
    render(<CaseCorePanel caseId={ID} state={state} disabled={false} onChanged={() => {}} />);
    for (const [btn, st] of [
      ["Čekám", "WAITING"],
      ["Nejde to", "BLOCKED"],
    ] as const) {
      fireEvent.click(row("act_a").getByText(btn));
      const save = row("act_a").getByText("Uložit").closest("button")!;
      expect(save.disabled).toBe(true);
      fireEvent.change(row("act_a").getByLabelText("Důvod"), {
        target: { value: "čekám na úřad" },
      });
      fireEvent.click(save);
      await waitFor(() =>
        expect(calls.at(-1)).toMatchObject({ status: st, reason: "čekám na úřad" }),
      );
    }
  });

  it("dependency lock: závislou akci nelze dokončit ani začít", () => {
    render(<CaseCorePanel caseId={ID} state={state} disabled={false} onChanged={() => {}} />);
    expect(row("act_b").getByTestId("action-blocked").textContent).toMatch(/Shromáždit doklady/);
    expect(row("act_b").getByText("Hotovo").closest("button")!.disabled).toBe(true);
    expect(row("act_b").getByText("Dělám na tom").closest("button")!.disabled).toBe(true);
    expect(row("act_b").getByText("Čekám").closest("button")!.disabled).toBe(false);
  });

  it("konflikt verze se zobrazí, nic se tiše nepřepíše", async () => {
    reply = { ok: false, error: "Stav případu se mezitím změnil. Obnovte stránku." };
    const onChanged = vi.fn();
    render(<CaseCorePanel caseId={ID} state={state} disabled={false} onChanged={onChanged} />);
    fireEvent.click(row("act_a").getByText("Hotovo"));
    await waitFor(() => expect(screen.getByText(/mezitím změnil/)).toBeTruthy());
    expect(onChanged).not.toHaveBeenCalled();
  });
});
