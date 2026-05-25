import { describe, it, expect, beforeEach } from "vitest";
import { useV1Store, __resetV1StoreForTests } from "@/views/v1/data/v1-store";

beforeEach(() => __resetV1StoreForTests());

describe("v1 store — defaults & persistence", () => {
  it("defaults: view=aggregate, trendWindow=30, trendMode=stacked, compareOn=false", () => {
    const s = useV1Store.getState();
    expect(s.view).toBe("aggregate");
    expect(s.trendWindow).toBe("30");
    expect(s.trendMode).toBe("stacked");
    expect(s.compareOn).toBe(false);
    expect(s.filters).toEqual([]);
  });

  it("setView writes the ccusage.v1.view localStorage key", () => {
    useV1Store.getState().setView("by-agent");
    expect(useV1Store.getState().view).toBe("by-agent");
    expect(window.localStorage.getItem("ccusage.v1.view")).toBe("by-agent");
  });

  it("setTrendWindow / setTrendMode / toggleCompare persist with v1 prefix", () => {
    useV1Store.getState().setTrendWindow("7");
    useV1Store.getState().setTrendMode("lines");
    useV1Store.getState().toggleCompare();
    expect(window.localStorage.getItem("ccusage.v1.trend.window")).toBe("7");
    expect(window.localStorage.getItem("ccusage.v1.trend.mode")).toBe("lines");
    expect(window.localStorage.getItem("ccusage.v1.compare")).toBe("true");
  });
});

describe("v1 store — filter chips", () => {
  it("addFilter ignores duplicates", () => {
    const { addFilter } = useV1Store.getState();
    addFilter({ kind: "agent", value: "claude" });
    addFilter({ kind: "agent", value: "claude" });
    expect(useV1Store.getState().filters).toHaveLength(1);
  });

  it("removeFilter removes by kind+value identity", () => {
    const { addFilter, removeFilter } = useV1Store.getState();
    addFilter({ kind: "agent", value: "claude" });
    addFilter({ kind: "agent", value: "codex" });
    removeFilter({ kind: "agent", value: "claude" });
    expect(useV1Store.getState().filters).toEqual([{ kind: "agent", value: "codex" }]);
  });

  it("clearFilters empties the list", () => {
    const { addFilter, clearFilters } = useV1Store.getState();
    addFilter({ kind: "agent", value: "claude" });
    addFilter({ kind: "project", value: "alpha" });
    clearFilters();
    expect(useV1Store.getState().filters).toEqual([]);
  });
});
