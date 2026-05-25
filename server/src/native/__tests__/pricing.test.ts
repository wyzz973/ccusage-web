import { describe, it, expect, beforeEach } from "vitest";
import { createPricing, _resetPricingWarnings } from "../pricing";
import { PRICING_TABLE } from "../pricing-data";

beforeEach(() => _resetPricingWarnings());

describe("createPricing.find — built-in table", () => {
  const p = createPricing();
  it("returns the exact row when the key matches", () => {
    // Stored as `15 * M` where M = 1/1_000_000; that multiplication carries
    // ~1ulp of FP error vs the literal `15e-6`, so use toBeCloseTo.
    expect(p.find("claude-opus-4-7")?.input).toBeCloseTo(15e-6, 9);
    expect(p.find("claude-sonnet-4")?.input_above_200k!).toBeCloseTo(6e-6, 9);
  });
  it("returns null + warns on unknown model", () => {
    const warns: string[] = [];
    const local = createPricing(undefined, (m) => warns.push(m));
    expect(local.find("no-such-model")).toBeNull();
    expect(warns.length).toBe(1);
    // Warning is memoized per process.
    expect(local.find("no-such-model")).toBeNull();
    expect(warns.length).toBe(1);
  });
  it("returns null for empty input", () => {
    expect(p.find("")).toBeNull();
  });
});

describe("createPricing.find — fuzzy fallback", () => {
  it("picks the longest matching key when no exact match exists", () => {
    const table = {
      "claude": { input: 1, output: 1, cache_create: 0, cache_read: 0, cache_read_explicit: false, input_above_200k: null, output_above_200k: null, cache_create_above_200k: null, cache_read_above_200k: null, fast_multiplier: 1 } as const,
      "claude-sonnet": { input: 2, output: 2, cache_create: 0, cache_read: 0, cache_read_explicit: false, input_above_200k: null, output_above_200k: null, cache_create_above_200k: null, cache_read_above_200k: null, fast_multiplier: 1 } as const,
    };
    const p = createPricing(table as Record<string, typeof table["claude"]>);
    // model name contains both "claude" and "claude-sonnet"; longest wins.
    expect(p.find("claude-sonnet-4")?.input).toBe(2);
  });

  it("matches when the model name is a substring of a key", () => {
    const table = {
      "claude-haiku-4-5-20251001": PRICING_TABLE["claude-haiku-4-5-20251001"]!,
    };
    const p = createPricing(table);
    // model name "haiku-4-5" is contained in the dated key.
    expect(p.find("haiku-4-5")?.input).toBe(1e-6);
  });
});
