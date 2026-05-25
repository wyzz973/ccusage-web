import { describe, it, expect } from "vitest";
import { computeTodayDrivers } from "../drivers";
import type { UsageRecord, ModelBreakdown } from "../../types";

function rec(agent: string, period: string, cost: number, models: ModelBreakdown[] = []): UsageRecord {
  return {
    period, agent, totalTokens: 0, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: models.map((m) => m.modelName), modelBreakdowns: models, metadata: {},
  };
}

function mb(name: string, cost: number): ModelBreakdown {
  return { modelName: name, cost, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
}

describe("computeTodayDrivers", () => {
  it("returns empty driver set when today has zero cost", () => {
    const out = computeTodayDrivers({ todaysDailyRecords: [] });
    expect(out.totalCostUSD).toBe(0);
    expect(out.agent).toBeUndefined();
    expect(out.model).toBeUndefined();
    expect(out.project).toBeUndefined();
  });

  it("picks the top agent by USD share with integer pct", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [
        rec("claude", "2026-05-25", 72),
        rec("codex",  "2026-05-25", 28),
      ],
    });
    expect(out.agent?.name).toBe("claude");
    expect(out.agent?.pct).toBe(72);
    expect(out.agent?.costUSD).toBe(72);
    expect(out.totalCostUSD).toBe(100);
  });

  it("picks the top model by USD share across all daily records", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [
        rec("claude", "2026-05-25", 50, [mb("opus", 30), mb("sonnet", 20)]),
        rec("codex",  "2026-05-25", 50, [mb("gpt-5.4", 50)]),
      ],
    });
    expect(out.model?.name).toBe("gpt-5.4");
    expect(out.model?.pct).toBe(50);
  });

  it("omits project segment when sessions are unattributed (Round-1 default)", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [rec("claude", "2026-05-25", 10)],
      todaysSessions: [{ project: undefined, cost: 5 }, { project: "unknown", cost: 5 }],
    });
    expect(out.project).toBeUndefined();
  });

  it("picks the top project when sessions are attributed", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [rec("claude", "2026-05-25", 100)],
      todaysSessions: [
        { project: "client-a", cost: 60 },
        { project: "ledger", cost: 30 },
        { project: "unknown", cost: 10 },
      ],
    });
    expect(out.project?.name).toBe("client-a");
    expect(out.project?.pct).toBe(60);
  });

  it("guards against NaN/Infinity costs", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [rec("claude", "2026-05-25", Number.NaN), rec("codex", "2026-05-25", 10)],
    });
    expect(out.agent?.name).toBe("codex");
    expect(out.totalCostUSD).toBe(10);
  });
});
