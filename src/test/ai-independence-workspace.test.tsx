/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const aiCalls: any[] = [];
let steps: any[] = [];
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => async (arg: any) => {
    aiCalls.push({ fn: fn?.__name, data: arg.data });
    return { ok: false, error: "Došly AI kredity pracovního prostoru." };
  },
  createServerFn: () => ({}),
}));
vi.mock("@/lib/dome.functions", () => ({
  assessCase: { __name: "assessCase" },
  analyzeDocument: { __name: "analyzeDocument" },
  prepareHandoff: { __name: "prepareHandoff" },
  updateActionStatus: { __name: "updateActionStatus" },
}));
vi.mock("@/lib/urad-api", () => ({
  listSteps: async () => steps,
  addUserInput: async () => undefined,
  getAccessToken: async () => "token-xxxxxxxxxx",
}));

import { DomeWorkspace } from "@/components/dome/DomeWorkspace";

const ID = "11111111-1111-4111-8111-111111111111";
const item = {
  id: ID,
  caseNumber: null,
  title: "T",
  description: "Popis",
  status: null,
  priority: null,
  openedAt: null,
  createdAt: null,
};
const assessment = {
  hypothesis: { text: "h", status: "unverified" },
  stated_by_user: [],
  verified: [],
  to_verify: [],
  missing_information: [],
  required_documents: [],
  current_question: { text: "Otázka?", reason: "r" },
  next_step: { text: "n", condition: "c" },
  confidence: "low",
};
const renderWs = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DomeWorkspace item={item as any} />
    </QueryClientProvider>,
  );
const settle = () => new Promise((r) => setTimeout(r, 50));

beforeEach(() => {
  cleanup();
  aiCalls.length = 0;
});

describe("AI Independence — žádné automatické AI", () => {
  it("případ bez assessmentu: AI se nevolá, zobrazí se klidný stav a žádná chyba kreditů", async () => {
    steps = [];
    renderWs();
    await screen.findByTestId("no-auto-assessment");
    await settle();
    expect(aiCalls).toHaveLength(0);
    expect(screen.queryByText(/kredity/)).toBeNull();
  });

  it("případ s posledním assessmentem: AI se nevolá a uložený stav se zobrazí", async () => {
    steps = [
      { id: "a", kind: "dome_assessment", content: null, documentName: null, assessment, createdAt: "1" },
    ];
    renderWs();
    expect((await screen.findAllByText("Otázka?")).length).toBeGreaterThan(0);
    await settle();
    expect(aiCalls).toHaveLength(0);
    expect(screen.queryByTestId("no-auto-assessment")).toBeNull();
  });

  it("historie končící odpovědí uživatele: AI se nevolá, uložený stav zůstává", async () => {
    steps = [
      { id: "a", kind: "dome_assessment", content: null, documentName: null, assessment, createdAt: "1" },
      { id: "b", kind: "user_input", content: "odpověď", documentName: null, assessment: null, createdAt: "2" },
    ];
    renderWs();
    await screen.findByTestId("no-auto-assessment");
    await settle();
    expect(aiCalls).toHaveLength(0);
    expect(screen.getAllByText("Otázka?").length).toBeGreaterThan(0);
  });

  it("explicitní tlačítko AI zavolá assessCase právě jednou", async () => {
    steps = [];
    renderWs();
    fireEvent.click(await screen.findByRole("button", { name: /Spustit AI rozbor/ }));
    await waitFor(() => expect(aiCalls).toHaveLength(1));
    expect(aiCalls[0]).toEqual({ fn: "assessCase", data: { caseId: ID, accessToken: "token-xxxxxxxxxx" } });
  });
});
