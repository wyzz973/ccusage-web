import { describe, it, expect } from "vitest";
import { calculateCost, tiered } from "../cost";
import { createPricing } from "../pricing";

const pricing = createPricing();

describe("tiered", () => {
  it("returns 0 for non-positive tokens", () => {
    expect(tiered(0, 1, 2)).toBe(0);
    expect(tiered(-10, 1, 2)).toBe(0);
  });

  it("uses base rate below threshold", () => {
    expect(tiered(100, 0.001, 0.002)).toBeCloseTo(0.1, 10);
  });

  it("applies above-200k rate to tokens over the threshold", () => {
    // 250_000 tokens, base 3e-6, above 6e-6
    expect(tiered(250_000, 3e-6, 6e-6)).toBeCloseTo(0.9, 6);
  });

  it("uses base rate when above is null/undefined regardless of tokens", () => {
    expect(tiered(300_000, 1e-6, null)).toBeCloseTo(0.3, 6);
    expect(tiered(300_000, 1e-6, undefined)).toBeCloseTo(0.3, 6);
  });
});

describe("calculateCost", () => {
  it("returns 0 for missing/unknown model", () => {
    expect(calculateCost(undefined, { input_tokens: 1000, output_tokens: 500 }, pricing)).toBe(0);
  });

  it("computes haiku-4-5 cost", () => {
    // 1000 * 1e-6 + 500 * 5e-6 = 0.001 + 0.0025 = 0.0035
    const c = calculateCost("claude-haiku-4-5", { input_tokens: 1000, output_tokens: 500 }, pricing);
    expect(c).toBeCloseTo(0.0035, 6);
  });

  it("applies fast_multiplier when speed='fast' (opus-4-7 = 6×)", () => {
    const c = calculateCost("claude-opus-4-7", { input_tokens: 1000, output_tokens: 500, speed: "fast" }, pricing);
    // R4.10 — post-Nov rates: (1000 * 5e-6 + 500 * 25e-6) * 6 = 0.0175 * 6 = 0.105
    expect(c).toBeCloseTo(0.105, 4);
  });

  it("does NOT apply fast_multiplier when haiku-4-5 fast_multiplier is 1.0", () => {
    const slow = calculateCost("claude-haiku-4-5", { input_tokens: 1000, output_tokens: 500 }, pricing);
    const fast = calculateCost("claude-haiku-4-5", { input_tokens: 1000, output_tokens: 500, speed: "fast" }, pricing);
    expect(fast).toBeCloseTo(slow, 6);
  });

  it("handles cache_create + cache_read tokens", () => {
    const c = calculateCost(
      "claude-sonnet-4",
      { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000 },
      pricing,
    );
    // 1000 * 3.75e-6 + 2000 * 0.3e-6 = 0.00375 + 0.0006 = 0.00435
    expect(c).toBeCloseTo(0.00435, 6);
  });
});
