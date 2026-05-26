// R3.13 — usage_limit_reset_time upstream wire-through.
//
// Covers AC5 from PRD v3 §1 R3.13:
//   (a) field present → populated
//   (b) field absent → null
//   (c) field present-but-null → null
//   (d) field present-but-malformed → null + console.warn
//
// Plus integration with `buildBlocks` (via the public runNative path)
// and the `computeLimitResetInsight` consumer reading the new field.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseLine } from "../parser";
import { runNative } from "../index";
import { computeLimitResetInsight } from "../../insights/limit-reset";
import type { Block } from "../../types";
import type { PricingFinder } from "../pricing";

// Pricing stub: returns null so cost calc short-circuits to 0. The
// R3.13 tests don't care about cost — they care about the limit-reset
// field threading from raw JSON → CookedEntry → Block.
const pricingStub: PricingFinder = { find: () => null };

function rawLine(extra: Record<string, unknown>): string {
  return JSON.stringify({
    timestamp: "2026-05-26T10:00:00Z",
    cwd: "/tmp/test",
    sessionId: "s1",
    requestId: "r1",
    message: {
      id: "m1",
      model: "claude-opus-4",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
    ...extra,
  });
}

describe("R3.13 — parser handles usage_limit_reset_time", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined); });
  afterEach(() => { warnSpy.mockRestore(); });

  it("(a) field present + valid → cooked entry carries normalized ISO timestamp", () => {
    const ts = "2026-05-26T11:30:00.000Z";
    const out = parseLine(rawLine({ usage_limit_reset_time: ts }), pricingStub);
    expect(out).not.toBeNull();
    expect(out!.usageLimitResetTime).toBe(ts);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("(b) field absent → cooked entry has undefined", () => {
    const out = parseLine(rawLine({}), pricingStub);
    expect(out).not.toBeNull();
    expect(out!.usageLimitResetTime).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("(c) field present-but-null → cooked entry has null", () => {
    const out = parseLine(rawLine({ usage_limit_reset_time: null }), pricingStub);
    expect(out).not.toBeNull();
    expect(out!.usageLimitResetTime).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("(d) field present-but-malformed → null + console.warn", () => {
    const out = parseLine(rawLine({ usage_limit_reset_time: "not-a-timestamp" }), pricingStub);
    expect(out).not.toBeNull();
    expect(out!.usageLimitResetTime).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toMatch(/malformed usage_limit_reset_time/);
  });

  it("normalizes timezone-offset timestamps to UTC ISO format", () => {
    const out = parseLine(rawLine({ usage_limit_reset_time: "2026-05-26T13:30:00+02:00" }), pricingStub);
    expect(out!.usageLimitResetTime).toBe("2026-05-26T11:30:00.000Z");
  });
});

describe("R3.13 — buildBlocks stamps usageLimitResetTime on Block (via runNative)", () => {
  // Use runNative's `files` + `fs` injection (no real disk fixtures) so
  // the test is hermetic. Note: runNative pegs "now" if passed —
  // important because the block's window inclusion depends on it.

  const PROJECT = "/tmp/projects/-tmp-test-app";

  it("propagates the latest non-null limit-reset stamp from the window", async () => {
    const now = new Date("2026-05-26T10:30:00Z");
    const blockStart = new Date(now.getTime() - 30 * 60_000);
    const reset1 = new Date(now.getTime() + 25 * 60_000).toISOString();
    const reset2 = new Date(now.getTime() + 35 * 60_000).toISOString();

    const file = `${PROJECT}/sess1.jsonl`;
    const contents = [
      rawLine({
        timestamp: new Date(blockStart.getTime() + 1_000).toISOString(),
        usage_limit_reset_time: reset1,
        sessionId: "sess1", requestId: "r1", message: { id: "m1", model: "claude-opus-4", usage: { input_tokens: 10, output_tokens: 5 } },
      }),
      rawLine({
        timestamp: new Date(blockStart.getTime() + 2_000).toISOString(),
        usage_limit_reset_time: reset2,
        sessionId: "sess1", requestId: "r2", message: { id: "m2", model: "claude-opus-4", usage: { input_tokens: 20, output_tokens: 10 } },
      }),
    ].join("\n");

    const out = await runNative<{ blocks: Block[] }>("blocks", {
      files: [file],
      now,
      pricing: pricingStub,
      fs: { readFileSync: (p) => p === file ? contents : "" },
    });
    const active = out.blocks.find((b) => b.isActive);
    expect(active, "expected an active block from the recent fixture").toBeTruthy();
    expect(active!.usageLimitResetTime).toBe(reset2);
  });

  it("emits null when no entries in the window carry the field", async () => {
    const now = new Date("2026-05-26T10:30:00Z");
    const file = `${PROJECT}/sess2.jsonl`;
    const contents = rawLine({
      timestamp: new Date(now.getTime() - 5 * 60_000).toISOString(),
      sessionId: "sess2", requestId: "r1", message: { id: "m1", model: "claude-opus-4", usage: { input_tokens: 10, output_tokens: 5 } },
    });

    const out = await runNative<{ blocks: Block[] }>("blocks", {
      files: [file],
      now,
      pricing: pricingStub,
      fs: { readFileSync: (p) => p === file ? contents : "" },
    });
    const active = out.blocks.find((b) => b.isActive);
    expect(active, "expected an active block from the recent fixture").toBeTruthy();
    expect(active!.usageLimitResetTime).toBeNull();
  });
});

describe("R3.13 — computeLimitResetInsight reads upstream field", () => {
  it("upstream field present → source='upstream', resetAt matches", () => {
    const now = new Date("2026-05-26T10:00:00Z");
    const resetAt = "2026-05-26T11:30:00.000Z";
    const block: Block = {
      id: "b1",
      startTime: "2026-05-26T08:00:00Z",
      endTime:   "2026-05-26T13:00:00Z",
      actualEndTime: null, isActive: true, isGap: false,
      costUSD: 0, totalTokens: 0, entries: 0,
      models: [],
      burnRate: null,
      projection: { remainingMinutes: 180, totalCost: 0, totalTokens: 0 },
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      usageLimitResetTime: resetAt,
    };
    const out = computeLimitResetInsight({ activeBlock: block, now });
    expect(out.active).toBe(true);
    expect(out.source).toBe("upstream");
    expect(out.resetAt).toBe(resetAt);
    expect(out.minutesUntilReset).toBe(90);
  });

  it("upstream field null → falls through to heuristic", () => {
    const now = new Date("2026-05-26T10:00:00Z");
    const block: Block = {
      id: "b1",
      startTime: "2026-05-26T08:00:00Z",
      endTime:   "2026-05-26T10:20:00Z", // 20 min away → heuristic fires
      actualEndTime: null, isActive: true, isGap: false,
      costUSD: 0, totalTokens: 0, entries: 0,
      models: [],
      burnRate: null,
      projection: { remainingMinutes: 20, totalCost: 0, totalTokens: 0 },
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      usageLimitResetTime: null,
    };
    const out = computeLimitResetInsight({ activeBlock: block, now });
    expect(out.source).toBe("heuristic");
  });
});
