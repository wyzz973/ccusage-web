// "Driver of the day" derivation — closes PRD M7.AC1–AC5.
//
// Returns the single top-share entity (by USD cost) per dimension across
// "today" (the slice of session/daily records whose period === todayKey
// for daily, or whose lastActivity falls on todayKey for session).
//
// Dimensions:
//   agent   — from UsageRecord.agent on today's daily records
//   model   — from UsageRecord.modelBreakdowns (best per-model rollup)
//   project — derived via extractProject; in Round 1 the snapshot does
//             not carry project info, so this segment will frequently be
//             omitted. The shape stays stable so Round-2 just populates.
//
// Percentages are integers, share-of-cost (USD), rounded with Math.round.
// `agent`/`model`/`project` are all optional; the consumer omits any
// segment whose data is missing (PRD M7.AC2).

import type { UsageRecord } from "../types.js";

export interface DriverSegment {
  name: string;
  pct: number; // 0–100, integer
  costUSD: number;
}

export interface TodayDrivers {
  agent?: DriverSegment;
  model?: DriverSegment;
  project?: DriverSegment;
  /** Total USD across today's daily records — useful for empty-state copy. */
  totalCostUSD: number;
}

export interface DriversInputs {
  /** Today's slice of daily records (already filtered to `period === todayKey`). */
  todaysDailyRecords: UsageRecord[];
  /**
   * Per-session contributions. When sessions carry real agent labels
   * (e.g. "claude" / "codex"), the agent rollup prefers this source — it
   * disambiguates ccusage's `agent: "all"` aggregate-sentinel on daily
   * records, which would otherwise show the user "Unknown 100 %".
   * Round 2's M6 will also populate `project` here.
   */
  todaysSessions?: Array<{
    agent?: string | undefined;
    project?: string | undefined;
    cost: number;
  }>;
}

function isRealAgentLabel(s: string | undefined | null): boolean {
  return !!s && s !== "all" && s !== "unknown" && s.trim() !== "";
}

export function computeTodayDrivers(input: DriversInputs): TodayDrivers {
  const records = input.todaysDailyRecords;
  const totalCostUSD = records.reduce((s, r) => s + (Number.isFinite(r.totalCost) ? r.totalCost : 0), 0);

  if (totalCostUSD <= 0) {
    return { totalCostUSD: 0 };
  }

  // --- agent rollup ---
  // M-A3 (R1.5): ccusage emits `daily[].agent === "all"` (aggregate sentinel).
  // If we roll up by that, the driver strip surfaces "Unknown 100 %". Prefer
  // per-session attribution when sessions carry real agent labels; fall back
  // to daily.metadata.agents[0] (single-agent-day hint); fall back to the
  // raw daily.agent only when nothing better is available.
  //
  // M-B1 (R1.5.1): the numerator's source determines the denominator —
  // mixing session-derived numerators with daily-derived totals lets pct
  // exceed 100 % when ccusage's session vs daily sums disagree for the same
  // day (they legitimately can: session has unique-session granularity,
  // daily is the upstream aggregator's own rollup with different floor/ceil).
  const agentTotals = new Map<string, number>();
  const realSessions = (input.todaysSessions ?? []).filter((s) => isRealAgentLabel(s.agent));
  let agentDenominator = totalCostUSD;
  if (realSessions.length > 0) {
    for (const s of realSessions) {
      const c = Number.isFinite(s.cost) ? s.cost : 0;
      agentTotals.set(s.agent!, (agentTotals.get(s.agent!) ?? 0) + c);
    }
    // Sum of the same source we summed for the numerator.
    agentDenominator = Array.from(agentTotals.values()).reduce((a, b) => a + b, 0);
  } else {
    for (const r of records) {
      const c = Number.isFinite(r.totalCost) ? r.totalCost : 0;
      const hinted = isRealAgentLabel(r.metadata?.agents?.[0]) ? r.metadata!.agents![0]! : null;
      const name = hinted ?? r.agent;
      agentTotals.set(name, (agentTotals.get(name) ?? 0) + c);
    }
  }
  const agent = topSegment(agentTotals, agentDenominator);

  // --- model rollup ---
  // Numerator + denominator both from daily; no M-B1 risk here.
  const modelTotals = new Map<string, number>();
  for (const r of records) {
    for (const mb of r.modelBreakdowns ?? []) {
      const c = Number.isFinite(mb.cost) ? mb.cost : 0;
      modelTotals.set(mb.modelName, (modelTotals.get(mb.modelName) ?? 0) + c);
    }
  }
  const model = topSegment(modelTotals, totalCostUSD);

  // --- project rollup (Round-1: usually empty; Round-2: populated by M6) ---
  // M-B1 (R1.5.1): numerator from sessions → denominator from sessions too.
  let project: DriverSegment | undefined;
  if (input.todaysSessions && input.todaysSessions.length > 0) {
    const projTotals = new Map<string, number>();
    for (const s of input.todaysSessions) {
      const name = s.project ?? "";
      if (name === "" || name === "unknown") continue;
      const c = Number.isFinite(s.cost) ? s.cost : 0;
      projTotals.set(name, (projTotals.get(name) ?? 0) + c);
    }
    if (projTotals.size > 0) {
      const projDenominator = Array.from(projTotals.values()).reduce((a, b) => a + b, 0);
      project = topSegment(projTotals, projDenominator);
    }
  }

  const out: TodayDrivers = { totalCostUSD };
  if (agent) out.agent = agent;
  if (model) out.model = model;
  if (project) out.project = project;
  return out;
}

function topSegment(totals: Map<string, number>, denominator: number): DriverSegment | undefined {
  if (totals.size === 0 || denominator <= 0) return undefined;
  let topName = "";
  let topCost = -Infinity;
  for (const [name, cost] of totals) {
    if (cost > topCost) {
      topCost = cost;
      topName = name;
    }
  }
  if (topName === "" || topCost <= 0) return undefined;
  // M-B1 (R1.5.1): belt-and-braces clamp. The denominator-source-match fix
  // above is the real correctness fix; this clamp is the safety net so any
  // future divergence (e.g. a new dimension wired up without matched sums)
  // still honors the `pct: 0–100, integer` contract documented on
  // `DriverSegment` (line 22 of this file).
  const rawPct = Math.round((topCost / denominator) * 100);
  const pct = Math.min(100, Math.max(0, rawPct));
  return { name: topName, pct, costUSD: topCost };
}
