import { describe, it, expect, beforeEach } from "vitest";
import { useV1Store, isModeDefault, formatRangeLabel, __resetV1StoreForTests } from "@/views/v1/data/v1-store";

beforeEach(() => __resetV1StoreForTests());

describe("v1 store — R2 range", () => {
  it("default range is preset=30d with from/to set", () => {
    const r = useV1Store.getState().range;
    expect(r.preset).toBe("30d");
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("setRange persists preset+from+to to ccusage.v1.range.*", () => {
    useV1Store.getState().setRange({ preset: "custom", from: "2026-05-01", to: "2026-05-15" });
    expect(window.localStorage.getItem("ccusage.v1.range.preset")).toBe("custom");
    expect(window.localStorage.getItem("ccusage.v1.range.from")).toBe("2026-05-01");
    expect(window.localStorage.getItem("ccusage.v1.range.to")).toBe("2026-05-15");
  });

  it("resetRange clears compareOn", () => {
    const s = useV1Store.getState();
    s.toggleCompare();
    expect(useV1Store.getState().compareOn).toBe(true);
    s.resetRange();
    expect(useV1Store.getState().compareOn).toBe(false);
  });
});

describe("v1 store — R2 mode (Settings)", () => {
  it("mode prefs persist under the CROSS-MODE ccusage.* keys, not v1.*", () => {
    useV1Store.getState().setMode({ costMode: "auto" });
    useV1Store.getState().setMode({ offline: true });
    useV1Store.getState().setMode({ nativeParser: true });
    useV1Store.getState().setMode({ timezone: "Asia/Shanghai" });
    expect(window.localStorage.getItem("ccusage.mode")).toBe("auto");
    expect(window.localStorage.getItem("ccusage.offline")).toBe("true");
    expect(window.localStorage.getItem("ccusage.native")).toBe("true");
    expect(window.localStorage.getItem("ccusage.tz")).toBe("Asia/Shanghai");
    // No v1-prefixed variants for these keys (per designer ack — cross-mode prefs).
    expect(window.localStorage.getItem("ccusage.v1.mode")).toBeNull();
  });

  it("isModeDefault reflects all-defaults state", () => {
    expect(isModeDefault(useV1Store.getState().mode)).toBe(true);
    useV1Store.getState().setMode({ offline: true });
    expect(isModeDefault(useV1Store.getState().mode)).toBe(false);
    useV1Store.getState().resetMode();
    expect(isModeDefault(useV1Store.getState().mode)).toBe(true);
  });
});

describe("formatRangeLabel", () => {
  it("uses short preset labels", () => {
    expect(formatRangeLabel({ preset: "today", from: "2026-05-25", to: "2026-05-25" })).toBe("Today");
    expect(formatRangeLabel({ preset: "7d", from: "x", to: "y" })).toBe("7d");
    expect(formatRangeLabel({ preset: "30d", from: "x", to: "y" })).toBe("30d");
    expect(formatRangeLabel({ preset: "this-mo", from: "x", to: "y" })).toBe("This month");
  });

  it("renders 'from → to' for custom range", () => {
    expect(formatRangeLabel({ preset: "custom", from: "2026-05-01", to: "2026-05-15" })).toBe("2026-05-01 → 2026-05-15");
  });
});
