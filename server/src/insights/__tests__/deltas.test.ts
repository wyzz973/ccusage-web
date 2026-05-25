import { describe, it, expect } from "vitest";
import { computeSnapshotDeltas, previousPeriodKeys } from "../deltas";
import type { UsageRecord } from "../../types";

function rec(period: string, cost: number): UsageRecord {
  return {
    period, agent: "all", totalTokens: 0, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
  };
}

describe("computeSnapshotDeltas", () => {
  it("returns relative deltas across today/week/month", () => {
    const out = computeSnapshotDeltas({
      todayKey: "2026-05-25", yesterdayKey: "2026-05-24",
      weekKey: "2026-W22", prevWeekKey: "2026-W21",
      monthKey: "2026-05", prevMonthKey: "2026-04",
      dailyRecords: [rec("2026-05-24", 10), rec("2026-05-25", 12)],
      weeklyRecords: [rec("2026-W21", 90), rec("2026-W22", 100)],
      monthlyRecords: [rec("2026-04", 400), rec("2026-05", 500)],
    });
    expect(out.today.pct).toBeCloseTo(0.2);
    expect(out.week.pct).toBeCloseTo(0.1111, 3);
    expect(out.month.pct).toBeCloseTo(0.25);
    expect(out.today.vsLabel).toBe("vs yesterday");
    expect(out.week.vsLabel).toBe("vs last week");
    expect(out.month.vsLabel).toBe("vs last month");
  });

  it("returns null pct when prior period is zero (cold start)", () => {
    const out = computeSnapshotDeltas({
      todayKey: "2026-05-25", yesterdayKey: "2026-05-24",
      weekKey: "2026-W22", prevWeekKey: "2026-W21",
      monthKey: "2026-05", prevMonthKey: "2026-04",
      dailyRecords: [rec("2026-05-25", 12)],
      weeklyRecords: [rec("2026-W22", 100)],
      monthlyRecords: [rec("2026-05", 500)],
    });
    expect(out.today.pct).toBeNull();
    expect(out.week.pct).toBeNull();
    expect(out.month.pct).toBeNull();
  });

  it("ignores records for unrelated periods", () => {
    const out = computeSnapshotDeltas({
      todayKey: "2026-05-25", yesterdayKey: "2026-05-24",
      weekKey: "2026-W22", prevWeekKey: "2026-W21",
      monthKey: "2026-05", prevMonthKey: "2026-04",
      dailyRecords: [
        rec("2026-05-20", 1000),
        rec("2026-05-24", 10),
        rec("2026-05-25", 12),
      ],
      weeklyRecords: [], monthlyRecords: [],
    });
    expect(out.today.current).toBe(12);
    expect(out.today.previous).toBe(10);
  });
});

describe("previousPeriodKeys", () => {
  it("computes yesterday/prev-week/prev-month relative to now in TZ", () => {
    const k = previousPeriodKeys(new Date("2026-05-25T14:23:07Z"), "UTC");
    expect(k.yesterdayKey).toBe("2026-05-24");
    expect(k.prevWeekKey).toBe("2026-W21");
    expect(k.prevMonthKey).toBe("2026-04");
  });
});
