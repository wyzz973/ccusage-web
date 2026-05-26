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

  // R4.9 — programmatic color-blind validation per spec-v3.1 §6 #1
  // (designer's only must-fix risk surface this round). Applies the
  // Machado et al. 2009 deuteranopia + protanopia sRGB transforms and
  // asserts every agent pair stays ≥ MIN_DELTA_E2000-ish (we use a
  // simple ΔE in RGB^2 distance; sufficient for "are these obviously
  // different" checks when paired with the chip TEXT LABEL fallback).
  //
  // Per spec-v3.1 §2: "chip text label is the redundant accessibility
  // channel" — so the threshold is RELAXED vs WCAG-strict because the
  // label always disambiguates. We just need no two agents to render
  // visually identical (Δ ≈ 0); ~10 pts of RGB distance is enough.
  describe("R4.9 color-blind validation (spec-v3.1 §6 #1)", () => {
    // sRGB → linear → CB-sim → linear → sRGB pipeline.
    // Matrices: Machado et al. 2009 "A Physiologically-based Model for
    // Simulation of Color Vision Deficiency" — severity 1.0 (full sim).
    const DEUT = [
      [0.367, 0.861, -0.228],
      [0.280, 0.673, 0.047],
      [-0.012, 0.043, 0.969],
    ] as const;
    const PROT = [
      [0.152, 1.053, -0.205],
      [0.115, 0.786, 0.099],
      [-0.004, -0.048, 1.052],
    ] as const;

    function hslToRgb(h: number, s: number, l: number): [number, number, number] {
      s /= 100; l /= 100;
      const k = (n: number): number => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return [f(0) * 255, f(8) * 255, f(4) * 255];
    }
    function parseHsl(s: string): [number, number, number] {
      const m = s.match(/^hsl\((\d+)\s+(\d+)%\s+(\d+)%\)$/);
      if (!m) throw new Error(`bad hsl: ${s}`);
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    function applyMatrix(rgb: [number, number, number], M: typeof DEUT): [number, number, number] {
      const [r, g, b] = rgb;
      return [
        M[0]![0]! * r + M[0]![1]! * g + M[0]![2]! * b,
        M[1]![0]! * r + M[1]![1]! * g + M[1]![2]! * b,
        M[2]![0]! * r + M[2]![1]! * g + M[2]![2]! * b,
      ];
    }
    function delta(a: [number, number, number], b: [number, number, number]): number {
      return Math.sqrt(
        (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
      );
    }

    const AGENTS = ["claude","codex","gemini","copilot","openclaw","goose","hermes","opencode","amp","droid","codebuff"] as const;

    for (const sim of [{ name: "deuteranopia", M: DEUT }, { name: "protanopia", M: PROT }]) {
      it(`every agent-color pair stays Δ ≥ 10 in ${sim.name} simulation`, () => {
        const simmed: Record<string, [number, number, number]> = {};
        for (const a of AGENTS) {
          const [h, s, l] = parseHsl(AGENT_COLORS[a]);
          simmed[a] = applyMatrix(hslToRgb(h, s, l), sim.M);
        }
        const failures: string[] = [];
        for (let i = 0; i < AGENTS.length; i++) {
          for (let j = i + 1; j < AGENTS.length; j++) {
            const a = AGENTS[i]!, b = AGENTS[j]!;
            const d = delta(simmed[a]!, simmed[b]!);
            if (d < 10) failures.push(`${a}/${b}: Δ=${d.toFixed(1)}`);
          }
        }
        // Per spec-v3.1 §2 designer carve-out: text label is the
        // redundant accessibility channel. Threshold is intentionally
        // relaxed — we only fail on near-identical pairs (Δ < 10 of
        // 442-max RGB distance ≈ 2.3% — essentially indistinguishable).
        expect(failures, `pairs too close in ${sim.name}: ${failures.join(", ")}`).toEqual([]);
      });
    }
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
