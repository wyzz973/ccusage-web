// R3.7 — month-end projection.
//
// Server emits raw facts only; client applies the cap policy (see budget.ts
// header). These tests pin the projection arithmetic so the X1 banner +
// budget card render off honest numbers, not whatever the UI happens to do
// client-side.

import { describe, it, expect } from "vitest";
import { computeBudgetInsight } from "../budget";
import type { UsageRecord } from "../../types";

function rec(period: string, cost: number): UsageRecord {
  return {
    period, agent: "all",
    totalTokens: 0, totalCost: cost,
    inputTokens: 0, outputTokens: 0,
    cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
  };
}

describe("computeBudgetInsight (R3.7)", () => {
  it("monthToDateUSD only sums records matching the monthKey prefix", () => {
    const out = computeBudgetInsight({
      dailyRecords: [
        rec("2026-05-01", 10),
        rec("2026-05-15", 20),
        rec("2026-04-30", 999),   // prior month: excluded
        rec("2026-06-01", 999),   // next month: excluded
      ],
      monthKey: "2026-05",
      dayOfMonth: 15,
      daysInMonth: 31,
    });
    expect(out.monthToDateUSD).toBe(30);
  });

  it("monthEndProjectionUSD = MTD × (daysInMonth / dayOfMonth)", () => {
    const out = computeBudgetInsight({
      dailyRecords: [
        rec("2026-05-01", 50),
        rec("2026-05-10", 50),
      ],
      monthKey: "2026-05",
      dayOfMonth: 10,
      daysInMonth: 31,
    });
    // 100 USD MTD on day 10/31 → projection = 100 × 31/10 = 310
    expect(out.monthToDateUSD).toBe(100);
    expect(out.monthEndProjectionUSD).toBeCloseTo(310, 6);
  });

  it("server-side response always carries client-side fields as null/false", () => {
    const out = computeBudgetInsight({
      dailyRecords: [rec("2026-05-01", 1)],
      monthKey: "2026-05",
      dayOfMonth: 1,
      daysInMonth: 31,
    });
    expect(out.monthlyCapUSD).toBeNull();
    expect(out.overshootUSD).toBeNull();
    expect(out.overshootPct).toBeNull();
    expect(out.perBlockTokenLimit).toBeNull();
    expect(out.banner).toBe(false);
  });

  it("ignores NaN/Infinity costs (defensive: corrupt records shouldn't poison projection)", () => {
    const out = computeBudgetInsight({
      dailyRecords: [
        rec("2026-05-01", 10),
        rec("2026-05-02", Number.NaN),
        rec("2026-05-03", Number.POSITIVE_INFINITY),
        rec("2026-05-04", 20),
      ],
      monthKey: "2026-05",
      dayOfMonth: 4,
      daysInMonth: 30,
    });
    expect(out.monthToDateUSD).toBe(30);
  });

  it("dayOfMonth=0 is clamped to 1 (avoid div-by-zero on day rollover edge)", () => {
    const out = computeBudgetInsight({
      dailyRecords: [rec("2026-05-01", 10)],
      monthKey: "2026-05",
      dayOfMonth: 0,
      daysInMonth: 31,
    });
    expect(out.monthEndProjectionUSD).toBeCloseTo(310, 6); // 10 × 31 / 1
  });

  it("empty month → projection is 0, not NaN", () => {
    const out = computeBudgetInsight({
      dailyRecords: [rec("2026-04-01", 999)],
      monthKey: "2026-05",
      dayOfMonth: 15,
      daysInMonth: 31,
    });
    expect(out.monthToDateUSD).toBe(0);
    expect(out.monthEndProjectionUSD).toBe(0);
  });
});
