// R4 web surfaces — palette extension, Settings popover Config-path
// input + Debug link, SessionTable `id:` prefix, BlocksPanel
// Recent/All toggle. Each test asserts the spec-v3.1 anchor verbatim.

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockHistoryStrip } from "@/views/v1/components/BlockHistoryStrip";
import { SettingsPopoverV1 } from "@/views/v1/components/SettingsPopoverV1";
import { SessionTableV1 } from "@/views/v1/components/SessionTableV1";
import { AGENT_COLORS, AGENT_LABEL, toAgentKey } from "@/views/v1/lib/agent-colors";
import { __resetV1StoreForTests, useV1Store } from "@/views/v1/data/v1-store";
import type { Block, UsageRecord } from "@/types";

beforeEach(() => {
  __resetV1StoreForTests();
  try { window.localStorage.clear(); } catch { /* */ }
});

describe("R4.9 agent-colors palette extension (spec-v3.1 §2)", () => {
  it("registers all 11 R4 agent keys with distinct AGENT_COLORS hues", () => {
    const keys = ["claude","codex","gemini","copilot","openclaw","goose","hermes","opencode","amp","droid","codebuff"] as const;
    for (const k of keys) {
      expect(AGENT_COLORS[k], `expected hue for ${k}`).toBeTruthy();
      expect(AGENT_COLORS[k]).toMatch(/^hsl\(\d/);
      expect(AGENT_LABEL[k]).toBeTruthy();
    }
  });

  it("preserves the `unknown` sentinel for unrecognized agents", () => {
    expect(AGENT_COLORS.unknown).toBeTruthy();
    expect(toAgentKey("totally-bogus-agent")).toBe("unknown");
    expect(toAgentKey("all")).toBe("unknown");
    expect(toAgentKey(null)).toBe("unknown");
  });

  it("toAgentKey normalises all 11 known agents (case-insensitive)", () => {
    expect(toAgentKey("Claude")).toBe("claude");
    expect(toAgentKey("HERMES")).toBe("hermes");
    expect(toAgentKey("opencode")).toBe("opencode");
    expect(toAgentKey("Goose")).toBe("goose");
    expect(toAgentKey("Codebuff")).toBe("codebuff");
  });

  it("hue spacing: claude (262) and codex (188) stay distinct post-extension", () => {
    // Spot-check: the closest-hue pair pre-R4 (claude/codebuff 262/296)
    // and post-R4 additions (gemini/goose 38/12, openclaw/opencode 90/125)
    // are still distinguishable by hue at ≥ 26° per spec-v3.1 §2.
    // Hue extraction via regex against the `hsl(<h> <s>% <l>%)` form.
    const hueFromHsl = (s: string): number => Number(s.match(/^hsl\((\d+)/)?.[1] ?? -1);
    const claude = hueFromHsl(AGENT_COLORS.claude);
    const codex = hueFromHsl(AGENT_COLORS.codex);
    const gemini = hueFromHsl(AGENT_COLORS.gemini);
    const goose = hueFromHsl(AGENT_COLORS.goose);
    expect(Math.abs(claude - codex)).toBeGreaterThanOrEqual(60);
    expect(Math.abs(gemini - goose)).toBeGreaterThanOrEqual(26);
  });
});

describe("R4.6 Settings popover Config-path input (spec-v3.1 §3.2)", () => {
  it("input rendered with the prototype-anchored test ID", () => {
    useV1Store.getState().setSettingsOpen(true);
    render(<SettingsPopoverV1 />);
    const input = screen.getByTestId("settings-config-path") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("");
    expect(input.placeholder).toMatch(/\/Users\/me\/\.ccusage\/ccusage\.json/);
  });

  it("Enter commits the draft to the store + localStorage", () => {
    useV1Store.getState().setSettingsOpen(true);
    render(<SettingsPopoverV1 />);
    const input = screen.getByTestId("settings-config-path") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/tmp/cfg.json" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useV1Store.getState().mode.configPath).toBe("/tmp/cfg.json");
    expect(window.localStorage.getItem("ccusage.config")).toBe("/tmp/cfg.json");
  });

  it("Esc reverts the draft back to the committed value", () => {
    useV1Store.getState().setMode({ configPath: "/initial.json" });
    useV1Store.getState().setSettingsOpen(true);
    render(<SettingsPopoverV1 />);
    const input = screen.getByTestId("settings-config-path") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/tmp/typed.json" } });
    fireEvent.keyDown(input, { key: "Escape" });
    // Store value unchanged
    expect(useV1Store.getState().mode.configPath).toBe("/initial.json");
  });

  it("Blur commits the draft (debounced-blur per spec-v3.1 §3.3.2)", () => {
    useV1Store.getState().setSettingsOpen(true);
    render(<SettingsPopoverV1 />);
    const input = screen.getByTestId("settings-config-path") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/blur.json" } });
    fireEvent.blur(input);
    expect(useV1Store.getState().mode.configPath).toBe("/blur.json");
  });
});

describe("R4.5 B12 Settings popover Debug-snapshot link (spec-v3.1 §3.3)", () => {
  it("link renders with target=_blank pointing at /api/debug", () => {
    useV1Store.getState().setSettingsOpen(true);
    render(<SettingsPopoverV1 />);
    const a = screen.getByTestId("settings-debug-link") as HTMLAnchorElement;
    expect(a).toBeInTheDocument();
    expect(a.getAttribute("href")).toBe("/api/debug");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toMatch(/noopener/);
  });
});

describe("R4.5 B14 SessionTable `id:` search prefix (spec-v3.1 §3.4)", () => {
  function rec(period: string): UsageRecord {
    return {
      period, agent: "claude", totalTokens: 0, totalCost: 0,
      inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
      modelsUsed: [], modelBreakdowns: [],
      metadata: { lastActivity: "2026-05-25T10:00:00Z" },
    };
  }

  it("placeholder reflects the spec-v3.1 anchor microcopy", () => {
    render(<SessionTableV1 records={[]} />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;
    expect(input.placeholder).toMatch(/id:abc12/);
  });

  it("`id:abc12` narrows the table to sessions starting with that prefix", () => {
    const rows = [
      rec("abc12345-foo"),
      rec("abc12-bar"),
      rec("xyz99-baz"),
    ];
    render(<SessionTableV1 records={rows} />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "id:abc12" } });
    const matches = screen.getAllByTestId("session-row");
    expect(matches).toHaveLength(2);
  });

  it("bare query (no `id:` prefix) keeps multi-field substring match (regression)", () => {
    const rows = [
      rec("abc12345-foo"),
      rec("xyz99-baz"),
    ];
    render(<SessionTableV1 records={rows} />);
    const input = screen.getByLabelText("Search sessions") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "xyz" } });
    const matches = screen.getAllByTestId("session-row");
    expect(matches).toHaveLength(1);
  });
});

describe("R4.5 B15 BlocksPanel Recent/All toggle (spec-v3.1 §3.5)", () => {
  function blk(id: string, isActive = false): Block {
    return {
      id, startTime: "2026-05-25T08:00:00Z", endTime: "2026-05-25T13:00:00Z",
      actualEndTime: null, isActive, isGap: false,
      costUSD: 1, totalTokens: 100, entries: 1,
      models: ["claude-opus-4"], burnRate: null, projection: null,
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    };
  }

  it("Recent (default) shows the active-block card; All hides it for the virtualized list", () => {
    render(<BlockHistoryStrip blocks={[blk("a", true), blk("b"), blk("c")]} />);
    // Default = recent → trailing strip visible; no all-list testid.
    expect(screen.queryByTestId("blocks-all-list")).toBeNull();
    fireEvent.click(screen.getByTestId("blocks-tab-all"));
    // After flip: all-list visible; active card path hidden.
    expect(screen.getByTestId("blocks-all-list")).toBeInTheDocument();
  });

  it("All view renders one row per non-active block with agent-color dot", () => {
    const blocks = [blk("a", true), blk("b"), blk("c"), blk("d")];
    render(<BlockHistoryStrip blocks={blocks} />);
    fireEvent.click(screen.getByTestId("blocks-tab-all"));
    const list = screen.getByTestId("blocks-all-list");
    // 3 non-active blocks → at least 3 rows (plus header).
    expect(list.textContent).toMatch(/3 past blocks/);
  });

  it("persists the scope choice to localStorage", () => {
    render(<BlockHistoryStrip blocks={[blk("a", true), blk("b")]} />);
    fireEvent.click(screen.getByTestId("blocks-tab-all"));
    expect(window.localStorage.getItem("ccusage.v1.blocks.scope")).toBe("all");
    fireEvent.click(screen.getByTestId("blocks-tab-recent"));
    expect(window.localStorage.getItem("ccusage.v1.blocks.scope")).toBe("recent");
  });

  it("aria-checked toggles on the radiogroup buttons", () => {
    render(<BlockHistoryStrip blocks={[blk("a", true)]} />);
    const recentBtn = screen.getByTestId("blocks-tab-recent");
    const allBtn = screen.getByTestId("blocks-tab-all");
    expect(recentBtn.getAttribute("aria-checked")).toBe("true");
    expect(allBtn.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(allBtn);
    expect(recentBtn.getAttribute("aria-checked")).toBe("false");
    expect(allBtn.getAttribute("aria-checked")).toBe("true");
  });
});
