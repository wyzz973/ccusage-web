import { describe, it, expect } from "vitest";
import { computeLimitResetInsight } from "../limit-reset";
import type { Block } from "../../types";

function block(partial: Partial<Block> = {}): Block {
  return {
    id: "b1",
    startTime: "2026-05-25T10:00:00Z",
    endTime:   "2026-05-25T15:00:00Z",
    actualEndTime: null,
    isActive: true, isGap: false,
    costUSD: 5, totalTokens: 1000, entries: 10,
    models: ["opus"],
    burnRate: { costPerHour: 1, tokensPerMinute: 10, tokensPerMinuteForIndicator: 10 },
    projection: { remainingMinutes: 20, totalCost: 10, totalTokens: 2000 },
    tokenCounts: { inputTokens: 100, outputTokens: 100, cacheCreationInputTokens: 100, cacheReadInputTokens: 100 },
    ...partial,
  };
}

describe("computeLimitResetInsight", () => {
  it("inactive when no active block", () => {
    const out = computeLimitResetInsight({ activeBlock: null, now: new Date() });
    expect(out.active).toBe(false);
    expect(out.source).toBeNull();
  });

  it("inactive when block has no projection", () => {
    const out = computeLimitResetInsight({
      activeBlock: block({ projection: null }),
      now: new Date("2026-05-25T14:40:00Z"),
    });
    expect(out.active).toBe(false);
  });

  it("inactive when reset is more than 30 min away", () => {
    const out = computeLimitResetInsight({
      activeBlock: block(),
      now: new Date("2026-05-25T13:00:00Z"), // 2h before block end
    });
    expect(out.active).toBe(false);
  });

  it("active (heuristic source) when within 30 min of block end", () => {
    const out = computeLimitResetInsight({
      activeBlock: block(),
      now: new Date("2026-05-25T14:40:00Z"), // 20 min before end
    });
    expect(out.active).toBe(true);
    expect(out.source).toBe("heuristic");
    expect(out.minutesUntilReset).toBe(20);
    expect(out.resetAt).toBe("2026-05-25T15:00:00.000Z");
  });

  it("active (upstream source) when block carries a usageLimitResetAt", () => {
    const b = block();
    (b as unknown as { usageLimitResetAt: string }).usageLimitResetAt = "2026-05-25T16:00:00Z";
    const out = computeLimitResetInsight({
      activeBlock: b,
      now: new Date("2026-05-25T15:30:00Z"),
    });
    expect(out.active).toBe(true);
    expect(out.source).toBe("upstream");
    expect(out.minutesUntilReset).toBe(30);
  });

  it("ignores upstream timestamp that is in the past", () => {
    const b = block();
    (b as unknown as { usageLimitResetAt: string }).usageLimitResetAt = "2026-05-25T10:00:00Z";
    const out = computeLimitResetInsight({
      activeBlock: b,
      now: new Date("2026-05-25T14:40:00Z"),
    });
    // Falls back to heuristic since upstream is bogus.
    expect(out.active).toBe(true);
    expect(out.source).toBe("heuristic");
  });
});
