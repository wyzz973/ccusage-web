// M6.c real-data parity smoke gate (Researcher v3 §B).
//
// Sister to `native-parity.golden.test.ts` (the synthetic-fixture gate).
// This file is **always skipped** unless `RUN_REAL_PARITY=1` is set —
// no noise in default `npm test`. When enabled:
//   1. Discovers real Claude Code data via production `discoverJsonlFiles()`
//      (honors CLAUDE_CONFIG_DIR / XDG_CONFIG_HOME / ~/.claude).
//   2. Skips with a clear log if discovery yields nothing.
//   3. Runs native via `runNative(...)` and ccusage via `runCcusage(...)
//      --mode calculate` in parallel.
//   4. Compares totals + per-model + token + block-count within the
//      §B.3 tolerance bands.
//
// **Critical detail**: oracle invocation uses `--mode calculate`, NOT
// ccusage's binary default `--mode auto`. R2's S-R2-2 drift was caused
// by R2's hidden mistake of comparing native-implicit-calculate against
// ccusage-default-auto. Apples-to-apples means same mode on both sides.
//
// Mirrors `Researcher v3 §B.4`'s assertion shape.

import { describe, it, expect } from "vitest";
import { runNative } from "../runner";
import { runCcusage } from "../../ccusage-runner";
import { discoverJsonlFiles } from "../paths";
import type { UsageRecord, Block, ModelBreakdown } from "../../types";

const RUN = process.env.RUN_REAL_PARITY === "1";
const TZ = process.env.TZ ?? "UTC";
const CCUSAGE_BIN = process.env.CCUSAGE_BIN ?? "ccusage";

// §B.3 — tolerance bands. The "OR larger window" pattern absorbs
// small-absolute-value flakes (e.g. a $0.30 daily total looking 30 %
// off because of one off-by-one dedup tiebreak).
function withinBand(actual: number, expected: number, relPct: number, absFloor: number): boolean {
  const drift = Math.abs(actual - expected);
  if (drift <= absFloor) return true;
  const denom = Math.max(Math.abs(expected), 0.01);
  return (drift / denom) <= relPct;
}

describe.skipIf(!RUN)("native vs ccusage --mode calculate · real ~/.claude parity (M6.c smoke)", () => {
  const files = RUN ? discoverJsonlFiles() : [];

  it.skipIf(files.length === 0)("monthly totals match within ±2 % OR ±$0.50", async () => {
    const [native, oracle] = await Promise.all([
      runNative<{ monthly: UsageRecord[] }>("monthly", { tz: TZ, mode: "calculate" }),
      runCcusage<{ monthly: UsageRecord[] }>("monthly", {
        bin: CCUSAGE_BIN, timeoutMs: 60_000,
        extraArgs: ["--mode", "calculate", "--timezone", TZ],
      }),
    ]);
    for (const ccRow of oracle.monthly) {
      const nRow = native.monthly.find((r) => r.period === ccRow.period);
      expect(nRow, `missing native row for ${ccRow.period}`).toBeDefined();
      expect(
        withinBand(nRow!.totalCost, ccRow.totalCost, 0.02, 0.50),
        `month ${ccRow.period}: native=$${nRow!.totalCost.toFixed(2)} cc=$${ccRow.totalCost.toFixed(2)}`,
      ).toBe(true);
    }
  }, 60_000);

  it.skipIf(files.length === 0)("daily totals match within ±2 % OR ±$0.50", async () => {
    const [native, oracle] = await Promise.all([
      runNative<{ daily: UsageRecord[] }>("daily", { tz: TZ, mode: "calculate" }),
      runCcusage<{ daily: UsageRecord[] }>("daily", {
        bin: CCUSAGE_BIN, timeoutMs: 60_000,
        extraArgs: ["--mode", "calculate", "--timezone", TZ],
      }),
    ]);
    for (const ccRow of oracle.daily) {
      const nRow = native.daily.find((r) => r.period === ccRow.period);
      expect(nRow, `missing native row for ${ccRow.period}`).toBeDefined();
      expect(
        withinBand(nRow!.totalCost, ccRow.totalCost, 0.02, 0.50),
        `day ${ccRow.period}: native=$${nRow!.totalCost.toFixed(4)} cc=$${ccRow.totalCost.toFixed(4)}`,
      ).toBe(true);
    }
  }, 60_000);

  it.skipIf(files.length === 0)("per-model rows match within ±2 % OR ±$0.10", async () => {
    const [native, oracle] = await Promise.all([
      runNative<{ monthly: UsageRecord[] }>("monthly", { tz: TZ, mode: "calculate" }),
      runCcusage<{ monthly: UsageRecord[] }>("monthly", {
        bin: CCUSAGE_BIN, timeoutMs: 60_000,
        extraArgs: ["--mode", "calculate", "--timezone", TZ],
      }),
    ]);
    for (const ccRow of oracle.monthly) {
      const nRow = native.monthly.find((r) => r.period === ccRow.period);
      if (!nRow) continue;
      for (const oModel of ccRow.modelBreakdowns ?? []) {
        const ourModel = (nRow.modelBreakdowns ?? []).find((m: ModelBreakdown) => m.modelName === oModel.modelName);
        if (!ourModel) continue; // skip rows native doesn't recognize (unknown-model -> cost 0; tracked separately)
        expect(
          withinBand(ourModel.cost, oModel.cost, 0.02, 0.10),
          `${ccRow.period}/${oModel.modelName}: native=$${ourModel.cost.toFixed(4)} cc=$${oModel.cost.toFixed(4)}`,
        ).toBe(true);
      }
    }
  }, 60_000);

  it.skipIf(files.length === 0)("token totals match within ±0.1 % OR ±100 tokens", async () => {
    const [native, oracle] = await Promise.all([
      runNative<{ monthly: UsageRecord[] }>("monthly", { tz: TZ, mode: "calculate" }),
      runCcusage<{ monthly: UsageRecord[] }>("monthly", {
        bin: CCUSAGE_BIN, timeoutMs: 60_000,
        extraArgs: ["--mode", "calculate", "--timezone", TZ],
      }),
    ]);
    for (const ccRow of oracle.monthly) {
      const nRow = native.monthly.find((r) => r.period === ccRow.period);
      if (!nRow) continue;
      expect(
        withinBand(nRow.totalTokens, ccRow.totalTokens, 0.001, 100),
        `tokens ${ccRow.period}: native=${nRow.totalTokens} cc=${ccRow.totalTokens}`,
      ).toBe(true);
    }
  }, 60_000);

  it.skipIf(files.length === 0)("block count matches within ±5 % OR ±2 blocks", async () => {
    const [native, oracle] = await Promise.all([
      runNative<{ blocks: Block[] }>("blocks", { tz: TZ, mode: "calculate" }),
      runCcusage<{ blocks: Block[] }>("blocks", {
        bin: CCUSAGE_BIN, timeoutMs: 60_000,
        extraArgs: ["--mode", "calculate", "--timezone", TZ],
      }),
    ]);
    const nCount = native.blocks.length;
    const cCount = oracle.blocks.length;
    expect(
      withinBand(nCount, cCount, 0.05, 2),
      `block count: native=${nCount} cc=${cCount}`,
    ).toBe(true);
  }, 60_000);

  if (RUN && files.length === 0) {
    // Print once at file-collection time when RUN is set but discovery
    // yielded nothing — keeps the dev-local repro friendly without a
    // mid-test surprise.
    // eslint-disable-next-line no-console
    console.log(
      "📦 native-real-parity.smoke: RUN_REAL_PARITY=1 set but discoverJsonlFiles() returned []. " +
      "Set CLAUDE_CONFIG_DIR or run from a host with ~/.claude/projects/.",
    );
  }
});

// Always-on guard so the test file isn't "empty" when RUN is unset — keeps
// vitest's file-collection output consistent across modes.
describe("native-real-parity.smoke file is wired", () => {
  it("is gated by RUN_REAL_PARITY=1 (skipped by default in CI)", () => {
    expect(typeof RUN).toBe("boolean");
  });
});
