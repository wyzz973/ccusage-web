import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSnapshotStore } from "../snapshot-store";
import { createPoller, computeDerived } from "../poller";
import type { UsageRecord, Block } from "../types";

const TODAY = "2026-05-24";

function rec(period: string, tokens: number, cost: number, agent = "all"): UsageRecord {
  return {
    period, agent, totalTokens: tokens, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
  };
}

describe("computeDerived", () => {
  // 2026-05-24 is a Sunday. ccusage weekly anchors at Monday → "2026-05-18".
  const now = new Date(`${TODAY}T12:00:00Z`);

  it("sums today/week/month/all-time correctly with ccusage-shaped fixtures", () => {
    const daily   = [rec("2026-05-23", 100, 1), rec("2026-05-24", 200, 2)];
    // M-A1 (R1.5): weekly periods are ccusage's Monday-anchored YYYY-MM-DD,
    // NOT YYYY-Www. Fixture matches `npx ccusage weekly --json` output.
    const weekly  = [rec("2026-05-18", 1000, 10)];
    const monthly = [rec("2026-05", 5000, 50)];
    const d = computeDerived({ daily, weekly, monthly, session: [], blocks: [] }, now);
    expect(d.today).toEqual({ tokens: 200, cost: 2 });
    expect(d.week).toEqual({ tokens: 1000, cost: 10 });
    expect(d.month).toEqual({ tokens: 5000, cost: 50 });
    expect(d.allTime).toEqual({ tokens: 300, cost: 3 });
  });

  // Round-1 bug fix #1 + R1.5 bug fix M-A1 combined regression: week/month
  // filter by the current period key AND that key uses the Monday-anchored
  // YYYY-MM-DD shape ccusage actually emits (not YYYY-Www).
  it("filters week/month to the current ccusage-shaped period key", () => {
    const daily   = [rec("2026-05-23", 100, 1), rec("2026-05-24", 200, 2)];
    const weekly  = [
      rec("2026-05-11", 9999, 99),     // last week (Mon-anchor) — must NOT be counted
      rec("2026-05-18", 1000, 10),     // current week (Monday of week containing 2026-05-24)
      rec("2026-05-25", 12345, 123),   // next week — must NOT be counted
      rec("2026-W21", 7777, 77),       // legacy ISO-Www shape — must NOT be counted
    ];
    const monthly = [
      rec("2026-04", 9999, 99),        // last month — must NOT be counted
      rec("2026-05", 5000, 50),        // current month
    ];
    const d = computeDerived({ daily, weekly, monthly, session: [], blocks: [] }, now);
    expect(d.week).toEqual({ tokens: 1000, cost: 10 });
    expect(d.month).toEqual({ tokens: 5000, cost: 50 });
  });

  // Round-1 bug fix #3 — today must roll over at local TZ midnight, not 00:00 UTC.
  it("uses the local TZ to derive todayKey (regression: bug fix #3)", () => {
    const lateUtc = new Date("2026-05-25T06:00:00Z"); // 23:00 PDT on May 24
    const dailyLA = [rec("2026-05-24", 100, 1), rec("2026-05-25", 999, 9.99)];
    const d = computeDerived(
      { daily: dailyLA, weekly: [], monthly: [], session: [], blocks: [] },
      lateUtc,
      { tz: "America/Los_Angeles" },
    );
    // Local LA day is still 2026-05-24, so today should pick that bucket.
    expect(d.today).toEqual({ tokens: 100, cost: 1 });
  });

  it("populates additive todayDrivers and deltas fields", () => {
    const daily = [
      rec("2026-05-23", 0, 10, "claude"),
      rec("2026-05-24", 0, 72, "claude"),
      rec("2026-05-24", 0, 28, "codex"),
    ];
    const d = computeDerived({ daily, weekly: [], monthly: [], session: [], blocks: [] }, now);
    expect(d.todayDrivers?.agent?.name).toBe("claude");
    expect(d.todayDrivers?.agent?.pct).toBe(72);
    expect(d.deltas?.today.pct).toBeCloseTo((100 - 10) / 10);
    expect(d.deltas?.today.vsLabel).toBe("vs yesterday");
  });

  it("picks active block", () => {
    const active: Block = {
      id: "x", startTime: "", endTime: "", actualEndTime: null,
      isActive: true, isGap: false, costUSD: 0, totalTokens: 0, entries: 0,
      models: [], burnRate: null, projection: null,
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    };
    const d = computeDerived({ daily: [], weekly: [], monthly: [], session: [], blocks: [active] }, now);
    expect(d.activeBlock).toBe(active);
  });

  it("counts active sessions (lastActivity within 30min)", () => {
    const recent = { ...rec("s1", 0, 0), metadata: { lastActivity: new Date(now.getTime() - 5 * 60_000).toISOString() } };
    const stale  = { ...rec("s2", 0, 0), metadata: { lastActivity: new Date(now.getTime() - 60 * 60_000).toISOString() } };
    const d = computeDerived({ daily: [], weekly: [], monthly: [], session: [recent, stale], blocks: [] }, now);
    expect(d.activeSessionCount).toBe(1);
  });

  it("tolerates session records without metadata field", () => {
    const noMeta = { ...rec("s1", 0, 0) };
    delete (noMeta as Partial<typeof noMeta>).metadata;
    const d = computeDerived({ daily: [], weekly: [], monthly: [], session: [noMeta], blocks: [] }, now);
    expect(d.activeSessionCount).toBe(0);
  });
});

describe("poller", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(`${TODAY}T12:00:00Z`) }));
  afterEach(() => vi.useRealTimers());

  it("runs all five commands and populates store", async () => {
    const store = createSnapshotStore();
    const runMock = vi.fn(async (cmd: string) => {
      const key = cmd === "blocks" ? "blocks" : cmd;
      return { [key]: [] };
    });
    const poller = createPoller({
      store,
      runCcusage: runMock as never,
      getVersion: async () => "1.2.3",
      intervalMs: 10_000,
      now: () => new Date(`${TODAY}T12:00:00Z`),
    });
    await poller.runOnce();
    expect(runMock).toHaveBeenCalledTimes(5);
    const snap = store.get();
    expect(snap?.ccusageVersion).toBe("1.2.3");
    expect(snap?.daily.records).toEqual([]);
  });

  it("records error when a command throws and keeps last snapshot", async () => {
    const store = createSnapshotStore();
    const runMock = vi.fn(async () => { throw new Error("bad"); });
    const poller = createPoller({
      store,
      runCcusage: runMock as never,
      getVersion: async () => "1.0.0",
      intervalMs: 10_000,
      now: () => new Date(`${TODAY}T12:00:00Z`),
    });
    await poller.runOnce();
    expect(store.getHealth().lastError).toMatch(/bad/);
    expect(store.get()).toBeNull();
  });
});
