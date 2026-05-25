import { describe, it, expect } from "vitest";
import { computeCacheInsight } from "../cache";
import { createPricing } from "../../native/pricing";
import type { UsageRecord, ModelBreakdown } from "../../types";

function mb(model: string, partial: Partial<ModelBreakdown> = {}): ModelBreakdown {
  return {
    modelName: model, cost: 0,
    inputTokens: 0, outputTokens: 0,
    cacheCreationTokens: 0, cacheReadTokens: 0,
    ...partial,
  };
}

function day(period: string, fields: Partial<UsageRecord> = {}): UsageRecord {
  return {
    period, agent: "all",
    totalTokens: 0, totalCost: 0,
    inputTokens: 0, outputTokens: 0,
    cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
    ...fields,
  };
}

const pricing = createPricing();

describe("computeCacheInsight", () => {
  it("hitPct null when denominator is 0 (D=0 invariant)", () => {
    const out = computeCacheInsight({ dailyRecords: [], pricing });
    expect(out.hitPct).toBeNull();
    expect(out.savedUSD).toBe(0);
    expect(out.sparkPctPerDay).toEqual([]);
    expect(out.wkOverWkDropPct).toBeNull();
  });

  it("hitPct = cacheRead / (input + cacheCreate + cacheRead)", () => {
    const out = computeCacheInsight({
      dailyRecords: [day("2026-05-25", {
        inputTokens: 100,
        cacheCreationTokens: 200,
        cacheReadTokens: 700,
        totalCost: 0,
        modelBreakdowns: [mb("claude-haiku-4-5", { cacheReadTokens: 700, cost: 0 })],
      })],
      pricing,
    });
    expect(out.hitPct).toBeCloseTo(0.7, 6);
  });

  it("savedUSD = sum over rows of cacheRead * (input_rate - cache_read_rate)", () => {
    // claude-haiku-4-5: input 1e-6, cache_read 0.1e-6 → saved = cacheRead * 0.9e-6
    const out = computeCacheInsight({
      dailyRecords: [day("2026-05-25", {
        cacheReadTokens: 1_000_000,
        modelBreakdowns: [mb("claude-haiku-4-5", { cacheReadTokens: 1_000_000 })],
      })],
      pricing,
    });
    // Saved ≈ 1_000_000 * (1e-6 - 0.1e-6) = 0.9
    expect(out.savedUSD).toBeCloseTo(0.9, 4);
  });

  it("sparkPctPerDay produces a per-day series sorted oldest → newest", () => {
    const out = computeCacheInsight({
      dailyRecords: [
        day("2026-05-23", { inputTokens: 50, cacheReadTokens: 50 }),
        day("2026-05-24", { inputTokens: 0,  cacheReadTokens: 100 }),
      ],
      pricing,
    });
    expect(out.sparkPctPerDay).toEqual([0.5, 1.0]);
  });

  it("wkOverWkDropPct null when fewer than 8 days of data", () => {
    const out = computeCacheInsight({
      dailyRecords: [day("2026-05-25", { inputTokens: 50, cacheReadTokens: 50 })],
      pricing,
    });
    expect(out.wkOverWkDropPct).toBeNull();
  });

  it("wkOverWkDropPct null when prior week's baseline is <5%", () => {
    const days: UsageRecord[] = [];
    for (let i = 0; i < 14; i++) {
      days.push(day(`2026-05-${10 + i}`, {
        inputTokens: 1000,
        cacheReadTokens: i < 7 ? 0 : 100, // prior week 0% hit, recent week 9%
      }));
    }
    const out = computeCacheInsight({ dailyRecords: days, pricing });
    expect(out.wkOverWkDropPct).toBeNull();
  });

  it("wkOverWkDropPct positive when recent week hits drop from a ≥5% baseline", () => {
    const days: UsageRecord[] = [];
    for (let i = 0; i < 14; i++) {
      days.push(day(`2026-05-${10 + i}`, {
        inputTokens: 1000,
        cacheReadTokens: i < 7 ? 500 : 100, // prior 33% → recent 9%
      }));
    }
    const out = computeCacheInsight({ dailyRecords: days, pricing });
    expect(out.wkOverWkDropPct).not.toBeNull();
    expect(out.wkOverWkDropPct!).toBeGreaterThan(0.2);
  });
});
