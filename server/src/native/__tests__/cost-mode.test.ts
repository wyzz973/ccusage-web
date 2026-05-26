// S-R2-2 unit pins (Researcher v3 §D.2 — mode mismatch root cause).
//
// Before R3, `LoadOptions.mode` was accepted but never honored — the
// loader always emitted `calculate` semantics. That produced the
// observed +119–224 % drift vs ccusage's default `--mode auto` in R2's
// reviewer measurement. R3 honors the parameter; these tests pin that
// the three modes really differ now.

import { describe, it, expect } from "vitest";
import { loadJsonlContent } from "../loader";
import { createPricing } from "../pricing";

const pricing = createPricing();

// One line carrying a `costUSD` of 99.99 (deliberately divergent from
// what `calculate` would produce for the same tokens). Lets us tell the
// modes apart at a glance.
function line({ withCost = true, value = 99.99 }: { withCost?: boolean; value?: number | null } = {}): string {
  const base = {
    timestamp: "2026-05-25T10:00:00Z",
    version: "1.0.0",
    sessionId: "s1", requestId: "r1",
    message: {
      id: "m1",
      model: "claude-haiku-4-5", // recompute ≈ 1000*1e-6 + 500*5e-6 = 0.0035
      usage: { input_tokens: 1000, output_tokens: 500 },
    },
  };
  return JSON.stringify(withCost ? { ...base, costUSD: value } : base);
}

describe("loadJsonlContent honors LoadOptions.mode (S-R2-2 fix)", () => {
  it("`calculate` (default) always recomputes — ignores rawCostUSD", () => {
    const out = loadJsonlContent(line({ value: 99.99 }), { pricing });
    expect(out.entries[0]?.costUSD).toBeCloseTo(0.0035, 4);
    expect(out.totals.totalCostUSD).toBeCloseTo(0.0035, 4);
  });

  it("`display` always uses rawCostUSD — bypasses recompute", () => {
    const out = loadJsonlContent(line({ value: 99.99 }), { pricing, mode: "display" });
    expect(out.entries[0]?.costUSD).toBe(99.99);
    expect(out.totals.totalCostUSD).toBe(99.99);
  });

  it("`display` treats null rawCostUSD as 0", () => {
    const out = loadJsonlContent(line({ value: null }), { pricing, mode: "display" });
    expect(out.entries[0]?.costUSD).toBe(0);
  });

  it("`display` treats absent rawCostUSD as 0", () => {
    const out = loadJsonlContent(line({ withCost: false }), { pricing, mode: "display" });
    expect(out.entries[0]?.costUSD).toBe(0);
  });

  it("`auto` prefers raw when finite", () => {
    const out = loadJsonlContent(line({ value: 42 }), { pricing, mode: "auto" });
    expect(out.entries[0]?.costUSD).toBe(42);
  });

  it("`auto` falls back to recompute when raw is null", () => {
    const out = loadJsonlContent(line({ value: null }), { pricing, mode: "auto" });
    expect(out.entries[0]?.costUSD).toBeCloseTo(0.0035, 4);
  });

  it("`auto` falls back to recompute when raw is absent", () => {
    const out = loadJsonlContent(line({ withCost: false }), { pricing, mode: "auto" });
    expect(out.entries[0]?.costUSD).toBeCloseTo(0.0035, 4);
  });

  // The whole structural drift Reviewer measured at +119–224 %: ccusage
  // default `auto` returning a smaller number than native implicit
  // `calculate`. Pin that the gap disappears at matching modes.
  it("apples-to-apples: `calculate` and `auto-with-no-rawCostUSD` agree (R3 §D.2 closure)", () => {
    const calc = loadJsonlContent(line({ withCost: false }), { pricing, mode: "calculate" });
    const auto = loadJsonlContent(line({ withCost: false }), { pricing, mode: "auto" });
    expect(calc.entries[0]?.costUSD).toBe(auto.entries[0]?.costUSD);
  });

  it("modes never mutate rawCostUSD (preserved verbatim on the cooked entry)", () => {
    for (const mode of ["calculate", "display", "auto"] as const) {
      const out = loadJsonlContent(line({ value: 42 }), { pricing, mode });
      expect(out.entries[0]?.rawCostUSD).toBe(42);
    }
  });
});
