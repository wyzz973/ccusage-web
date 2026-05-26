// R3.5 — Detected-agents rollup.
//
// spec-v3 §3.1.4: the agent chip-row should only show chips for agents
// the user actually has logs from. This insight derives the set from
// session records' `agent` field (skipping the "all" aggregate sentinel
// and "unknown" sink) so the UI renders an honest filter affordance.
//
// Pure function — no IO, no clock. The poller calls it once per snapshot.

import type { UsageRecord } from "../types.js";

export interface DetectedAgentsInputs {
  /** Session records to scan. */
  sessionRecords: UsageRecord[];
}

/**
 * Returns the sorted, unique set of agent labels present in the session
 * records. Skips the "all" aggregate sentinel and the "unknown" sink so
 * the chip row never offers degenerate filter options. Empty result =
 * UI hides the entire row.
 */
export function computeDetectedAgents(input: DetectedAgentsInputs): string[] {
  const seen = new Set<string>();
  for (const s of input.sessionRecords) {
    const a = s.agent;
    if (!a || a === "all" || a === "unknown" || a.trim() === "") continue;
    seen.add(a);
  }
  return Array.from(seen).sort();
}
