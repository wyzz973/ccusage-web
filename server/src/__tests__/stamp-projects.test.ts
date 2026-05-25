import { describe, it, expect } from "vitest";
import { stampProjects } from "../poller";
import type { UsageRecord } from "../types";

function sess(opts: Partial<UsageRecord> = {}): UsageRecord {
  return {
    period: "s1", agent: "claude",
    totalTokens: 0, totalCost: 0,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
    ...opts,
  };
}

describe("stampProjects (R2 S4)", () => {
  it("leaves records that already carry project untouched", () => {
    const a = sess({ project: "-Users-x-alpha" });
    const out = stampProjects([a]);
    expect(out[0]?.project).toBe("-Users-x-alpha");
  });

  it("derives project from metadata.project upstream hint when present", () => {
    const a = sess({ metadata: { project: "-Users-x-alpha" } as never });
    const out = stampProjects([a]);
    expect(out[0]?.project).toBe("-Users-x-alpha");
  });

  it("leaves project undefined when no signal is available (ccusage shellout path)", () => {
    const a = sess();
    const out = stampProjects([a]);
    expect(out[0]?.project).toBeUndefined();
  });

  it("does not mutate the input array", () => {
    const a = sess({ metadata: { project: "-x" } as never });
    const input = [a];
    const out = stampProjects(input);
    expect(out).not.toBe(input);
    expect(input[0]?.project).toBeUndefined();
  });
});
