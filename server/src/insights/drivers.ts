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
  /** Optional per-session contributions to project (Round-2 will populate). */
  todaysSessions?: Array<{ project?: string | undefined; cost: number }>;
}

export function computeTodayDrivers(input: DriversInputs): TodayDrivers {
  const records = input.todaysDailyRecords;
  const totalCostUSD = records.reduce((s, r) => s + (Number.isFinite(r.totalCost) ? r.totalCost : 0), 0);

  if (totalCostUSD <= 0) {
    return { totalCostUSD: 0 };
  }

  // --- agent rollup ---
  const agentTotals = new Map<string, number>();
  for (const r of records) {
    const c = Number.isFinite(r.totalCost) ? r.totalCost : 0;
    agentTotals.set(r.agent, (agentTotals.get(r.agent) ?? 0) + c);
  }
  const agent = topSegment(agentTotals, totalCostUSD);

  // --- model rollup ---
  const modelTotals = new Map<string, number>();
  for (const r of records) {
    for (const mb of r.modelBreakdowns ?? []) {
      const c = Number.isFinite(mb.cost) ? mb.cost : 0;
      modelTotals.set(mb.modelName, (modelTotals.get(mb.modelName) ?? 0) + c);
    }
  }
  const model = topSegment(modelTotals, totalCostUSD);

  // --- project rollup (Round-1: usually empty; Round-2: populated by M6) ---
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
      project = topSegment(projTotals, totalCostUSD);
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
  return {
    name: topName,
    pct: Math.round((topCost / denominator) * 100),
    costUSD: topCost,
  };
}
