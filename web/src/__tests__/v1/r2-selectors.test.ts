import { describe, it, expect } from "vitest";
import { selectDailyInRange, selectSessionsInRange } from "@/views/v1/data/selectors";
import type { UsageRecord } from "@/types";

function day(period: string): UsageRecord {
  return {
    period, agent: "all",
    totalTokens: 0, totalCost: 0,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
  };
}

function sess(lastActivity: string): UsageRecord {
  return {
    period: `s-${lastActivity}`, agent: "claude",
    totalTokens: 0, totalCost: 0,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [],
    metadata: { lastActivity },
  };
}

describe("selectDailyInRange (D2)", () => {
  const recs = [
    day("2026-05-10"), day("2026-05-15"), day("2026-05-20"),
    day("2026-05-25"), day("2026-05-30"),
  ];

  it("returns records whose period falls inside [from, to] inclusive", () => {
    const out = selectDailyInRange(recs, { from: "2026-05-15", to: "2026-05-25" });
    expect(out.map((r) => r.period)).toEqual(["2026-05-15", "2026-05-20", "2026-05-25"]);
  });

  it("returns [] when no records match", () => {
    expect(selectDailyInRange(recs, { from: "2026-06-01", to: "2026-06-30" })).toEqual([]);
  });

  it("includes single-day window edge-case", () => {
    expect(selectDailyInRange(recs, { from: "2026-05-20", to: "2026-05-20" })).toHaveLength(1);
  });
});

describe("selectSessionsInRange (D2 S13)", () => {
  const recs = [
    sess("2026-05-10T10:00:00Z"),
    sess("2026-05-15T11:00:00Z"),
    sess("2026-05-20T12:00:00Z"),
  ];

  it("filters by lastActivity day, inclusive", () => {
    const out = selectSessionsInRange(recs, { from: "2026-05-12", to: "2026-05-18" });
    expect(out).toHaveLength(1);
  });

  it("skips sessions without lastActivity", () => {
    const noMeta = sess("");
    delete noMeta.metadata!.lastActivity;
    const out = selectSessionsInRange([noMeta], { from: "2026-05-01", to: "2026-12-31" });
    expect(out).toEqual([]);
  });
});
