import { describe, it, expect, beforeEach } from "vitest";
import { createPricing, _resetPricingWarnings } from "../pricing";
import { PRICING_TABLE } from "../pricing-data";

beforeEach(() => _resetPricingWarnings());

describe("createPricing.find — built-in table", () => {
  const p = createPricing();
  it("returns the exact row when the key matches", () => {
    // Stored as `5 * M` where M = 1/1_000_000; that multiplication carries
    // ~1ulp of FP error vs the literal `5e-6`, so use toBeCloseTo.
    // R4.10 — opus-4-7 carries post-Nov reduced input rate (was 15e-6 pre-R4.10).
    expect(p.find("claude-opus-4-7")?.input).toBeCloseTo(5e-6, 9);
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

  // R4.10 — pin Anthropic's post-2026-11 Opus 4.5 price reduction.
  // Pre-R4.10 we had `opus-4-5-20251101` priced identically to
  // `claude-opus-4-5` (15/75/18.75/1.5 per M); ccusage's LiteLLM
  // snapshot has it at exactly 1/3 (5/25/6.25/0.5). Pinning the new
  // rates here so any future pricing-data hand-merge that accidentally
  // reverts the SHA loses this test red.
  it("R4.10: claude-opus-4-5-20251101 carries post-Nov reduced rates (1/3 of pre-Nov)", () => {
    const row = p.find("claude-opus-4-5-20251101");
    expect(row).toBeTruthy();
    expect(row!.input).toBeCloseTo(5e-6, 9);
    expect(row!.output).toBeCloseTo(25e-6, 9);
    expect(row!.cache_create).toBeCloseTo(6.25e-6, 9);
    expect(row!.cache_read).toBeCloseTo(0.5e-6, 9);
    // Sanity: the SHA-less `claude-opus-4-5` still carries pre-Nov rates
    // for entries that don't pin the SHA — preserves apples-to-apples
    // with ccusage's own by-SHA lookup.
    const preNov = p.find("claude-opus-4-5");
    expect(preNov!.input).toBeCloseTo(15e-6, 9);
  });

  // R4.10 — Opus 4.6 / 4.7 inherit the same post-Nov 1/3 reduction
  // (empirically `claude-opus-4-7` aggregate cost was 3.00× ccusage's
  // pre-fix). fast_multiplier 6.0 preserved on both (priority-tier
  // amplifier is independent of the per-unit price cut).
  it("R4.10: opus-4-6 / opus-4-7 inherit post-Nov reduced rates + preserve fast_multiplier=6.0", () => {
    for (const model of ["claude-opus-4-6", "claude-opus-4-7"]) {
      const row = p.find(model);
      expect(row, `expected ${model} in pricing table`).toBeTruthy();
      expect(row!.input).toBeCloseTo(5e-6, 9);
      expect(row!.output).toBeCloseTo(25e-6, 9);
      expect(row!.cache_create).toBeCloseTo(6.25e-6, 9);
      expect(row!.cache_read).toBeCloseTo(0.5e-6, 9);
      expect(row!.fast_multiplier).toBe(6.0);
    }
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
