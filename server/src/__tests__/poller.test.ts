import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSnapshotStore } from "../snapshot-store";
import { createPoller, computeDerived } from "../poller";
import type { UsageRecord, Block } from "../types";

const TODAY = "2026-05-24";

function rec(period: string, tokens: number, cost: number): UsageRecord {
  return {
    period, agent: "all", totalTokens: tokens, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
  };
}

describe("computeDerived", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);

  it("sums today/week/month/all-time correctly", () => {
    const daily   = [rec("2026-05-23", 100, 1), rec("2026-05-24", 200, 2)];
    const weekly  = [rec("2026-W21", 1000, 10)];
    const monthly = [rec("2026-05", 5000, 50)];
    const d = computeDerived({ daily, weekly, monthly, session: [], blocks: [] }, now);
    expect(d.today).toEqual({ tokens: 200, cost: 2 });
    expect(d.week).toEqual({ tokens: 1000, cost: 10 });
    expect(d.month).toEqual({ tokens: 5000, cost: 50 });
    expect(d.allTime).toEqual({ tokens: 300, cost: 3 });
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
