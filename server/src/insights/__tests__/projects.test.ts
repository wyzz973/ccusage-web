import { describe, it, expect } from "vitest";
import { computeProjectRollups } from "../projects";
import type { UsageRecord } from "../../types";

function sess(project: string | undefined, cost: number, tokens = 1000): UsageRecord {
  return {
    period: `sess-${project}-${cost}`, agent: "claude",
    totalTokens: tokens, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [],
    metadata: {},
    project,
  };
}

describe("computeProjectRollups", () => {
  it("returns [] for empty input", () => {
    expect(computeProjectRollups({ sessionRecords: [] })).toEqual([]);
  });

  it("skips records with no project / 'unknown' project", () => {
    const out = computeProjectRollups({
      sessionRecords: [
        sess(undefined, 10),
        sess("unknown", 20),
        sess("", 30),
      ],
    });
    expect(out).toEqual([]);
  });

  it("rolls up by project canonical, sorts desc by cost", () => {
    const out = computeProjectRollups({
      sessionRecords: [
        sess("-Users-x-alpha", 60),
        sess("-Users-x-alpha", 10),
        sess("-Users-x-beta", 30),
      ],
    });
    expect(out.map((p) => p.canonical)).toEqual(["-Users-x-alpha", "-Users-x-beta"]);
    expect(out[0]?.cost).toBe(70);
    expect(out[0]?.sessions).toBe(2);
    expect(out[0]?.displayName).toBe("alpha");
  });

  it("computes pctOfWindow against same-source denominator (M-B1 invariant)", () => {
    const out = computeProjectRollups({
      sessionRecords: [
        sess("-x-alpha", 70),
        sess("-x-beta", 30),
      ],
    });
    expect(out[0]?.pctOfWindow).toBe(70);
    expect(out[1]?.pctOfWindow).toBe(30);
    // Never exceeds 100.
    for (const p of out) {
      expect(p.pctOfWindow).toBeLessThanOrEqual(100);
      expect(p.pctOfWindow).toBeGreaterThanOrEqual(0);
    }
  });

  it("guards against NaN costs", () => {
    const out = computeProjectRollups({
      sessionRecords: [sess("-a", Number.NaN), sess("-b", 5)],
    });
    expect(out.map((p) => p.displayName)).toEqual(["b"]);
  });
});
