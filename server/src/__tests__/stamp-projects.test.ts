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

describe("stampProjects (R2 S4 + R2.2 M-R2-1)", () => {
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

  it("leaves project undefined when no signal is available (no map, no metadata hint)", () => {
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

  // R2.2 M-R2-1 closure for the ccusage source path: the new sessionId-→-
  // canonical map fills the gap where ccusage's --json output has no
  // file-path / project signal of its own.
  it("stamps from the sessionId→canonical map when ccusage source has no metadata hint", () => {
    const a = sess({ period: "9f3a00" });
    const map = new Map([["9f3a00", "-Users-x-alpha"]]);
    const out = stampProjects([a], map);
    expect(out[0]?.project).toBe("-Users-x-alpha");
  });

  it("prefers the already-stamped project (native pre-stamp) over the map", () => {
    const a = sess({ period: "9f3a00", project: "-native-pre-stamped" });
    const map = new Map([["9f3a00", "-from-the-map"]]);
    const out = stampProjects([a], map);
    expect(out[0]?.project).toBe("-native-pre-stamped");
  });
});
