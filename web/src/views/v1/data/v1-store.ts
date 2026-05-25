// V1-mode UI store. Keeps mode-switch state cleanly partitioned from the
// classic Dashboard's usage-store via the `ccusage.v1.*` localStorage
// keyspace (Designer ack'd, R1 round 1).

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

interface V1State {
  view: ViewMode;
  filters: FilterChip[];
  trendWindow: TrendWindow;
  trendMode: TrendMode;
  compareOn: boolean;

  setView(v: ViewMode): void;
  addFilter(c: FilterChip): void;
  removeFilter(c: FilterChip): void;
  clearFilters(): void;
  setTrendWindow(w: TrendWindow): void;
  setTrendMode(m: TrendMode): void;
  toggleCompare(): void;
}

const LS = {
  view: "ccusage.v1.view",
  window: "ccusage.v1.trend.window",
  mode: "ccusage.v1.trend.mode",
  compare: "ccusage.v1.compare",
} as const;

const VALID_VIEW = new Set<ViewMode>(["aggregate", "by-agent"]);
const VALID_WINDOW = new Set<TrendWindow>(["today", "7", "30", "60", "90"]);
const VALID_MODE = new Set<TrendMode>(["aggregate", "stacked", "100", "lines"]);

function chipKey(c: FilterChip): string { return `${c.kind}:${c.value}`; }

export const useV1Store = create<V1State>((set, get) => ({
  view: readLS<ViewMode>(LS.view, "aggregate", (s) => (VALID_VIEW.has(s as ViewMode) ? s as ViewMode : "aggregate")),
  filters: [],
  trendWindow: readLS<TrendWindow>(LS.window, "30", (s) => (VALID_WINDOW.has(s as TrendWindow) ? s as TrendWindow : "30")),
  trendMode: readLS<TrendMode>(LS.mode, "stacked", (s) => (VALID_MODE.has(s as TrendMode) ? s as TrendMode : "stacked")),
  compareOn: readLS<boolean>(LS.compare, false, (s) => s === "true"),

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
}));

/** Test/reset helper — wipes both the store and the persisted keys. */
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
  });
}
