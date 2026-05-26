import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionTableV1 } from "@/views/v1/components/SessionTableV1";
import { __resetV1StoreForTests, useV1Store } from "@/views/v1/data/v1-store";
import type { UsageRecord } from "@/types";

function rec(period: string, cost: number, agent = "claude"): UsageRecord {
  return {
    period, agent, totalTokens: 1000, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: ["sonnet"], modelBreakdowns: [],
    metadata: { lastActivity: "2026-05-25T10:00:00Z" },
  };
}

beforeEach(() => __resetV1StoreForTests());

describe("SessionTableV1 — virtualization (Round-1 bug fix #2)", () => {
  it("renders only the visible window of rows from a 500-row dataset", () => {
    const rows = Array.from({ length: 500 }, (_, i) => rec(`9f-${i.toString(16)}`, i + 1));
    render(<SessionTableV1 records={rows} rowHeight={36} containerHeight={360} />);
    // 360 / 36 = 10 visible + 2*overscan(5) = 20 worst-case. Must be ≪ 500.
    const visibleRows = screen.getAllByTestId("session-row");
    expect(visibleRows.length).toBeLessThanOrEqual(25);
    expect(visibleRows.length).toBeGreaterThan(5);
  });

  it("shows the empty-state row when no records match", () => {
    render(<SessionTableV1 records={[]} />);
    expect(screen.getByText(/No sessions match/i)).toBeInTheDocument();
  });

  it("clicking a row dispatches a session filter", () => {
    render(<SessionTableV1 records={[rec("9f-aaa", 5)]} />);
    fireEvent.click(screen.getByTestId("session-row"));
    expect(useV1Store.getState().filters).toEqual([{ kind: "session", value: "9f-aaa" }]);
  });

  it("search box narrows the dataset", () => {
    render(<SessionTableV1 records={[rec("alpha", 1), rec("beta", 2)]} />);
    const search = screen.getByLabelText("Search sessions") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "alpha" } });
    const rows = screen.getAllByTestId("session-row");
    expect(rows.length).toBe(1);
  });
});

// R3.3 — `--order asc|desc` toggle persistence + chevron + a11y.
describe("SessionTableV1 — R3.3 sort toggle", () => {
  beforeEach(() => {
    try { window.localStorage.clear(); } catch { /* */ }
  });

  it("active column header carries aria-sort + chevron icon", () => {
    render(<SessionTableV1 records={[rec("a", 1), rec("b", 2)]} />);
    // Default sortKey = totalCost, desc = true.
    expect(screen.getByTestId("session-sort-totalCost")).toHaveAttribute("aria-sort", "descending");
  });

  it("clicking active header toggles desc→asc and updates aria-sort", () => {
    render(<SessionTableV1 records={[rec("a", 1), rec("b", 2)]} />);
    fireEvent.click(screen.getByTestId("session-sort-totalCost"));
    // Re-query after re-render — HeaderCell is a closure-defined component so
    // the DOM node is remounted and the prior reference is stale.
    expect(screen.getByTestId("session-sort-totalCost")).toHaveAttribute("aria-sort", "ascending");
  });

  it("clicking a different header sets it as active with desc default (per AC2)", () => {
    render(<SessionTableV1 records={[rec("a", 1)]} />);
    fireEvent.click(screen.getByTestId("session-sort-period"));
    expect(screen.getByTestId("session-sort-period")).toHaveAttribute("aria-sort", "descending");
  });

  it("persists sort key + direction to localStorage", () => {
    render(<SessionTableV1 records={[rec("a", 1)]} />);
    fireEvent.click(screen.getByTestId("session-sort-totalCost")); // desc → asc
    expect(window.localStorage.getItem("ccusage.order.sessions.key")).toBe("totalCost");
    expect(window.localStorage.getItem("ccusage.order.sessions.desc")).toBe("false");
  });

  it("restores persisted sort key + direction on mount", () => {
    window.localStorage.setItem("ccusage.order.sessions.key", "period");
    window.localStorage.setItem("ccusage.order.sessions.desc", "false");
    render(<SessionTableV1 records={[rec("a", 1)]} />);
    expect(screen.getByTestId("session-sort-period")).toHaveAttribute("aria-sort", "ascending");
  });

  it("ArrowUp on active descending header flips to ascending (AC3 keyboard)", () => {
    render(<SessionTableV1 records={[rec("a", 1)]} />);
    fireEvent.keyDown(screen.getByTestId("session-sort-totalCost"), { key: "ArrowUp" });
    expect(screen.getByTestId("session-sort-totalCost")).toHaveAttribute("aria-sort", "ascending");
  });
});
