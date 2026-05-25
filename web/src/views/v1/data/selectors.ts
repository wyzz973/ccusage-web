// Pure-function selectors that turn a Snapshot into the shapes v1
// components render. **No** React imports here — testable as plain TS.

import type { Snapshot, UsageRecord, DriverSegment } from "@/types";
import type { AgentKey } from "../lib/agent-colors";
import { toAgentKey } from "../lib/agent-colors";

export interface FilterChip {
  kind: "agent" | "project" | "model" | "date" | "session" | "range";
  value: string;
  /** Optional human-facing label override. D1 uses displayName so the chip
   *  shows `web` while the canonical value stays unique for chip identity. */
  displayName?: string;
}

// ── R2: range-aware slicing (D2 + S13) ───────────────────────────────────

export interface DateRange { from: string; to: string }

/** Filter daily records by an inclusive [from, to] YYYY-MM-DD range. */
export function selectDailyInRange(records: UsageRecord[], range: DateRange): UsageRecord[] {
  return records.filter((r) => r.period >= range.from && r.period <= range.to);
}

/** Filter session records by lastActivity inside [from, to]. */
export function selectSessionsInRange(records: UsageRecord[], range: DateRange): UsageRecord[] {
  return records.filter((r) => {
    const t = r.metadata?.lastActivity;
    if (!t) return false;
    const day = t.slice(0, 10);
    return day >= range.from && day <= range.to;
  });
}

// ── KPI numbers ──────────────────────────────────────────────────────────

export interface KpiSet {
  today:   { cost: number; tokens: number };
  week:    { cost: number; tokens: number };
  month:   { cost: number; tokens: number };
  allTime: { cost: number; tokens: number; sessions: number };
}

export function selectKpis(snap: Snapshot | null): KpiSet {
  const empty = { cost: 0, tokens: 0 };
  if (!snap) {
    return { today: empty, week: empty, month: empty, allTime: { ...empty, sessions: 0 } };
  }
  return {
    today: snap.derived.today,
    week:  snap.derived.week,
    month: snap.derived.month,
    allTime: { ...snap.derived.allTime, sessions: snap.session.records.length },
  };
}

// ── Per-agent breakdown ──────────────────────────────────────────────────

export interface AgentSlice {
  agent: AgentKey;
  rawAgent: string;
  cost: number;
  tokens: number;
}

/** Returns each agent's total over the supplied daily records, sorted desc. */
export function selectAgentBreakdown(records: UsageRecord[]): AgentSlice[] {
  const acc = new Map<string, AgentSlice>();
  for (const r of records) {
    const cur = acc.get(r.agent) ?? {
      agent: toAgentKey(r.agent), rawAgent: r.agent, cost: 0, tokens: 0,
    };
    cur.cost += r.totalCost;
    cur.tokens += r.totalTokens;
    acc.set(r.agent, cur);
  }
  return Array.from(acc.values()).sort((a, b) => b.cost - a.cost);
}

// ── Sparkline series ─────────────────────────────────────────────────────

/**
 * Daily sparkline: last `n` days of total cost in chronological order.
 * Multiple records per day (one per agent) are summed.
 */
export function selectDailySparkSeries(records: UsageRecord[], n = 14): number[] {
  const byDay = new Map<string, number>();
  for (const r of records) {
    byDay.set(r.period, (byDay.get(r.period) ?? 0) + r.totalCost);
  }
  const sorted = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.slice(-n).map((x) => x[1]);
}

// ── Trend chart series ───────────────────────────────────────────────────

export type TrendMode = "aggregate" | "stacked" | "100" | "lines";

export interface TrendDatum {
  period: string;
  total: number;
  /** per-agent contributions, key = agent string from the snapshot. */
  [agentKey: string]: number | string;
}

export function selectTrendSeries(
  records: UsageRecord[],
  windowDays: number,
): { data: TrendDatum[]; agents: AgentKey[] } {
  // Pivot (period × agent) → row per period.
  const byPeriod = new Map<string, TrendDatum>();
  const agentSet = new Set<AgentKey>();
  for (const r of records) {
    let row = byPeriod.get(r.period);
    if (!row) {
      row = { period: r.period, total: 0 };
      byPeriod.set(r.period, row);
    }
    const a = toAgentKey(r.agent);
    agentSet.add(a);
    row[a] = (Number(row[a] ?? 0) + r.totalCost);
    row.total = Number(row.total) + r.totalCost;
  }
  const allAgents: AgentKey[] = ["claude", "codex", "gemini", "copilot", "openclaw", "unknown"]
    .filter((a) => agentSet.has(a as AgentKey)) as AgentKey[];

  const data = Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period));
  // Ensure every agent key is present on every row (recharts stacks need this).
  for (const row of data) {
    for (const a of allAgents) if (row[a] == null) row[a] = 0;
  }
  const sliced = data.slice(-windowDays);
  return { data: sliced, agents: allAgents };
}

// ── Top sessions ─────────────────────────────────────────────────────────

export function selectTopSessions(records: UsageRecord[], n = 5): UsageRecord[] {
  return [...records].sort((a, b) => b.totalCost - a.totalCost).slice(0, n);
}

// ── Driver-of-the-day fallback ───────────────────────────────────────────

/**
 * If the server omitted `derived.todayDrivers` (older builds), compute it
 * client-side from the snapshot's daily records. Mirror of the server
 * function — kept in sync via the shared `DriverSegment` type.
 */
export function selectTodayDriversFallback(
  snap: Snapshot | null,
  todayKey: string,
): { agent?: DriverSegment; model?: DriverSegment; totalCostUSD: number } {
  if (!snap) return { totalCostUSD: 0 };
  const todays = snap.daily.records.filter((r) => r.period === todayKey);
  const total = todays.reduce((s, r) => s + r.totalCost, 0);
  if (total <= 0) return { totalCostUSD: 0 };
  const agentMap = new Map<string, number>();
  const modelMap = new Map<string, number>();
  for (const r of todays) {
    agentMap.set(r.agent, (agentMap.get(r.agent) ?? 0) + r.totalCost);
    for (const mb of r.modelBreakdowns ?? []) {
      modelMap.set(mb.modelName, (modelMap.get(mb.modelName) ?? 0) + mb.cost);
    }
  }
  return {
    totalCostUSD: total,
    agent: topOf(agentMap, total),
    model: topOf(modelMap, total),
  };
}

function topOf(m: Map<string, number>, total: number): DriverSegment | undefined {
  if (m.size === 0 || total <= 0) return undefined;
  let name = "", cost = -Infinity;
  for (const [k, v] of m) if (v > cost) { name = k; cost = v; }
  if (cost <= 0) return undefined;
  return { name, costUSD: cost, pct: Math.round((cost / total) * 100) };
}

// ── Session filtering for the v1 table ───────────────────────────────────

export function applySessionFilters(records: UsageRecord[], filters: FilterChip[], q: string): UsageRecord[] {
  let r = records;
  for (const c of filters) {
    if (c.kind === "agent") r = r.filter((s) => toAgentKey(s.agent) === c.value);
    else if (c.kind === "project") r = r.filter((s) => (s.project ?? "") === c.value);
    else if (c.kind === "session") r = r.filter((s) => s.period === c.value);
    else if (c.kind === "model") r = r.filter((s) => s.modelsUsed.includes(c.value));
    else if (c.kind === "date") {
      r = r.filter((s) => (s.metadata?.lastActivity ?? "").startsWith(c.value));
    }
  }
  const ql = q.trim().toLowerCase();
  if (ql) {
    r = r.filter((s) =>
      s.period.toLowerCase().includes(ql) ||
      (s.project ?? "").toLowerCase().includes(ql) ||
      s.modelsUsed.some((m) => m.toLowerCase().includes(ql)),
    );
  }
  return r;
}
