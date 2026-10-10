/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { recordAssessment, DomeError, CONCURRENCY_CONFLICT_MESSAGE } from "@/lib/dome.server";

/**
 * Věrná simulace 3-param RPC: per-case zámek (FOR UPDATE = serializace), kontrola verze, INSERT.
 * Chyby mají stejný tvar jako PostgREST (code + message).
 */
function fakeDb(opts: { uid?: string | null; access?: boolean; owner?: string } = {}) {
  const uid = opts.uid === undefined ? "u1" : opts.uid;
  const steps: { case_id: string; assessment: any }[] = [];
  const calls: any[] = [];
  let lock: Promise<void> = Promise.resolve();
  const rpc = async (name: string, args: any) => {
    calls.push({ name, args });
    if (!("p_expected_version" in args))
      return { data: null, error: { code: "PGRST202", message: "2-param not used" } };
    const run = async () => {
      await new Promise((r) => setTimeout(r, 5)); // simulace práce uvnitř transakce
      if (!uid) return { data: null, error: { code: "42501", message: "NOT_AUTHENTICATED" } };
      if (args.p_expected_version == null || args.p_expected_version < 0)
        return { data: null, error: { code: "22023", message: "EXPECTED_VERSION_REQUIRED" } };
      if (opts.access === false)
        return { data: null, error: { code: "42501", message: "ACCESS_DENIED" } };
      if ((opts.owner ?? "u1") !== uid)
        return { data: null, error: { code: "42501", message: "CASE_NOT_FOUND" } };
      if (args.p_assessment?.hypothesis?.status !== "unverified")
        return { data: null, error: { code: "22023", message: "HYPOTHESIS_MUST_BE_UNVERIFIED" } };
      const last = steps.filter((s) => s.case_id === args.p_case_id).at(-1);
      const current = last?.assessment?.case_state?.metadata?.version ?? 0;
      if (current !== args.p_expected_version)
        return { data: null, error: { code: "P0001", message: "CONCURRENCY_CONFLICT" } };
      if (args.p_assessment?.case_state?.metadata?.version !== args.p_expected_version + 1)
        return { data: null, error: { code: "22023", message: "INVALID_NEW_VERSION" } };
      steps.push({ case_id: args.p_case_id, assessment: args.p_assessment });
      return { data: "id", error: null };
    };
    const p = lock.then(run);
    lock = p.then(() => undefined);
    return p;
  };
  return { sb: { rpc } as any, steps, calls };
}
const A = (v: number, status = "unverified") => ({
  hypothesis: { status },
  case_state: { metadata: { version: v } },
});
const C = "11111111-1111-4111-8111-111111111111";
const status = (e: unknown) => (e instanceof DomeError ? e.status : -1);

describe("D2 atomic concurrency", () => {
  it("volá 3-param RPC s p_expected_version; počáteční verze 0 → 1", async () => {
    const db = fakeDb();
    await recordAssessment(db.sb, C, A(1), 0);
    expect(db.calls[0]).toEqual({
      name: "urad_record_dome_assessment",
      args: { p_case_id: C, p_assessment: A(1), p_expected_version: 0 },
    });
    await recordAssessment(db.sb, C, A(2), 1);
    expect(db.steps.map((s) => s.assessment.case_state.metadata.version)).toEqual([1, 2]);
  });

  it("dvě souběžné transakce se stejnou verzí: právě jedna projde, druhá 409 CONCURRENCY_CONFLICT", async () => {
    const db = fakeDb();
    await recordAssessment(db.sb, C, A(1), 0);
    const r = await Promise.allSettled([
      recordAssessment(db.sb, C, A(2), 1),
      recordAssessment(db.sb, C, A(2), 1),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rej = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(status(rej.reason)).toBe(409);
    expect(rej.reason.message).toBe(CONCURRENCY_CONFLICT_MESSAGE);
    expect(db.steps).toHaveLength(2); // nic se tiše nepřepsalo
  });

  it("10 souběžných zápisů: uloží se jen jeden, ostatní 409", async () => {
    const db = fakeDb();
    const r = await Promise.allSettled(
      Array.from({ length: 10 }, () => recordAssessment(db.sb, C, A(1), 0)),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      r
        .filter((x) => x.status === "rejected")
        .every((x) => status((x as PromiseRejectedResult).reason) === 409),
    ).toBe(true);
    expect(db.steps).toHaveLength(1);
  });

  it("zastaralá verze → 409; DB P0001 se přeloží na 409", async () => {
    const db = fakeDb();
    await recordAssessment(db.sb, C, A(1), 0);
    await recordAssessment(db.sb, C, A(2), 1);
    await expect(recordAssessment(db.sb, C, A(2), 1)).rejects.toMatchObject({ status: 409 });
    const raw = {
      rpc: async () => ({
        data: null,
        error: { code: "P0001", message: "CONCURRENCY_CONFLICT", details: "expected 3, current 4" },
      }),
    } as any;
    await expect(recordAssessment(raw, C, A(4), 3)).rejects.toMatchObject({ status: 409 });
  });

  it("neplatná verze se odmítne ještě před voláním DB (žádný NULL / záporná / nesouvislá)", async () => {
    const db = fakeDb();
    for (const [a, v] of [
      [A(1), null],
      [A(1), -1],
      [A(1), 1.5],
      [A(5), 0],
      [A(0), 0],
      [{ hypothesis: { status: "unverified" } }, 0],
    ] as const) {
      await expect(recordAssessment(db.sb, C, a as any, v as any)).rejects.toMatchObject({
        status: 422,
      });
    }
    expect(db.calls).toHaveLength(0);
  });

  it("negativní scénáře z DB: nepřihlášený, bez přístupu, cizí případ, ověřená hypotéza → chyba, nic se neuloží, není 409", async () => {
    for (const [db, a] of [
      [fakeDb({ uid: null }), A(1)],
      [fakeDb({ access: false }), A(1)],
      [fakeDb({ owner: "u2" }), A(1)],
      [fakeDb(), A(1, "verified")],
    ] as const) {
      const e = await recordAssessment(db.sb, C, a, 0).catch((x) => x);
      expect(e).toBeInstanceOf(DomeError);
      expect(e.status).not.toBe(409);
      expect(db.steps).toHaveLength(0);
    }
  });

  it("jiné P0001 (např. deprecated 2-param) se nevydává za konflikt", async () => {
    const raw = {
      rpc: async () => ({
        data: null,
        error: { code: "P0001", message: "DEPRECATED_USE_EXPECTED_VERSION" },
      }),
    } as any;
    const e = await recordAssessment(raw, C, A(1), 0).catch((x) => x);
    expect(e.status).toBe(500);
  });
});
