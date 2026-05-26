// R3.5 — detected-agents rollup.
//
// Property: the function never emits the "all" aggregate sentinel or the
// "unknown" sink. AgentChipRow consumes this directly to render filter
// chips; a degenerate "all" chip would create a tautology, and an
// "unknown" chip surfaces R1 S3-shaped silent-failure to the user.

import { describe, it, expect } from "vitest";
import { computeDetectedAgents } from "../detected-agents";
import type { UsageRecord } from "../../types";

function rec(agent: string, period = "s1"): UsageRecord {
  return {
    period, agent,
    totalTokens: 0, totalCost: 0,
    inputTokens: 0, outputTokens: 0,
    cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
  };
}

describe("computeDetectedAgents (R3.5)", () => {
  it("returns sorted unique agent labels", () => {
    const out = computeDetectedAgents({
      sessionRecords: [rec("codex"), rec("claude"), rec("claude"), rec("gemini")],
    });
    expect(out).toEqual(["claude", "codex", "gemini"]);
  });

  it("filters out the 'all' aggregate sentinel", () => {
    const out = computeDetectedAgents({
      sessionRecords: [rec("all"), rec("claude")],
    });
    expect(out).toEqual(["claude"]);
  });

  it("filters out the 'unknown' sink", () => {
    const out = computeDetectedAgents({
      sessionRecords: [rec("unknown"), rec("claude")],
    });
    expect(out).toEqual(["claude"]);
  });

  it("filters out empty / whitespace-only agent strings", () => {
    const out = computeDetectedAgents({
      sessionRecords: [rec(""), rec("   "), rec("claude")],
    });
    expect(out).toEqual(["claude"]);
  });

  it("returns [] for empty input (UI hides the row)", () => {
    expect(computeDetectedAgents({ sessionRecords: [] })).toEqual([]);
  });

  it("returns [] when every record is filtered out (degenerate input)", () => {
    const out = computeDetectedAgents({
      sessionRecords: [rec("all"), rec("unknown"), rec("")],
    });
    expect(out).toEqual([]);
  });
});
