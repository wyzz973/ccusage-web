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
      todaysSessions: [{ agent: "claude", project: undefined, cost: 5 }, { agent: "claude", project: "unknown", cost: 5 }],
    });
    expect(out.project).toBeUndefined();
  });

  it("picks the top project when sessions are attributed", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [rec("claude", "2026-05-25", 100)],
      todaysSessions: [
        { agent: "claude", project: "client-a", cost: 60 },
        { agent: "claude", project: "ledger", cost: 30 },
        { agent: "claude", project: "unknown", cost: 10 },
      ],
    });
    // M-B1 (R1.5.1): project denominator is now the session-rolled total
    // *of attributed projects* (60 + 30 = 90), not the daily total (100).
    // Matches the numerator's source so pct cannot exceed 100 %.
    expect(out.project?.name).toBe("client-a");
    expect(out.project?.pct).toBe(67); // 60 / 90 rounded
  });

  it("guards against NaN/Infinity costs", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [rec("claude", "2026-05-25", Number.NaN), rec("codex", "2026-05-25", 10)],
    });
    expect(out.agent?.name).toBe("codex");
    expect(out.totalCostUSD).toBe(10);
  });

  // M-A3 (R1.5): ccusage daily emits `agent: "all"`; sessions carry real agent
  // labels. The driver strip must surface a real agent name, not "all"/"unknown".
  it("prefers session-level agent rollup over daily's 'all' sentinel (M-A3)", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [
        rec("all", "2026-05-25", 100, [{ modelName: "opus", cost: 70, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }]),
      ],
      todaysSessions: [
        { agent: "claude", cost: 70 },
        { agent: "codex",  cost: 30 },
      ],
    });
    expect(out.agent?.name).toBe("claude");
    expect(out.agent?.name).not.toBe("all");
    expect(out.agent?.name).not.toBe("unknown");
    expect(out.agent?.pct).toBe(70);
  });

  it("falls back to metadata.agents[0] when sessions are absent (M-A3 fallback)", () => {
    const out = computeTodayDrivers({
      todaysDailyRecords: [{
        ...rec("all", "2026-05-25", 50),
        metadata: { agents: ["codex"] },
      }],
    });
    expect(out.agent?.name).toBe("codex");
  });

  // M-B1 (R1.5.1): regression — session/daily totals legitimately diverge
  // for the same day in ccusage (different aggregation paths). Mixing a
  // session-derived numerator with the daily-derived total produced
  // pct > 100 in the wild (live ~/.claude data: "Claude · 119 %"). Two-part
  // contract: (1) the per-dimension denominator must match the source the
  // numerator came from; (2) topSegment clamps 0..100 belt-and-braces.
  describe("M-B1 (R1.5.1): pct never exceeds 100 even with divergent totals", () => {
    it("uses session-rolled denominator when agents come from sessions", () => {
      // Construct the pathological case explicitly:
      //   sessions: claude=$120, codex=$26  → sumSessions = $146
      //   daily:    one record of $100 (less than top agent's session cost)
      // Old code: 120/100 = 120 % (contract violation).
      // New code: 120/146 ≈ 82 % (matched denominator).
      const out = computeTodayDrivers({
        todaysDailyRecords: [rec("all", "2026-05-25", 100)],
        todaysSessions: [
          { agent: "claude", cost: 120 },
          { agent: "codex",  cost:  26 },
        ],
      });
      expect(out.agent?.name).toBe("claude");
      expect(out.agent?.pct).toBeLessThanOrEqual(100);
      expect(out.agent?.pct).toBe(82); // 120 / 146 rounded
    });

    it("clamps pct to <= 100 even if a future denominator mismatch reintroduces the bug", () => {
      // Force pct > 100 via the model path (daily-numerator + daily-denom,
      // but with a model breakdown cost > the totalCostUSD — which can happen
      // if upstream emits cache adjustments that net out at the row level).
      // Daily totalCost = $10, single model breakdown cost = $50 → would
      // compute 500 % without the clamp.
      const out = computeTodayDrivers({
        todaysDailyRecords: [
          rec("all", "2026-05-25", 10, [
            { modelName: "opus", cost: 50, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
          ]),
        ],
      });
      expect(out.model?.pct).toBeLessThanOrEqual(100);
      expect(out.model?.pct).toBeGreaterThanOrEqual(0);
    });

    it("uses session-rolled denominator for project segment as well", () => {
      const out = computeTodayDrivers({
        todaysDailyRecords: [rec("all", "2026-05-25", 50)],
        todaysSessions: [
          { agent: "claude", project: "alpha", cost: 80 },
          { agent: "claude", project: "beta",  cost: 20 },
        ],
      });
      expect(out.project?.name).toBe("alpha");
      // 80 / 100 = 80 %, not 80 / 50 = 160 %.
      expect(out.project?.pct).toBe(80);
      expect(out.project?.pct).toBeLessThanOrEqual(100);
    });

    it("every returned segment honors 0 <= pct <= 100, integer (contract from DriverSegment.pct comment)", () => {
      const out = computeTodayDrivers({
        todaysDailyRecords: [
          rec("all", "2026-05-25", 7.55, [
            { modelName: "opus", cost: 6.13, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
            { modelName: "sonnet", cost: 1.42, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
          ]),
        ],
        todaysSessions: [
          { agent: "claude", project: "ccusage-web", cost: 5.10 },
          { agent: "codex",  project: "ccusage-web", cost: 2.04 },
          { agent: "gemini", project: "ledger",      cost: 0.41 },
        ],
      });
      for (const seg of [out.agent, out.model, out.project]) {
        if (!seg) continue;
        expect(seg.pct).toBeLessThanOrEqual(100);
        expect(seg.pct).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(seg.pct)).toBe(true);
      }
    });
  });
});
