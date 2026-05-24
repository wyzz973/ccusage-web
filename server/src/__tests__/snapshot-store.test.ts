import { describe, it, expect, vi } from "vitest";
import { createSnapshotStore } from "../snapshot-store";
import type { Snapshot } from "../types";

function emptySnapshot(generatedAt: string): Snapshot {
  return {
    generatedAt,
    ccusageVersion: "0.0.0",
    daily:   { records: [] },
    weekly:  { records: [] },
    monthly: { records: [] },
    session: { records: [] },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 0, cost: 0 },
      week:    { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 },
      allTime: { tokens: 0, cost: 0 },
      activeBlock: null,
      activeSessionCount: 0,
    },
  };
}

describe("snapshot-store", () => {
  it("starts empty", () => {
    const store = createSnapshotStore();
    expect(store.get()).toBeNull();
    expect(store.getHealth().lastPollAt).toBeNull();
  });

  it("set() updates value and notifies subscribers", () => {
    const store = createSnapshotStore();
    const cb = vi.fn();
    store.subscribe(cb);
    const snap = emptySnapshot("2026-05-24T10:00:00Z");
    store.set(snap);
    expect(store.get()).toEqual(snap);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(snap);
  });

  it("set() with identical generatedAt does not notify", () => {
    const store = createSnapshotStore();
    const cb = vi.fn();
    store.subscribe(cb);
    const snap = emptySnapshot("2026-05-24T10:00:00Z");
    store.set(snap);
    store.set(snap);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("subscribe returns unsubscribe", () => {
    const store = createSnapshotStore();
    const cb = vi.fn();
    const off = store.subscribe(cb);
    off();
    store.set(emptySnapshot("2026-05-24T10:00:00Z"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("recordError stores message and getHealth reflects it", () => {
    const store = createSnapshotStore();
    store.recordError("boom");
    expect(store.getHealth()).toEqual({ status: "degraded", lastPollAt: null, lastError: "boom" });
  });

  it("set() clears lastError and sets lastPollAt", () => {
    const store = createSnapshotStore();
    store.recordError("boom");
    const snap = emptySnapshot("2026-05-24T10:00:00Z");
    store.set(snap);
    expect(store.getHealth()).toEqual({ status: "ok", lastPollAt: "2026-05-24T10:00:00Z", lastError: null });
  });
});
