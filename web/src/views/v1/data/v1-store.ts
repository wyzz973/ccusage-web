// V1-mode UI store. Keeps mode-switch state cleanly partitioned from the
// classic Dashboard's usage-store via the `ccusage.v1.*` localStorage
// keyspace. R2 extensions: range picker (D2), settings/mode (D10–12),
// popover open-flags, block-detail modal (H1).

import { create } from "zustand";
import type { FilterChip } from "./selectors";

// ── localStorage helpers ──────────────────────────────────────────────

function readLS<T>(key: string, fallback: T, parse: (s: string) => T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return parse(raw);
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* swallow */ }
}

export type ViewMode = "aggregate" | "by-agent";
export type TrendMode = "aggregate" | "stacked" | "100" | "lines";
export type TrendWindow = "today" | "7" | "30" | "60" | "90";

// R2 D2 — Range
export type RangePreset = "today" | "7d" | "30d" | "90d" | "this-mo" | "last-mo" | "custom";
export interface Range {
  preset: RangePreset;
  /** Inclusive start, YYYY-MM-DD. */
  from: string;
  /** Inclusive end, YYYY-MM-DD. */
  to: string;
}

// R2 D10–12 — Mode (cross-mode data prefs; namespace `ccusage.*`, not v1.*)
export type CostMode = "calculate" | "auto" | "display";
export interface ModeState {
  costMode: CostMode;
  offline: boolean;
  nativeParser: boolean;
  timezone: string;
  /**
   * R3.7 — monthly USD cap. `null` = no cap; banner never fires. Stored
   * client-side because it's a user policy preference, not server data.
   */
  monthlyCapUSD: number | null;
  /**
   * R3.7 — per-block token cap (X1 chip in BlockHistoryStrip).
   * `null` = no cap; chip never fires.
   */
  perBlockTokenLimit: number | null;
  /**
   * R4.6 (spec-v3.1 §3.2) — `--config <path>` UI for the R3.1
   * server-side flag passthrough. Empty string = use defaults; any
   * non-empty path POSTs through to `/api/snapshot?config=<path>`. Cross-
   * mode pref, so the storage key is `ccusage.config` (no `v1.` prefix).
   */
  configPath: string;
}

// R3.6 — per-agent fan-out result (spec-v3 §3.2 state machine).
export type PerAgentStatus = "idle" | "loading" | "ok" | "partial" | "timeout";

export interface PerAgentAgentData {
  totalCostUSD: number;
  totalTokens: number;
  sessionCount: number;
}
export interface PerAgentResult {
  status: PerAgentStatus;
  succeeded: Array<{ agent: string; data: PerAgentAgentData }>;
  failed:    Array<{ agent: string; err: string }>;
  timedOut:  Array<{ agent: string }>;
  elapsedMs: number;
  budgetMs: number;
}

// R3.8 — donut window scope: "window" = the selected B0 range; "all" = lifetime.
export type DonutScope = "window" | "all";

// R4.5 B15 — BlocksPanel scope: "recent" = trailing-N; "all" = full virtualized list.
export type BlocksScope = "recent" | "all";

interface V1State {
  view: ViewMode;
  filters: FilterChip[];
  trendWindow: TrendWindow;
  trendMode: TrendMode;
  compareOn: boolean;

  // R2 D2
  range: Range;
  rangeOpen: boolean;

  // R2 D10–12
  mode: ModeState;
  settingsOpen: boolean;

  // R2 D1 / H1
  projectsDialogOpen: boolean;
  blockDetailId: string | null;

  // R2 D9 (UI-side dismiss)
  limitResetDismissed: boolean;

  // R3.7 — UI-side dismiss for the budget banner (today-only; resets daily).
  x1BannerDismissedFor: string | null;

  // R3.8 — donut window scope toggle.
  donutScope: DonutScope;

  // R4.5 B15 — BlocksPanel scope toggle.
  blocksScope: BlocksScope;

  // R3.6 — per-agent fan-out state. Populated by `fetchPerAgent` calls.
  perAgent: PerAgentResult;

  setView(v: ViewMode): void;
  addFilter(c: FilterChip): void;
  removeFilter(c: FilterChip): void;
  clearFilters(): void;
  setTrendWindow(w: TrendWindow): void;
  setTrendMode(m: TrendMode): void;
  toggleCompare(): void;

  setRange(r: Range): void;
  setRangeOpen(b: boolean): void;
  resetRange(): void;

  setMode(patch: Partial<ModeState>): void;
  resetMode(): void;
  setSettingsOpen(b: boolean): void;

  setProjectsDialogOpen(b: boolean): void;
  setBlockDetailId(id: string | null): void;

  dismissLimitReset(): void;
  resetLimitResetDismiss(): void;

  // R3.7 — banner dismiss is scoped to a single calendar day so the user
  // doesn't suppress next month's warning by accident.
  dismissX1BannerToday(today: string): void;

  // R3.8
  setDonutScope(s: DonutScope): void;

  // R4.5 B15
  setBlocksScope(s: BlocksScope): void;

  // R3.6 — per-agent state machine transitions. Components call
  // `setPerAgent("loading")` synchronously before the fetch hop so the
  // 100ms skeleton gate (spec-v3 §1.4) renders immediately.
  setPerAgent(state: PerAgentResult): void;
  setPerAgentLoading(): void;
  resetPerAgent(): void;
}

const LS = {
  view: "ccusage.v1.view",
  window: "ccusage.v1.trend.window",
  mode: "ccusage.v1.trend.mode",
  compare: "ccusage.v1.compare",
  rangePreset: "ccusage.v1.range.preset",
  rangeFrom: "ccusage.v1.range.from",
  rangeTo: "ccusage.v1.range.to",
  // R2: settings prefs are CROSS-MODE data prefs, not v1-UI state. Use the
  // PRD-literal `ccusage.mode/.offline/.tz` keys per designer ack.
  costMode: "ccusage.mode",
  offline: "ccusage.offline",
  nativeParser: "ccusage.native",
  tz: "ccusage.tz",
  // R3.7 — budget prefs are also cross-mode (the cap is a user policy,
  // not v1-UI state). PRD-literal keys: `ccusage.budget.cap` + `.tokenLimit`.
  monthlyCapUSD: "ccusage.budget.cap",
  perBlockTokenLimit: "ccusage.budget.tokenLimit",
  // R3.8 — donut scope persists across reloads.
  donutScope: "ccusage.v1.donut.scope",
  // R4.6 — config-path (cross-mode pref, no v1 prefix per designer ack)
  configPath: "ccusage.config",
  // R4.5 B15 — blocks-panel Recent/All scope toggle
  blocksScope: "ccusage.v1.blocks.scope",
} as const;

const VALID_VIEW = new Set<ViewMode>(["aggregate", "by-agent"]);
const VALID_WINDOW = new Set<TrendWindow>(["today", "7", "30", "60", "90"]);
const VALID_MODE = new Set<TrendMode>(["aggregate", "stacked", "100", "lines"]);
const VALID_PRESET = new Set<RangePreset>(["today", "7d", "30d", "90d", "this-mo", "last-mo", "custom"]);
const VALID_COST_MODE = new Set<CostMode>(["calculate", "auto", "display"]);
const VALID_DONUT_SCOPE = new Set<DonutScope>(["window", "all"]);
const VALID_BLOCKS_SCOPE = new Set<BlocksScope>(["recent", "all"]);

function parseFiniteNumber(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): Range {
  const now = new Date();
  const to = isoDay(now);
  const from = isoDay(new Date(now.getTime() - 29 * 24 * 3600 * 1000));
  return { preset: "30d", from, to };
}

function defaultMode(): ModeState {
  const tz = (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC") || "UTC";
  return {
    costMode: "calculate", offline: false, nativeParser: false, timezone: tz,
    monthlyCapUSD: null, perBlockTokenLimit: null,
    configPath: "",
  };
}

function defaultPerAgent(): PerAgentResult {
  return { status: "idle", succeeded: [], failed: [], timedOut: [], elapsedMs: 0, budgetMs: 800 };
}

function chipKey(c: FilterChip): string { return `${c.kind}:${c.value}`; }

export const useV1Store = create<V1State>((set, get) => ({
  view: readLS<ViewMode>(LS.view, "aggregate", (s) => (VALID_VIEW.has(s as ViewMode) ? s as ViewMode : "aggregate")),
  filters: [],
  trendWindow: readLS<TrendWindow>(LS.window, "30", (s) => (VALID_WINDOW.has(s as TrendWindow) ? s as TrendWindow : "30")),
  trendMode: readLS<TrendMode>(LS.mode, "stacked", (s) => (VALID_MODE.has(s as TrendMode) ? s as TrendMode : "stacked")),
  compareOn: readLS<boolean>(LS.compare, false, (s) => s === "true"),

  range: (() => {
    const preset = readLS<RangePreset>(LS.rangePreset, "30d", (s) => (VALID_PRESET.has(s as RangePreset) ? s as RangePreset : "30d"));
    const from = readLS<string>(LS.rangeFrom, "", (s) => (DATE_RE.test(s) ? s : ""));
    const to = readLS<string>(LS.rangeTo, "", (s) => (DATE_RE.test(s) ? s : ""));
    if (preset === "custom" && from && to) return { preset, from, to };
    return defaultRange();
  })(),
  rangeOpen: false,

  mode: {
    costMode: readLS<CostMode>(LS.costMode, "calculate", (s) => (VALID_COST_MODE.has(s as CostMode) ? s as CostMode : "calculate")),
    offline: readLS<boolean>(LS.offline, false, (s) => s === "true"),
    nativeParser: readLS<boolean>(LS.nativeParser, false, (s) => s === "true"),
    timezone: readLS<string>(LS.tz, defaultMode().timezone, (s) => s || defaultMode().timezone),
    monthlyCapUSD:      readLS<number | null>(LS.monthlyCapUSD,      null, parseFiniteNumber),
    perBlockTokenLimit: readLS<number | null>(LS.perBlockTokenLimit, null, parseFiniteNumber),
    configPath:         readLS<string>(LS.configPath, "", (s) => s ?? ""),
  },
  settingsOpen: false,

  projectsDialogOpen: false,
  blockDetailId: null,
  limitResetDismissed: false,

  x1BannerDismissedFor: null,
  donutScope: readLS<DonutScope>(LS.donutScope, "window", (s) => (VALID_DONUT_SCOPE.has(s as DonutScope) ? s as DonutScope : "window")),
  blocksScope: readLS<BlocksScope>(LS.blocksScope, "recent", (s) => (VALID_BLOCKS_SCOPE.has(s as BlocksScope) ? s as BlocksScope : "recent")),
  perAgent: defaultPerAgent(),

  setView(v) { writeLS(LS.view, v); set({ view: v }); },
  addFilter(c) {
    const k = chipKey(c);
    if (get().filters.some((x) => chipKey(x) === k)) return;
    set({ filters: [...get().filters, c] });
  },
  removeFilter(c) {
    const k = chipKey(c);
    set({ filters: get().filters.filter((x) => chipKey(x) !== k) });
  },
  clearFilters() { set({ filters: [] }); },
  setTrendWindow(w) { writeLS(LS.window, w); set({ trendWindow: w }); },
  setTrendMode(m) { writeLS(LS.mode, m); set({ trendMode: m }); },
  toggleCompare() {
    const next = !get().compareOn;
    writeLS(LS.compare, String(next));
    set({ compareOn: next });
  },

  setRange(r) {
    writeLS(LS.rangePreset, r.preset);
    writeLS(LS.rangeFrom, r.from);
    writeLS(LS.rangeTo, r.to);
    set({ range: r });
  },
  setRangeOpen(b) { set({ rangeOpen: b }); },
  resetRange() {
    const r = defaultRange();
    writeLS(LS.rangePreset, r.preset);
    writeLS(LS.rangeFrom, r.from);
    writeLS(LS.rangeTo, r.to);
    set({ range: r, compareOn: false });
    writeLS(LS.compare, "false");
  },

  setMode(patch) {
    const next = { ...get().mode, ...patch };
    if (patch.costMode !== undefined) writeLS(LS.costMode, next.costMode);
    if (patch.offline !== undefined) writeLS(LS.offline, String(next.offline));
    if (patch.nativeParser !== undefined) writeLS(LS.nativeParser, String(next.nativeParser));
    if (patch.timezone !== undefined) writeLS(LS.tz, next.timezone);
    if (patch.monthlyCapUSD !== undefined) {
      writeLS(LS.monthlyCapUSD, next.monthlyCapUSD == null ? "" : String(next.monthlyCapUSD));
    }
    if (patch.perBlockTokenLimit !== undefined) {
      writeLS(LS.perBlockTokenLimit, next.perBlockTokenLimit == null ? "" : String(next.perBlockTokenLimit));
    }
    if (patch.configPath !== undefined) writeLS(LS.configPath, next.configPath);
    set({ mode: next });
  },
  resetMode() {
    const m = defaultMode();
    writeLS(LS.costMode, m.costMode);
    writeLS(LS.offline, String(m.offline));
    writeLS(LS.nativeParser, String(m.nativeParser));
    writeLS(LS.tz, m.timezone);
    writeLS(LS.monthlyCapUSD, "");
    writeLS(LS.perBlockTokenLimit, "");
    writeLS(LS.configPath, "");
    set({ mode: m });
  },
  setSettingsOpen(b) { set({ settingsOpen: b }); },

  setProjectsDialogOpen(b) { set({ projectsDialogOpen: b }); },
  setBlockDetailId(id) { set({ blockDetailId: id }); },

  dismissLimitReset() { set({ limitResetDismissed: true }); },
  resetLimitResetDismiss() { set({ limitResetDismissed: false }); },

  dismissX1BannerToday(today) { set({ x1BannerDismissedFor: today }); },

  setDonutScope(s) { writeLS(LS.donutScope, s); set({ donutScope: s }); },

  setBlocksScope(s) { writeLS(LS.blocksScope, s); set({ blocksScope: s }); },

  setPerAgent(state) { set({ perAgent: state }); },
  setPerAgentLoading() {
    const prev = get().perAgent;
    set({ perAgent: { ...prev, status: "loading" } });
  },
  resetPerAgent() { set({ perAgent: defaultPerAgent() }); },
}));

/** Test/reset helper. */
export function __resetV1StoreForTests(): void {
  if (typeof window !== "undefined") {
    Object.values(LS).forEach((k) => { try { window.localStorage.removeItem(k); } catch { /* */ } });
  }
  useV1Store.setState({
    view: "aggregate",
    filters: [],
    trendWindow: "30",
    trendMode: "stacked",
    compareOn: false,
    range: defaultRange(),
    rangeOpen: false,
    mode: defaultMode(),
    settingsOpen: false,
    projectsDialogOpen: false,
    blockDetailId: null,
    limitResetDismissed: false,
    x1BannerDismissedFor: null,
    donutScope: "window",
    blocksScope: "recent",
    perAgent: defaultPerAgent(),
  });
}

/** Default-detection helper used by the Settings popover dot indicator. */
export function isModeDefault(m: ModeState): boolean {
  const d = defaultMode();
  return m.costMode === d.costMode
    && !m.offline && !m.nativeParser
    && m.timezone === d.timezone
    && m.monthlyCapUSD === d.monthlyCapUSD
    && m.perBlockTokenLimit === d.perBlockTokenLimit
    && m.configPath === d.configPath;
}

export function formatRangeLabel(r: Range): string {
  if (r.preset === "today") return "Today";
  if (r.preset === "7d") return "7d";
  if (r.preset === "30d") return "30d";
  if (r.preset === "90d") return "90d";
  if (r.preset === "this-mo") return "This month";
  if (r.preset === "last-mo") return "Last month";
  // custom
  return `${r.from} → ${r.to}`;
}
