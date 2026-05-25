import { describe, it, expect } from "vitest";
import {
  selectKpis, selectAgentBreakdown, selectDailySparkSeries,
  selectTrendSeries, selectTopSessions, selectTodayDriversFallback,
  applySessionFilters,
} from "@/views/v1/data/selectors";
import type { Snapshot, UsageRecord, ModelBreakdown } from "@/types";

function rec(period: string, agent: string, cost: number, tokens = 0, models: ModelBreakdown[] = []): UsageRecord {
  return {
    period, agent, totalTokens: tokens, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: models.map((m) => m.modelName), modelBreakdowns: models, metadata: {},
  };
}

function mb(name: string, cost: number): ModelBreakdown {
  return { modelName: name, cost, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
}

function makeSnap(dailyRecs: UsageRecord[], sessionRecs: UsageRecord[] = []): Snapshot {
  return {
    generatedAt: "2026-05-25T14:00:00Z",
    ccusageVersion: "0",
    daily:   { records: dailyRecs },
    weekly:  { records: [] },
    monthly: { records: [] },
    session: { records: sessionRecs },
    blocks:  { records: [] },
    derived: {
      today: { tokens: 0, cost: dailyRecs.filter((r) => r.period === "2026-05-25").reduce((s, r) => s + r.totalCost, 0) },
      week: { tokens: 0, cost: 0 },
      month: { tokens: 0, cost: 0 },
      allTime: { tokens: 0, cost: 0 },
      activeBlock: null, activeSessionCount: 0,
    },
  };
}

describe("selectKpis", () => {
  it("returns zeros when snapshot is null", () => {
    const k = selectKpis(null);
    expect(k.today.cost).toBe(0);
    expect(k.allTime.sessions).toBe(0);
  });

  it("reflects derived totals and session count from snapshot", () => {
    const snap = makeSnap(
      [rec("2026-05-25", "claude", 5)],
      [rec("s1", "claude", 1), rec("s2", "codex", 2)],
    );
    const k = selectKpis(snap);
    expect(k.today.cost).toBe(5);
    expect(k.allTime.sessions).toBe(2);
  });
});

describe("selectAgentBreakdown", () => {
  it("groups records by agent and accumulates cost across days", () => {
    const out = selectAgentBreakdown([
      rec("2026-05-25", "claude", 10),
      rec("2026-05-25", "codex", 20),
      rec("2026-05-24", "claude", 5),
    ]);
    const byAgent = Object.fromEntries(out.map((x) => [x.agent, x.cost]));
    expect(byAgent.claude).toBe(15);
    expect(byAgent.codex).toBe(20);
  });

  it("orders by descending cost", () => {
    const out = selectAgentBreakdown([
      rec("2026-05-25", "claude", 10),
      rec("2026-05-25", "codex", 20),
    ]);
    expect(out[0]?.agent).toBe("codex");
    expect(out[1]?.agent).toBe("claude");
  });
});

describe("selectDailySparkSeries", () => {
  it("sums per-day costs and returns trailing N values in chronological order", () => {
    const recs = [
      rec("2026-05-22", "claude", 1),
      rec("2026-05-22", "codex",  2),
      rec("2026-05-23", "claude", 5),
      rec("2026-05-24", "codex",  9),
    ];
    expect(selectDailySparkSeries(recs, 3)).toEqual([3, 5, 9]);
    expect(selectDailySparkSeries(recs, 2)).toEqual([5, 9]);
  });

  it("returns [] when records is empty", () => {
    expect(selectDailySparkSeries([])).toEqual([]);
  });
});

describe("selectTrendSeries", () => {
  it("pivots (period × agent) into one row per period with all agents present", () => {
    const recs = [
      rec("2026-05-23", "claude", 3),
      rec("2026-05-23", "codex",  2),
      rec("2026-05-24", "claude", 5),
    ];
    const { data, agents } = selectTrendSeries(recs, 30);
    expect(data.length).toBe(2);
    expect(agents).toEqual(["claude", "codex"]);
    // Every agent must be populated on every row (recharts stack contract).
    expect(data[0]?.claude).toBe(3);
    expect(data[0]?.codex).toBe(2);
    expect(data[0]?.total).toBe(5);
    expect(data[1]?.claude).toBe(5);
    expect(data[1]?.codex).toBe(0);
  });

  it("slices to the last N periods", () => {
    const recs = Array.from({ length: 10 }, (_, i) => rec(`2026-05-${String(i + 1).padStart(2, "0")}`, "claude", i + 1));
    const { data } = selectTrendSeries(recs, 3);
    expect(data.map((d) => d.period)).toEqual(["2026-05-08", "2026-05-09", "2026-05-10"]);
  });
});

describe("selectTopSessions", () => {
  it("returns N sessions sorted by cost desc", () => {
    const recs = [rec("s1", "a", 3), rec("s2", "a", 9), rec("s3", "a", 1), rec("s4", "a", 5)];
    const top = selectTopSessions(recs, 2);
    expect(top.map((r) => r.period)).toEqual(["s2", "s4"]);
  });
});

describe("selectTodayDriversFallback", () => {
  it("computes drivers from snapshot when server omitted them", () => {
    const snap = makeSnap([
      rec("2026-05-25", "claude", 7, 0, [mb("opus", 4), mb("sonnet", 3)]),
      rec("2026-05-25", "codex",  3, 0, [mb("gpt-5.4", 3)]),
    ]);
    const out = selectTodayDriversFallback(snap, "2026-05-25");
    expect(out.totalCostUSD).toBe(10);
    expect(out.agent?.name).toBe("claude");
    expect(out.agent?.pct).toBe(70);
    expect(out.model?.name).toBe("opus");
  });

  it("returns empty when null/zero", () => {
    expect(selectTodayDriversFallback(null, "2026-05-25").totalCostUSD).toBe(0);
    expect(selectTodayDriversFallback(makeSnap([]), "2026-05-25").totalCostUSD).toBe(0);
  });
});

describe("applySessionFilters", () => {
  it("applies agent, project, session, date chips and text search", () => {
    const sessions = [
      { ...rec("9f-1", "claude", 1), project: "alpha", modelsUsed: ["sonnet"], metadata: { lastActivity: "2026-05-25T10:00:00Z" } },
      { ...rec("9f-2", "codex",  2), project: "beta",  modelsUsed: ["gpt-5"], metadata: { lastActivity: "2026-05-25T11:00:00Z" } },
      { ...rec("9f-3", "claude", 3), project: "alpha", modelsUsed: ["sonnet"], metadata: { lastActivity: "2026-05-24T11:00:00Z" } },
    ];
    expect(applySessionFilters(sessions, [{ kind: "agent", value: "claude" }], "").length).toBe(2);
    expect(applySessionFilters(sessions, [{ kind: "project", value: "alpha" }], "").length).toBe(2);
    expect(applySessionFilters(sessions, [{ kind: "session", value: "9f-2" }], "").length).toBe(1);
    expect(applySessionFilters(sessions, [{ kind: "date", value: "2026-05-25" }], "").length).toBe(2);
    expect(applySessionFilters(sessions, [], "gpt").length).toBe(1);
  });
});
