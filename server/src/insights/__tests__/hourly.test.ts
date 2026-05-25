import { describe, it, expect } from "vitest";
import { bucketHourly } from "../hourly";
import type { UsageRecord } from "../../types";

function sess(lastActivity: string | undefined, cost: number): UsageRecord {
  return {
    period: `sess-${lastActivity ?? "na"}`,
    agent: "claude",
    totalTokens: 0,
    totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [],
    metadata: lastActivity ? { lastActivity } : {},
  };
}

describe("bucketHourly", () => {
  it("returns 24 zero-cost buckets when no sessions match today", () => {
    const out = bucketHourly({
      sessionRecords: [sess("2026-05-24T10:00:00Z", 5)],
      todayKey: "2026-05-25",
      tz: "UTC",
    });
    expect(out).toHaveLength(24);
    expect(out.every((b) => b.cost === 0)).toBe(true);
    expect(out.map((b) => b.hour)).toEqual([...Array(24).keys()]);
  });

  it("folds today's sessions into hour-of-day in the target TZ", () => {
    const out = bucketHourly({
      sessionRecords: [
        sess("2026-05-25T07:30:00Z", 1.5), // 00:30 PDT → bucket 0
        sess("2026-05-25T22:15:00Z", 2.5), // 15:15 PDT → bucket 15
      ],
      todayKey: "2026-05-25",
      tz: "America/Los_Angeles",
    });
    expect(out[0]?.cost).toBe(1.5);
    expect(out[15]?.cost).toBe(2.5);
  });

  it("tolerates sessions without metadata and with invalid timestamps", () => {
    const out = bucketHourly({
      sessionRecords: [sess(undefined, 99), sess("garbage", 99), sess("2026-05-25T10:00:00Z", 3)],
      todayKey: "2026-05-25",
      tz: "UTC",
    });
    expect(out[10]?.cost).toBe(3);
  });
});
