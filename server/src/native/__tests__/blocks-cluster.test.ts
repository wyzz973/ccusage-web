// R4.0.a — `identify_session_blocks` cluster-and-gap algorithm port.
//
// Per Researcher v4 §B.1: the pre-R4 fixed-UTC-grid algorithm produced
// 608 blocks vs ccusage's 198 (3.07×) on the 4-month real `~/.claude`
// dataset. The fix ports ccusage's `identify_session_blocks` from
// `blocks.rs:15-65` verbatim:
//
//   - Floor cluster starts to the HOUR (not 5h grid) in user-local TZ.
//   - New cluster when entry > 5h from EITHER cluster-start OR last entry.
//   - Gap block ONLY between two real clusters when last→next gap > 5h
//     (one quiet weekend = one gap block; old algorithm emitted one
//     gap block per empty grid window).
//
// These tests pin the new behaviour. The TZ-anchoring test catches the
// other half of B.1 (UTC vs user-local hour) — pre-R4 anchored to UTC
// hour regardless of caller's `tz`.

import { describe, it, expect } from "vitest";
import { runNative } from "../runner";

const PROJECT_FILE = "/u/.claude/projects/test-app/sess1.jsonl";

interface BlocksOut {
  blocks: Array<{
    id: string;
    startTime: string;
    endTime: string;
    actualEndTime: string | null;
    isActive: boolean;
    isGap: boolean;
    entries: number;
  }>;
}

function lineAt(timestamp: string, requestId: string): string {
  return JSON.stringify({
    timestamp,
    sessionId: "sess1",
    requestId,
    message: {
      id: `m-${requestId}`,
      model: "claude-haiku-4-5",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  });
}

describe("buildBlocks · R4.0.a cluster-and-gap algorithm (researcher v4 §B.1)", () => {
  it("12h stream with a 6h mid-gap → 2 real blocks + 1 gap block (NOT 3 grid windows)", async () => {
    // Day 1 burst at 08-09 UTC, then 6h silence, then day-1 burst at 15-16 UTC.
    const contents = [
      lineAt("2026-05-25T08:00:00Z", "r1"),
      lineAt("2026-05-25T08:30:00Z", "r2"),
      // (>5h gap)
      lineAt("2026-05-25T15:30:00Z", "r3"),
      lineAt("2026-05-25T16:00:00Z", "r4"),
    ].join("\n");

    const out = await runNative<BlocksOut>("blocks", {
      files: [PROJECT_FILE],
      tz: "UTC",
      now: new Date("2026-05-25T20:00:00Z"), // past both clusters
      fs: { readFileSync: (p) => p === PROJECT_FILE ? contents : "" },
    });

    const real = out.blocks.filter((b) => !b.isGap);
    const gaps = out.blocks.filter((b) => b.isGap);
    expect(real, "expected exactly 2 real blocks (one per cluster)").toHaveLength(2);
    expect(gaps, "expected exactly 1 gap block between the two clusters").toHaveLength(1);

    // First real block anchored at 08:00 UTC (floor-to-hour).
    expect(real[0]!.startTime).toBe("2026-05-25T08:00:00.000Z");
    // Second real block anchored at 15:00 UTC.
    expect(real[1]!.startTime).toBe("2026-05-25T15:00:00.000Z");
    // Gap block starts 5h after the last entry of the first cluster.
    expect(gaps[0]!.startTime).toBe("2026-05-25T13:30:00.000Z");
  });

  it("burst within 5h of cluster-start does NOT trigger a new block", async () => {
    // 4 entries spread across 4.5h — all should land in ONE block.
    const contents = [
      lineAt("2026-05-25T08:00:00Z", "r1"),
      lineAt("2026-05-25T09:30:00Z", "r2"),
      lineAt("2026-05-25T11:00:00Z", "r3"),
      lineAt("2026-05-25T12:25:00Z", "r4"),
    ].join("\n");

    const out = await runNative<BlocksOut>("blocks", {
      files: [PROJECT_FILE],
      tz: "UTC",
      now: new Date("2026-05-25T18:00:00Z"),
      fs: { readFileSync: (p) => p === PROJECT_FILE ? contents : "" },
    });
    const real = out.blocks.filter((b) => !b.isGap);
    expect(real).toHaveLength(1);
    expect(real[0]!.entries).toBe(4);
  });

  it("entry > 5h from cluster START (but <5h from last entry) still triggers new block", async () => {
    // Three entries at +0h, +4h, +6h. The +6h entry is >5h from start
    // (+0h), but <5h from last entry (+4h). Per ccusage: new block.
    const contents = [
      lineAt("2026-05-25T08:00:00Z", "r1"),
      lineAt("2026-05-25T12:00:00Z", "r2"),
      lineAt("2026-05-25T14:30:00Z", "r3"),
    ].join("\n");

    const out = await runNative<BlocksOut>("blocks", {
      files: [PROJECT_FILE],
      tz: "UTC",
      now: new Date("2026-05-25T20:00:00Z"),
      fs: { readFileSync: (p) => p === PROJECT_FILE ? contents : "" },
    });
    const real = out.blocks.filter((b) => !b.isGap);
    const gaps = out.blocks.filter((b) => b.isGap);
    // The +6h entry exceeds cluster-start-window (cluster-start was
    // 08:00, +6.5h = 14:30 > 13:00 boundary) but NOT the last-entry
    // window (12:00 → 14:30 = 2.5h ≤ 5h) → new cluster, NO gap block.
    expect(real).toHaveLength(2);
    expect(gaps).toHaveLength(0);
  });

  it("TZ honor: floors cluster start to LOCAL hour, not UTC hour (closes UTC-anchored half of §B.1)", async () => {
    // 18:30 PDT = 01:30 UTC the next calendar day. Floor in PDT is
    // 18:00 PDT = 01:00 UTC. Floor in UTC is 01:00 UTC. The
    // distinction matters for any TZ where the local hour != UTC hour
    // — assertion below confirms we're using the LOCAL-anchored value.
    const contents = lineAt("2026-05-26T01:30:00Z", "r1");
    const out = await runNative<BlocksOut>("blocks", {
      files: [PROJECT_FILE],
      tz: "America/Los_Angeles",
      now: new Date("2026-05-26T03:00:00Z"),
      fs: { readFileSync: (p) => p === PROJECT_FILE ? contents : "" },
    });
    const real = out.blocks.filter((b) => !b.isGap);
    expect(real).toHaveLength(1);
    // 18:00 PDT 2026-05-25 = 2026-05-26T01:00:00Z. Block starts here.
    expect(real[0]!.startTime).toBe("2026-05-26T01:00:00.000Z");
  });

  it("active block: now-within-window AND last-activity < 5h ago", async () => {
    const now = new Date("2026-05-26T10:00:00Z");
    // Most recent entry 30 min ago (< 5h from now) AND now ∈ [start, start+5h)
    // → active. Block start floors to the hour of the EARLIEST entry, so
    // an entry at 08:00 gives block window [08:00, 13:00).
    const contents = [
      lineAt(new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), "r1"),
      lineAt(new Date(now.getTime() - 30 * 60 * 1000).toISOString(), "r2"),
    ].join("\n");
    const out = await runNative<BlocksOut>("blocks", {
      files: [PROJECT_FILE],
      tz: "UTC",
      now,
      fs: { readFileSync: (p) => p === PROJECT_FILE ? contents : "" },
    });
    const active = out.blocks.find((b) => b.isActive);
    expect(active, "expected an active block when last entry < 5h before now").toBeTruthy();
    expect(active!.actualEndTime, "active block has null actualEndTime").toBeNull();
  });

  it("inactive block: last activity > 5h before now → not active", async () => {
    const now = new Date("2026-05-26T18:00:00Z");
    // Most recent entry 10h ago — outside the active window.
    const contents = lineAt(new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(), "r1");
    const out = await runNative<BlocksOut>("blocks", {
      files: [PROJECT_FILE],
      tz: "UTC",
      now,
      fs: { readFileSync: (p) => p === PROJECT_FILE ? contents : "" },
    });
    expect(out.blocks.filter((b) => b.isActive)).toHaveLength(0);
  });

  it("empty entries: no blocks emitted (preserve pre-R4 invariant)", async () => {
    const out = await runNative<BlocksOut>("blocks", {
      files: [PROJECT_FILE],
      tz: "UTC",
      now: new Date("2026-05-26T10:00:00Z"),
      fs: { readFileSync: () => "" },
    });
    expect(out.blocks).toHaveLength(0);
  });
});
