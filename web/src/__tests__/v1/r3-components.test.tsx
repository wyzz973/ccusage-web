// R3 web-side component tests:
//   • AgentChipRow visibility/active-state (§3.1)
//   • BudgetBanner fire conditions + dismiss-for-today (§3.3.1)
//   • BlockHistoryStrip X1 token-limit chip + collision guard (§3.3.3)
//   • ModeBadgesV1 reads from `derived.mode.parser` (M6.d)
//   • Per-agent state machine surfaces partial/timeout footer (§3.2)

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AgentChipRow } from "@/views/v1/components/AgentChipRow";
import { BudgetBanner } from "@/views/v1/components/BudgetBanner";
import { BlockHistoryStrip } from "@/views/v1/components/BlockHistoryStrip";
import { ModeBadgesV1 } from "@/views/v1/components/ModeBadgesV1";
import { TrendChartV1 } from "@/views/v1/components/TrendChartV1";
import { __resetV1StoreForTests, useV1Store } from "@/views/v1/data/v1-store";
import type { Block } from "@/types";

beforeEach(() => __resetV1StoreForTests());

describe("AgentChipRow (R3.5)", () => {
  it("renders nothing when detectedAgents is empty (§3.1.4)", () => {
    const { container } = render(<AgentChipRow detectedAgents={[]} />);
    expect(container.querySelector("[data-testid=agent-chip-row]")).toBeNull();
  });

  it("renders nothing when detectedAgents is undefined (pre-snapshot)", () => {
    const { container } = render(<AgentChipRow detectedAgents={undefined} />);
    expect(container.querySelector("[data-testid=agent-chip-row]")).toBeNull();
  });

  it("renders chips for each detected agent and pulls AGENT_LABEL", () => {
    render(<AgentChipRow detectedAgents={["claude", "codex"]} />);
    expect(screen.getByTestId("agent-chip-row")).toBeInTheDocument();
    expect(screen.getByTestId("agent-chip-claude")).toHaveTextContent("Claude");
    expect(screen.getByTestId("agent-chip-codex")).toHaveTextContent("Codex");
  });

  it("clicking an inactive chip adds the agent filter (toAgentKey-normalized)", () => {
    render(<AgentChipRow detectedAgents={["claude"]} />);
    fireEvent.click(screen.getByTestId("agent-chip-claude"));
    expect(useV1Store.getState().filters).toEqual([{ kind: "agent", value: "claude" }]);
  });

  it("clicking an active chip removes the filter", () => {
    useV1Store.getState().addFilter({ kind: "agent", value: "claude" });
    render(<AgentChipRow detectedAgents={["claude"]} />);
    fireEvent.click(screen.getByTestId("agent-chip-claude"));
    expect(useV1Store.getState().filters).toEqual([]);
  });
});

describe("BudgetBanner (R3.7)", () => {
  it("does not fire when no cap is set", () => {
    const { container } = render(<BudgetBanner monthEndProjectionUSD={1000} todayKey="2026-05-25" />);
    expect(container.querySelector("[data-testid=budget-banner]")).toBeNull();
  });

  it("does not fire when projection ≤ cap", () => {
    useV1Store.getState().setMode({ monthlyCapUSD: 1000 });
    const { container } = render(<BudgetBanner monthEndProjectionUSD={500} todayKey="2026-05-25" />);
    expect(container.querySelector("[data-testid=budget-banner]")).toBeNull();
  });

  it("fires with overshoot + overPct when projection > cap", () => {
    useV1Store.getState().setMode({ monthlyCapUSD: 100 });
    render(<BudgetBanner monthEndProjectionUSD={150} todayKey="2026-05-25" />);
    const banner = screen.getByTestId("budget-banner");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveAttribute("aria-live", "assertive");
    expect(banner.textContent).toMatch(/\$50/);
    expect(banner.textContent).toMatch(/50% over/);
  });

  it("dismiss button suppresses the banner for the current day only", () => {
    useV1Store.getState().setMode({ monthlyCapUSD: 100 });
    const { rerender } = render(<BudgetBanner monthEndProjectionUSD={150} todayKey="2026-05-25" />);
    fireEvent.click(screen.getByTestId("budget-banner-dismiss"));
    rerender(<BudgetBanner monthEndProjectionUSD={150} todayKey="2026-05-25" />);
    expect(screen.queryByTestId("budget-banner")).toBeNull();
    // Next day → banner re-arms.
    rerender(<BudgetBanner monthEndProjectionUSD={150} todayKey="2026-05-26" />);
    expect(screen.getByTestId("budget-banner")).toBeInTheDocument();
  });

  it("renders D9 addendum when limitResetActive is true", () => {
    useV1Store.getState().setMode({ monthlyCapUSD: 100 });
    render(
      <BudgetBanner
        monthEndProjectionUSD={150}
        todayKey="2026-05-25"
        limitResetActive
        limitResetTimeLabel="22:30"
      />,
    );
    expect(screen.getByTestId("budget-banner").textContent).toMatch(/Quota resets at 22:30/);
  });
});

describe("BlockHistoryStrip · X1 chip + collision guard (R3.7)", () => {
  function makeBlock(over: boolean): Block {
    return {
      id: "b1",
      startTime: "2026-05-25T08:00:00Z",
      endTime:   "2026-05-25T13:00:00Z",
      actualEndTime: null,
      isActive: true,
      isGap: false,
      costUSD: 10,
      totalTokens: 1_000_000,
      entries: 5,
      models: [],
      burnRate: null,
      projection: {
        remainingMinutes: 60,
        totalCost: 20,
        totalTokens: over ? 50_000_000 : 5_000_000,
      },
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    };
  }

  it("does not render the chip when no perBlockTokenLimit is set", () => {
    const { container } = render(<BlockHistoryStrip blocks={[makeBlock(true)]} />);
    expect(container.querySelector("[data-testid=block-token-limit-chip]")).toBeNull();
  });

  it("does not render the chip when projection ≤ limit", () => {
    useV1Store.getState().setMode({ perBlockTokenLimit: 100_000_000 });
    const { container } = render(<BlockHistoryStrip blocks={[makeBlock(false)]} />);
    expect(container.querySelector("[data-testid=block-token-limit-chip]")).toBeNull();
  });

  it("renders the amber chip with bg-amber-400/10 when no X1 collision", () => {
    useV1Store.getState().setMode({ perBlockTokenLimit: 10_000_000 });
    render(<BlockHistoryStrip blocks={[makeBlock(true)]} x1BannerActive={false} />);
    const chip = screen.getByTestId("block-token-limit-chip");
    expect(chip.className).toMatch(/bg-amber-400\/10/);
  });

  it("strips the bg fill when X1 banner is active (single-banner invariant)", () => {
    useV1Store.getState().setMode({ perBlockTokenLimit: 10_000_000 });
    render(<BlockHistoryStrip blocks={[makeBlock(true)]} x1BannerActive />);
    const chip = screen.getByTestId("block-token-limit-chip");
    expect(chip.className).not.toMatch(/bg-amber-400\/10/);
  });
});

describe("ModeBadgesV1 (M6.d truth source)", () => {
  it("shows native badge when derived.mode.parser === 'native' regardless of user pref", () => {
    render(<ModeBadgesV1 parserMode={{ parser: "native" }} />);
    expect(screen.getByTestId("mode-badge-native")).toBeInTheDocument();
  });

  it("shows fallback badge when parser=fallback AND user pref is nativeParser=true (drift)", () => {
    useV1Store.getState().setMode({ nativeParser: true });
    render(<ModeBadgesV1 parserMode={{ parser: "fallback" }} />);
    expect(screen.getByTestId("mode-badge-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("mode-badge-native")).toBeNull();
  });

  it("hides both badges when parser=fallback and user didn't ask for native", () => {
    const { container } = render(<ModeBadgesV1 parserMode={{ parser: "fallback" }} />);
    expect(container.querySelector("[data-testid=mode-badge-native]")).toBeNull();
    expect(container.querySelector("[data-testid=mode-badge-fallback]")).toBeNull();
  });

  it("falls back to user pref when parserMode is undefined (legacy server)", () => {
    useV1Store.getState().setMode({ nativeParser: true });
    render(<ModeBadgesV1 />);
    expect(screen.getByTestId("mode-badge-native")).toBeInTheDocument();
  });
});

describe("TrendChartV1 · per-agent state machine (R3.6 §3.2)", () => {
  // Synthetic fetcher returning a deterministic shape per test.
  function fakeFetcher(status: "ok" | "partial" | "timeout") {
    return vi.fn().mockResolvedValue({
      date: "2026-05-25", tz: "UTC",
      status,
      succeeded: status === "timeout" ? [] : [{ agent: "claude", data: { totalCostUSD: 1, totalTokens: 100, sessionCount: 1 } }],
      failed: [],
      timedOut: status === "ok" ? [] : [{ agent: "codex" }],
      elapsedMs: 100, budgetMs: 800,
    });
  }

  it("does not fire per-agent fetcher in aggregate view", async () => {
    const fetcher = fakeFetcher("ok");
    render(<TrendChartV1 records={[]} perAgentFetcher={fetcher} todayKey="2026-05-25" tz="UTC" />);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("renders the partial-success footer when status='partial' (the §3.2.2 canary)", async () => {
    useV1Store.getState().setView("by-agent");
    const fetcher = fakeFetcher("partial");
    await act(async () => {
      render(<TrendChartV1 records={[]} perAgentFetcher={fetcher} todayKey="2026-05-25" tz="UTC" />);
    });
    expect(fetcher).toHaveBeenCalledWith("2026-05-25", "UTC");
    const footer = await screen.findByTestId("per-agent-status");
    expect(footer.textContent).toMatch(/Showing 1 of 2 agents/);
    expect(footer.textContent).toMatch(/1 timed out at 800ms/);
  });

  it("renders the all-timeout footer when status='timeout'", async () => {
    useV1Store.getState().setView("by-agent");
    const fetcher = fakeFetcher("timeout");
    await act(async () => {
      render(<TrendChartV1 records={[]} perAgentFetcher={fetcher} todayKey="2026-05-25" tz="UTC" />);
    });
    const footer = await screen.findByTestId("per-agent-status");
    expect(footer.textContent).toMatch(/Per-agent breakdown unavailable/);
    expect(footer.textContent).toMatch(/Showing aggregate/);
  });

  it("does NOT render the footer when status='ok' (silent-success path)", async () => {
    useV1Store.getState().setView("by-agent");
    const fetcher = fakeFetcher("ok");
    await act(async () => {
      render(<TrendChartV1 records={[]} perAgentFetcher={fetcher} todayKey="2026-05-25" tz="UTC" />);
    });
    // wait for the promise to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("per-agent-status")).toBeNull();
  });
});
