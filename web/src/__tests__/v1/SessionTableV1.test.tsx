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
