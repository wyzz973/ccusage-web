import { describe, it, expect } from "vitest";
import { parseLine, dedupEntries, hasUsageBlock, hasUnsupportedNullField } from "../parser";
import { createPricing } from "../pricing";

const pricing = createPricing();

function basicLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: "2026-05-01T10:00:00Z",
    version: "1.0.0",
    sessionId: "s1",
    requestId: "r1",
    message: { id: "m1", model: "claude-haiku-4-5", usage: { input_tokens: 1000, output_tokens: 500 } },
    ...overrides,
  });
}

describe("hasUsageBlock", () => {
  it("matches both `{` and ` {` after usage", () => {
    expect(hasUsageBlock('{"usage":{"input_tokens":0}}')).toBe(true);
    expect(hasUsageBlock('{"usage": {"input_tokens":0}}')).toBe(true);
    expect(hasUsageBlock('{"foo":"bar"}')).toBe(false);
  });
});

describe("hasUnsupportedNullField", () => {
  it("rejects only the forbidden-null fields", () => {
    expect(hasUnsupportedNullField('{"id":null}')).toBe(true);
    expect(hasUnsupportedNullField('{"version":null}')).toBe(true);
    expect(hasUnsupportedNullField('{"costUSD":null}')).toBe(false); // explicitly allowed
  });
});

describe("parseLine validation", () => {
  it("rejects lines without a usage block", () => {
    expect(parseLine('{"foo":"bar"}', pricing)).toBeNull();
  });

  it("rejects invalid version", () => {
    expect(parseLine(basicLine({ version: "dev" }), pricing)).toBeNull();
    expect(parseLine(basicLine({ version: 42 }), pricing)).toBeNull();
  });

  it("rejects empty sessionId / requestId / message.id / message.model", () => {
    expect(parseLine(basicLine({ sessionId: "" }), pricing)).toBeNull();
    expect(parseLine(basicLine({ requestId: "" }), pricing)).toBeNull();
    expect(parseLine(basicLine({ message: { id: "", model: "claude-haiku-4-5", usage: { input_tokens: 1, output_tokens: 1 } } }), pricing)).toBeNull();
    expect(parseLine(basicLine({ message: { id: "x", model: "", usage: { input_tokens: 1, output_tokens: 1 } } }), pricing)).toBeNull();
  });

  it("rejects non-RFC3339 timestamps", () => {
    expect(parseLine(basicLine({ timestamp: "not-a-date" }), pricing)).toBeNull();
    expect(parseLine(basicLine({ timestamp: "2026-05-01" }), pricing)).toBeNull();
  });

  it("accepts costUSD: null (explicit allowed)", () => {
    const e = parseLine(basicLine({ costUSD: null }), pricing);
    expect(e).not.toBeNull();
  });

  it("drops <synthetic> from displayModel but still computes tokens", () => {
    const e = parseLine(basicLine({ message: { id: "m", model: "<synthetic>", usage: { input_tokens: 100, output_tokens: 50 } } }), pricing);
    expect(e).not.toBeNull();
    expect(e!.displayModel).toBeUndefined();
    expect(e!.rawModel).toBeUndefined();
    expect(e!.totalTokens).toBe(150);
    expect(e!.costUSD).toBe(0); // synthetic gets cost=0 even if model name resolved
  });

  it("suffixes -fast on displayModel when usage.speed === 'fast'", () => {
    const e = parseLine(basicLine({ message: { id: "m", model: "claude-opus-4-7", usage: { input_tokens: 100, output_tokens: 50, speed: "fast" } } }), pricing);
    expect(e!.displayModel).toBe("claude-opus-4-7-fast");
    expect(e!.rawModel).toBe("claude-opus-4-7");
    expect(e!.speed).toBe("fast");
  });

  it("applies fast_multiplier to fast-tier entries", () => {
    // opus-4-7 fast_multiplier = 6.0; input 1000 * 15e-6 + output 500 * 75e-6 = 0.0525; * 6 = 0.315
    const e = parseLine(basicLine({ message: { id: "m", model: "claude-opus-4-7", usage: { input_tokens: 1000, output_tokens: 500, speed: "fast" } } }), pricing);
    expect(e!.costUSD).toBeCloseTo(0.315, 4);
  });
});

describe("dedupEntries", () => {
  it("collapses duplicates by (messageId, requestId), higher-tokens wins", () => {
    const slow = parseLine(basicLine({ message: { id: "d", model: "claude-haiku-4-5", usage: { input_tokens: 500, output_tokens: 250 } }, requestId: "dupe" }), pricing)!;
    const fast = parseLine(basicLine({ message: { id: "d", model: "claude-haiku-4-5", usage: { input_tokens: 600, output_tokens: 300, speed: "fast" } }, requestId: "dupe" }), pricing)!;
    const out = dedupEntries([slow, fast]);
    expect(out).toHaveLength(1);
    expect(out[0]?.totalTokens).toBe(900);
    expect(out[0]?.speed).toBe("fast");
  });

  it("does not dedup entries missing either key", () => {
    const a = parseLine(basicLine({ requestId: "", message: { id: "x", model: "claude-haiku-4-5", usage: { input_tokens: 1, output_tokens: 1 } } }), pricing); // will be null b/c empty requestId
    const b = parseLine(basicLine({ requestId: "rb" }), pricing)!;
    expect(a).toBeNull();
    const out = dedupEntries([b]);
    expect(out).toHaveLength(1);
  });
});
