// M6 / Researcher v2 §C.2 — golden parity gate.
//
// Tolerance contract (Researcher v2 §C.2):
//   - Cost equality to ±$0.00005 (asserted via `toBeCloseTo(_, 4)`,
//     which is exactly that tolerance and FP-precision-aware — strict
//     `round4 ===` would false-positive on 1.357449999… vs 1.3575).
//   - Tokens exact equality (integer arithmetic; no tolerance).
//   - Every model in the oracle's modelBreakdowns must appear in ours;
//     extras allowed in ours. Note: <synthetic>'s tokens roll into the
//     top-level totals but it has no displayModel, so `aggregate()`
//     drops it from per-model rows — that's correct, not a divergence.
//
// This test is *the* M6 cutover gate. Failing it blocks the
// `USAGE_SOURCE=native` flip.

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadJsonlContent } from "../loader";
import { createPricing, _resetPricingWarnings } from "../pricing";
import oracleSynthetic from "../../__fixtures__/native/oracle.synthetic.json";

const FIXTURES_DIR = path.resolve(__dirname, "../../__fixtures__/native");
const SYNTHETIC = path.join(FIXTURES_DIR, "synthetic.jsonl");

beforeEach(() => {
  _resetPricingWarnings();
});

describe("native parser ↔ ccusage golden parity", () => {
  it("synthetic: total cost matches within ±$0.00005; total tokens match exactly", () => {
    const content = fs.readFileSync(SYNTHETIC, "utf8");
    const ours = loadJsonlContent(content, { pricing: createPricing() });
    expect(ours.totals.totalCostUSD).toBeCloseTo(oracleSynthetic.totals.totalCost, 4);
    expect(ours.totals.totalTokens).toBe(oracleSynthetic.totals.totalTokens);
  });

  it("synthetic: token sub-totals (input/output/cache_*) match exactly", () => {
    const content = fs.readFileSync(SYNTHETIC, "utf8");
    const ours = loadJsonlContent(content, { pricing: createPricing() });
    expect(ours.totals.inputTokens).toBe(oracleSynthetic.totals.inputTokens);
    expect(ours.totals.outputTokens).toBe(oracleSynthetic.totals.outputTokens);
    expect(ours.totals.cacheCreationTokens).toBe(oracleSynthetic.totals.cacheCreationTokens);
    expect(ours.totals.cacheReadTokens).toBe(oracleSynthetic.totals.cacheReadTokens);
  });

  it("synthetic: per-model cost rows match within ±$0.00005", () => {
    const content = fs.readFileSync(SYNTHETIC, "utf8");
    const ours = loadJsonlContent(content, { pricing: createPricing() });
    for (const oracleModel of oracleSynthetic.totals.modelBreakdowns) {
      const ourModel = ours.totals.modelBreakdowns.find((m) => m.modelName === oracleModel.modelName);
      expect(ourModel, `expected model '${oracleModel.modelName}' in our breakdowns`).toBeTruthy();
      expect(ourModel!.cost).toBeCloseTo(oracleModel.cost, 4);
    }
  });

  it("synthetic: rejects lines that violate validity rules", () => {
    const content = fs.readFileSync(SYNTHETIC, "utf8");
    const ours = loadJsonlContent(content, { pricing: createPricing() });
    // We expect 10 cooked entries: synthetic + haiku + (haiku-fast winner of
    // dedup) + opus-fast + sonnet-tier + sonnet-cache + unknown + R4.0.b's 3
    // tolerable-null lines (req-10/11/12: isApiErrorMessage:null,
    // cache_creation_input_tokens:null, cache_read_input_tokens:null).
    expect(ours.entries.length).toBe(10);
    // The dedup winner must be the higher-tokens entry (req 'dupe' / id 'd' with 900 tokens).
    const dupeWinners = ours.entries.filter((e) => e.requestId === "dupe");
    expect(dupeWinners.length).toBe(1);
    expect(dupeWinners[0]?.totalTokens).toBe(900);
    expect(dupeWinners[0]?.speed).toBe("fast");
  });

  it("synthetic R4.0.b: tolerable-null lines (isApiErrorMessage/cache_*_input_tokens) are KEPT", () => {
    // Per Researcher v4 §B.2: pre-R4 NULL_FORBIDDEN_FIELDS over-rejected
    // these three fields, dropping ~90% of modern CC lines (which write
    // them as `null` when zero). R4.0.b removed them from the forbidden
    // list; downstream `?? 0` / `=== true` coercion already handles the
    // nulls cleanly. Lines 12/13/14 of synthetic.jsonl are the canary.
    const content = fs.readFileSync(SYNTHETIC, "utf8");
    const ours = loadJsonlContent(content, { pricing: createPricing() });
    const toleratedReqIds = ["req-10", "req-11", "req-12"];
    for (const reqId of toleratedReqIds) {
      const e = ours.entries.find((x) => x.requestId === reqId);
      expect(e, `req ${reqId} should be KEPT despite tolerable-null field`).toBeTruthy();
      expect(e!.totalTokens).toBe(1500); // 1000 input + 500 output
    }
  });

  it("synthetic: <synthetic> model is dropped from breakdown but tokens still count", () => {
    const content = fs.readFileSync(SYNTHETIC, "utf8");
    const ours = loadJsonlContent(content, { pricing: createPricing() });
    // No "<synthetic>" string anywhere in the model list.
    const names = ours.totals.modelBreakdowns.map((m) => m.modelName);
    expect(names).not.toContain("<synthetic>");
    // But the 1500 synthetic tokens (1000 input + 500 output) ARE in the totals.
    expect(ours.totals.totalTokens).toBeGreaterThanOrEqual(1500);
  });

  it("synthetic: unknown model name yields cost = 0 and a console.warn", () => {
    const warns: string[] = [];
    const content = fs.readFileSync(SYNTHETIC, "utf8");
    const ours = loadJsonlContent(content, {
      pricing: createPricing(undefined, (m) => warns.push(m)),
    });
    const unknown = ours.totals.modelBreakdowns.find((m) => m.modelName === "unknown-future-model-xyz");
    expect(unknown?.cost).toBe(0);
    expect(warns.some((w) => w.includes("unknown-future-model-xyz"))).toBe(true);
  });
});
