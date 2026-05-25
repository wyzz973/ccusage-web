// D1 — Top projects derivation.
//
// Spec-v2 §3.2.2: top-N projects by USD cost over the current range.
// Carries both the canonical (filter-chip stable) form and the display name.
// Driven by `UsageRecord.project` which the poller stamps from session paths
// (R2 S4 wiring).
//
// Share-of-total invariant (§1.1):
//   N: per-project sum of session.totalCost in the window
//   D: same — sum of all attributed sessions in the window (NOT daily total —
//      same-source pairing avoids the M-B1 class of bug).
//   D = 0 → empty list; UI renders "No project metadata in current window".

import type { UsageRecord } from "../types.js";
import { decodeProject } from "./project.js";

export interface ProjectRollup {
  canonical: string;        // stable filter-chip value
  displayName: string;       // short label
  cost: number;
  tokens: number;
  sessions: number;          // how many sessions contributed
  pctOfWindow: number;       // 0..100, integer; same-source denominator
}

export interface ProjectsInputs {
  /** Session records to roll up (caller filters by window). */
  sessionRecords: UsageRecord[];
}

export function computeProjectRollups(input: ProjectsInputs): ProjectRollup[] {
  type Agg = { canonical: string; displayName: string; cost: number; tokens: number; sessions: number };
  const acc = new Map<string, Agg>();
  let windowTotal = 0;

  for (const s of input.sessionRecords) {
    if (!Number.isFinite(s.totalCost)) continue;
    const raw = s.project ?? "";
    if (raw === "" || raw === "unknown") continue;
    const dec = decodeProject(raw);
    if (dec.canonical === "unknown") continue;
    const cur = acc.get(dec.canonical) ?? {
      canonical: dec.canonical,
      displayName: dec.displayName,
      cost: 0, tokens: 0, sessions: 0,
    };
    cur.cost += s.totalCost;
    cur.tokens += s.totalTokens;
    cur.sessions += 1;
    acc.set(dec.canonical, cur);
    windowTotal += s.totalCost;
  }

  const out: ProjectRollup[] = Array.from(acc.values())
    .sort((a, b) => b.cost - a.cost)
    .map((a) => ({
      canonical: a.canonical,
      displayName: a.displayName,
      cost: a.cost,
      tokens: a.tokens,
      sessions: a.sessions,
      pctOfWindow: windowTotal > 0
        ? Math.min(100, Math.max(0, Math.round((a.cost / windowTotal) * 100)))
        : 0,
    }));

  return out;
}
