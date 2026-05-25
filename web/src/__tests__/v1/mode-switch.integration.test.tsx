// Integration test for the Round-1 mode-switch + isolation contract.
//
// Asserts:
//   1. App({ modeOverride: "classic" }) renders the original Dashboard.
//   2. App({ modeOverride: "v1" })       renders DashboardV1 with its new bands.
//   3. Mode switch leaves no v1-specific DOM in classic and vice versa.
//   4. Classic Dashboard still works when the snapshot carries the new
//      additive `derived.todayDrivers` and `derived.deltas` fields
//      (team-lead addendum #2: zero regression on classic).

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import App from "@/App";
import { useUsageStore } from "@/store/usage-store";
import { __resetV1StoreForTests } from "@/views/v1/data/v1-store";
import type { Snapshot } from "@/types";

function augmentedSnapshot(): Snapshot {
  return {
    generatedAt: "2026-05-25T14:00:00Z",
    ccusageVersion: "1.2.3",
    daily: {
      records: [
        {
          period: "2026-05-25", agent: "claude", totalTokens: 1000, totalCost: 7,
          inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
          modelsUsed: ["opus"],
          modelBreakdowns: [{ modelName: "opus", cost: 7, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }],
          metadata: {},
        },
        {
          period: "2026-05-25", agent: "codex", totalTokens: 500, totalCost: 3,
          inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
          modelsUsed: ["gpt-5.4"],
          modelBreakdowns: [{ modelName: "gpt-5.4", cost: 3, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 }],
          metadata: {},
        },
      ],
    },
    weekly:  { records: [] },
    monthly: { records: [] },
    session: { records: [] },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 1500, cost: 10 },
      week:    { tokens: 1500, cost: 10 },
      month:   { tokens: 1500, cost: 10 },
      allTime: { tokens: 1500, cost: 10 },
      activeBlock: null,
      activeSessionCount: 0,
      // Additive Round-1 fields — must not break classic.
      todayDrivers: {
        totalCostUSD: 10,
        agent: { name: "claude", pct: 70, costUSD: 7 },
        model: { name: "opus",  pct: 70, costUSD: 7 },
      },
      deltas: {
        today: { pct: 0.23, vsLabel: "vs yesterday", current: 10, previous: 8 },
        week:  { pct: 0.10, vsLabel: "vs last week", current: 10, previous: 9 },
        month: { pct: 0.05, vsLabel: "vs last month", current: 10, previous: 9.5 },
      },
    },
  };
}

beforeEach(() => {
  cleanup();
  __resetV1StoreForTests();
  // Reset usage store to known state then populate with the augmented snapshot.
  useUsageStore.setState({
    snapshot: null,
    connectionStatus: "connected",
    lastError: null,
    lastSuccessAt: null,
  });
  useUsageStore.getState().setSnapshot(augmentedSnapshot());
});

describe("App mode switch", () => {
  it("renders the classic Dashboard when mode='classic'", () => {
    render(<App modeOverride="classic" />);
    // Classic header has plain title + Refresh button. No view toggle yet.
    expect(screen.getByText("ccusage")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-v1")).toBeNull();
    expect(screen.queryByTestId("view-toggle")).toBeNull();
    expect(screen.queryByTestId("driver-strip")).toBeNull();
    expect(screen.queryByTestId("driver-strip-empty")).toBeNull();
  });

  it("renders DashboardV1 when mode='v1' with the new v1 bands present", () => {
    render(<App modeOverride="v1" />);
    expect(screen.getByTestId("dashboard-v1")).toBeInTheDocument();
    expect(screen.getByTestId("view-toggle")).toBeInTheDocument();
    expect(screen.getAllByTestId("metric-card-v1").length).toBeGreaterThan(0);
    // Driver strip should pick up the augmented snapshot's drivers.
    expect(screen.getByTestId("driver-strip")).toBeInTheDocument();
    expect(screen.getByTestId("driver-agent")).toBeInTheDocument();
  });

  it("v1 renders the trend chart, donut, block strip, and session table", () => {
    render(<App modeOverride="v1" />);
    expect(screen.getByTestId("trend-chart-v1")).toBeInTheDocument();
    expect(screen.getByTestId("model-donut-v1")).toBeInTheDocument();
    expect(screen.getByTestId("block-history-strip")).toBeInTheDocument();
    expect(screen.getByTestId("session-table-v1")).toBeInTheDocument();
  });
});

describe("Classic dashboard still works against augmented snapshot (addendum #2)", () => {
  it("renders the same numbers and does not throw when extra derived fields are present", () => {
    render(<App modeOverride="classic" />);
    // Classic MetricCards exist (testid is shared from the original component).
    const cards = screen.getAllByTestId("metric-card");
    expect(cards.length).toBeGreaterThanOrEqual(4);
    // The Today card shows the token count from derived.today.tokens (1500).
    expect(cards[0]?.textContent).toMatch(/1,500/);
  });
});
