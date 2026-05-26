// M6.c real-data parity smoke gate (Researcher v3 §B + R4.0.c).
//
// Sister to `native-parity.golden.test.ts` (the synthetic-fixture gate).
// This file is **always skipped** unless `RUN_REAL_PARITY=1` is set —
// no noise in default `npm test`. When enabled:
//   1. Discovers real Claude Code data via production `discoverJsonlFiles()`
//      (honors CLAUDE_CONFIG_DIR / XDG_CONFIG_HOME / ~/.claude).
//   2. Skips with a clear log if discovery yields nothing.
//   3. Runs native via `runNative(...)` and ccusage via
//      **`ccusage claude <cmd>`** (R4.0.c — per-source apples-to-apples;
//      bare `ccusage` aggregates 15-agent default that native doesn't
//      yet walk). The scope mismatch was the dominant residual drift
//      after R4.0.a/b landed — see `r4-closure-trace.md#r4-0-c` +
//      `r4-slip-plan.md#multi-agent-discovery` for the R5-deferral
//      record.
//   4. Compares totals + per-model + token + block-count within the
//      §B.3 tolerance bands.
//
// **Critical detail**: oracle invocation uses `--mode calculate`, NOT
// ccusage's binary default `--mode auto`. R2's S-R2-2 drift was caused
// by R2's hidden mistake of comparing native-implicit-calculate against
// ccusage-default-auto. Apples-to-apples means same mode on both sides.
//
// Mirrors `Researcher v3 §B.4`'s assertion shape; updated R4.0.c.

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { runNative } from "../runner";
import { discoverJsonlFiles } from "../paths";
import type { UsageRecord, Block, ModelBreakdown } from "../../types";

const RUN = process.env.RUN_REAL_PARITY === "1";
const TZ = process.env.TZ ?? "UTC";
const CCUSAGE_BIN = process.env.CCUSAGE_BIN ?? "ccusage";

/**
 * R4.0.c oracle helper. Calls `ccusage claude <cmd> --mode calculate
 * --timezone <tz> --json` directly (bypasses `runCcusage` because its
 * extraArgs ordering doesn't accommodate sub-source commands).
 *
 * Normalises the per-source field names back to the unified shape the
 * smoke assertions consume:
 *   - daily:   `date`  → `period`
 *   - weekly:  `week`  → `period`
 *   - monthly: `month` → `period`
 *   - session/blocks: shape already compatible.
 */
async function ccusageClaudeOracle<T>(cmd: string): Promise<T> {
  const args = ["claude", cmd, "--mode", "calculate", "--timezone", TZ, "--json"];
  return new Promise<T>((resolve, reject) => {
    const child = spawn(CCUSAGE_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* */ }
      reject(new Error(`ccusage claude ${cmd} timeout`));
    }, 60_000);
    child.stdout.on("data", (c) => { stdout += c.toString(); });
    child.stderr.on("data", (c) => { stderr += c.toString(); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ccusage claude ${cmd} exit ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        // R4.0.c — normalize per-source field names to the unified shape.
        const key = cmd as "daily" | "weekly" | "monthly" | "session" | "blocks";
        if (key === "daily" || key === "weekly" || key === "monthly") {
          const rows = parsed[key] as Array<Record<string, unknown>>;
          const periodKey = key === "daily" ? "date" : key === "weekly" ? "week" : "month";
          for (const r of rows) {
            if (r[periodKey] != null && r["period"] == null) r["period"] = r[periodKey];
          }
        }
        resolve(parsed as T);
      } catch (e) {
        reject(new Error(`ccusage claude ${cmd} JSON parse: ${(e as Error).message}`));
      }
    });
  });
}

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
      ccusageClaudeOracle<{ monthly: UsageRecord[] }>("monthly"),
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
      ccusageClaudeOracle<{ daily: UsageRecord[] }>("daily"),
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
      ccusageClaudeOracle<{ monthly: UsageRecord[] }>("monthly"),
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
      ccusageClaudeOracle<{ monthly: UsageRecord[] }>("monthly"),
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
      ccusageClaudeOracle<{ blocks: Block[] }>("blocks"),
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
