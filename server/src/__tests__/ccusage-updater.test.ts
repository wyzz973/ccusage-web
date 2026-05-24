import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCcusageUpdater } from "../ccusage-updater";

describe("ccusage-updater", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once at start", async () => {
    const install = vi.fn(async () => "1.2.3");
    const onVersion = vi.fn();
    const updater = createCcusageUpdater({ intervalMs: 60_000, install, onVersion });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(install).toHaveBeenCalledTimes(1);
    expect(onVersion).toHaveBeenCalledWith("1.2.3");
  });

  it("schedules subsequent runs", async () => {
    const install = vi.fn(async () => "1.2.3");
    const updater = createCcusageUpdater({ intervalMs: 1_000, install, onVersion: () => {} });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(install).toHaveBeenCalledTimes(3);
  });

  it("install failures do not stop the schedule", async () => {
    let n = 0;
    const install = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error("network");
      return "1.2.4";
    });
    const onVersion = vi.fn();
    const updater = createCcusageUpdater({ intervalMs: 1_000, install, onVersion });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onVersion).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onVersion).toHaveBeenCalledWith("1.2.4");
  });

  it("intervalMs=0 disables auto-update", async () => {
    const install = vi.fn();
    const updater = createCcusageUpdater({ intervalMs: 0, install, onVersion: () => {} });
    updater.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(install).not.toHaveBeenCalled();
  });

  it("stop() halts further runs", async () => {
    const install = vi.fn(async () => "x");
    const updater = createCcusageUpdater({ intervalMs: 1_000, install, onVersion: () => {} });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    updater.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(install).toHaveBeenCalledTimes(1);
  });
});
