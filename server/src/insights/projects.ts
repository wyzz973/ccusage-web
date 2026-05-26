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
import { decodeProject, type DisplayNameSource } from "./project.js";

export interface ProjectRollup {
  canonical: string;        // stable filter-chip value
  displayName: string;       // short label
  /**
   * R3 §C: source of the displayName so UI can render a "ⓘ" hint when
   * we couldn't sniff the unambiguous `cwd` value and fell back to the
   * lossy trailing-`-`-segment heuristic.
   */
  displayNameSource: DisplayNameSource;
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
  type Agg = { canonical: string; displayName: string; source: DisplayNameSource; cost: number; tokens: number; sessions: number };
  const acc = new Map<string, Agg>();
  let windowTotal = 0;

  for (const s of input.sessionRecords) {
    if (!Number.isFinite(s.totalCost)) continue;
    const raw = s.project ?? "";
    if (raw === "" || raw === "unknown") continue;
    // R3 §C: prefer the record's pre-stamped displayName + source (set by
    // either native runner's bucketBySession via cwd-sniff, or poller's
    // stampProjects via the SessionProjectMap which also did cwd-sniff
    // at build time). Fall back to decoding from canonical only when the
    // record came from a source that didn't pre-stamp display info
    // (defensive — every R3 path stamps).
    const canonical = raw;
    let displayName = s.projectDisplay;
    let source: DisplayNameSource = s.projectDisplaySource ?? "absent";
    if (!displayName) {
      const dec = decodeProject(canonical);
      if (dec.canonical === "unknown") continue;
      displayName = dec.displayName;
      source = dec.displayNameSource;
    }
    const cur = acc.get(canonical) ?? {
      canonical, displayName, source,
      cost: 0, tokens: 0, sessions: 0,
    };
    // If we see a higher-quality source mid-aggregation (cwd > heuristic
    // > absent), prefer it. Useful when one session in the project had
    // cwd stripped and another didn't.
    if (sourceRank(source) > sourceRank(cur.source)) {
      cur.source = source;
      cur.displayName = displayName;
    }
    cur.cost += s.totalCost;
    cur.tokens += s.totalTokens;
    cur.sessions += 1;
    acc.set(canonical, cur);
    windowTotal += s.totalCost;
  }

  const out: ProjectRollup[] = Array.from(acc.values())
    .sort((a, b) => b.cost - a.cost)
    .map((a) => ({
      canonical: a.canonical,
      displayName: a.displayName,
      displayNameSource: a.source,
      cost: a.cost,
      tokens: a.tokens,
      sessions: a.sessions,
      pctOfWindow: windowTotal > 0
        ? Math.min(100, Math.max(0, Math.round((a.cost / windowTotal) * 100)))
        : 0,
    }));

  return out;
}

function sourceRank(s: DisplayNameSource): number {
  if (s === "cwd") return 2;
  if (s === "encoded-heuristic") return 1;
  return 0;
}
