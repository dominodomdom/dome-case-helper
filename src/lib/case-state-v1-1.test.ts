import { describe, expect, it } from "vitest";
import { DOME_CASE_SCHEMA_VERSION, normalizeCaseState, validateCaseState } from "./case-state";

describe("DomeCaseState schema 1.1", () => {
  it("normalizes a v1.0 state additively without promoting legacy links to verified evidence", () => {
    const legacy = {
      case_state: {
        dome_case_schema_version: "1.0",
        case_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "ACTIVE",
        user_goal: "Zachovat původní cíl",
        system_interpretation: null,
        reality: [],
        person: {},
        needs: [],
        tracks: [],
        actions: [],
        unknowns: [],
        links: {
          routes: [],
          evidence: [
            { id: "old-evidence", label: "Doklad zmíněný ve starém stavu", source: "DOCUMENT", reality_ids: [] },
          ],
          deadlines: [
            { id: "old-deadline", label: "Lhůta uvedená ve starém stavu", date: null, source: "DOCUMENT" },
          ],
          risks: [{ id: "old-risk", label: "Dříve zaznamenané riziko" }],
          gaps: [],
        },
        metadata: {
          last_updated: "2026-01-01T00:00:00.000Z",
          version: 1,
          legacy_normalized: false,
          signals: [],
        },
      },
    };

    const normalized = normalizeCaseState(legacy, "123e4567-e89b-12d3-a456-426614174000");

    expect(normalized).not.toBeNull();
    expect(normalized?.dome_case_schema_version).toBe(DOME_CASE_SCHEMA_VERSION);
    expect(normalized?.user_goal).toBe("Zachovat původní cíl");
    expect(normalized?.evidence).toEqual([
      {
        id: "old-evidence",
        kind: "OTHER_VERIFIABLE_SOURCE",
        ref: "old-evidence",
        source: "DOCUMENT",
        verified: false,
        reality_ids: [],
      },
    ]);
    expect(normalized?.deadlines?.[0]).toMatchObject({
      id: "old-deadline",
      date: null,
      date_status: "UNKNOWN",
      anchor_type: null,
      evidence_ids: [],
    });
    expect(normalized?.risks?.[0]).toMatchObject({
      id: "old-risk",
      level: "UNKNOWN",
      status: "UNKNOWN",
      evidence_ids: [],
    });
    expect(normalized && validateCaseState(normalized)).toEqual([]);

    if (normalized) {
      normalized.evidence_links = [{
        id: "broken-link",
        evidence_id: "missing-evidence",
        reality_id: "missing-reality",
        relation: "SUPPORTS",
      }];
      expect(validateCaseState(normalized)).toEqual(expect.arrayContaining([
        "evidence_link broken-link: neznámá evidence",
        "evidence_link broken-link: neznámá reality",
      ]));

      normalized.deadlines = [{
        id: "bad-deadline",
        label: "Neplatný termín",
        date: null,
        date_status: "KNOWN",
        source: "SYSTEM",
        anchor_type: "NEED",
        anchor_ref: null,
        evidence_ids: [],
      }];
      expect(validateCaseState(normalized)).toEqual(expect.arrayContaining([
        "deadline bad-deadline: date_status",
        "deadline bad-deadline: neúplná vazba anchor",
      ]));
    }
  });

  it("fills absent v1.1 collections with empty arrays", () => {
    const state = {
      case_state: {
        dome_case_schema_version: "1.1",
        case_id: "123e4567-e89b-12d3-a456-426614174000",
        status: "ACTIVE",
        user_goal: null,
        system_interpretation: null,
        reality: [],
        person: {},
        needs: [],
        tracks: [],
        actions: [],
        unknowns: [],
        links: { routes: [], evidence: [], deadlines: [], risks: [], gaps: [] },
        metadata: { last_updated: "2026-01-01T00:00:00.000Z", version: 1, legacy_normalized: false, signals: [] },
      },
    };

    const normalized = normalizeCaseState(state, "123e4567-e89b-12d3-a456-426614174000");

    expect(normalized?.documents).toEqual([]);
    expect(normalized?.evidence).toEqual([]);
    expect(normalized?.evidence_links).toEqual([]);
    expect(normalized?.timeline).toEqual([]);
    expect(normalized?.deadlines).toEqual([]);
    expect(normalized?.risks).toEqual([]);
  });
});
