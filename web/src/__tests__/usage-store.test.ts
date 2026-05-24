import { describe, it, expect } from "vitest";
import { useUsageStore } from "@/store/usage-store";
import type { Snapshot } from "@/types";

function snap(at: string, tokens: number): Snapshot {
  return {
    generatedAt: at, ccusageVersion: "1.0.0",
    daily: { records: [] }, weekly: { records: [] }, monthly: { records: [] },
    session: { records: [] }, blocks: { records: [] },
    derived: {
      today:   { tokens, cost: 0 }, week: { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 }, allTime: { tokens: 0, cost: 0 },
      activeBlock: null, activeSessionCount: 0,
    },
  };
}

describe("useUsageStore", () => {
  it("default state", () => {
    const s = useUsageStore.getState();
    expect(s.snapshot).toBeNull();
    expect(s.connectionStatus).toBe("connecting");
    expect(s.lastError).toBeNull();
  });

  it("setSnapshot replaces snapshot atomically", () => {
    useUsageStore.getState().setSnapshot(snap("2026-05-24T10:00:00Z", 100));
    expect(useUsageStore.getState().snapshot?.derived.today.tokens).toBe(100);
    useUsageStore.getState().setSnapshot(snap("2026-05-24T10:00:02Z", 200));
    expect(useUsageStore.getState().snapshot?.derived.today.tokens).toBe(200);
  });

  it("setStatus updates connection status", () => {
    useUsageStore.getState().setStatus("connected");
    expect(useUsageStore.getState().connectionStatus).toBe("connected");
  });

  it("setError stores message", () => {
    useUsageStore.getState().setError("oops", "2026-05-24T10:00:00Z");
    expect(useUsageStore.getState().lastError).toBe("oops");
  });
});
