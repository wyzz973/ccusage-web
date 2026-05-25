// Public surface of the native cost-cutover module (M6).
//
// Layered:
//   parser.ts        — line-level JSONL parser + dedup
//   cost.ts          — per-line cost arithmetic
//   pricing.ts       — model → PriceRow lookup with fuzzy fallback
//   pricing-data.ts  — built-in snapshot (refresh cadence: Researcher v2 §C.3)
//   paths.ts         — discover `<root>/projects/**/*.jsonl`
//   loader.ts        — aggregate cooked entries → totals + model breakdown
//   runner.ts        — `runCcusage`-shape adapter (drop-in for the poller)
//
// Activated by `USAGE_SOURCE=native`. Default is `ccusage` (the shell-out
// path) — flip-default lands in M6.d after the soak in M6.c.

export { parseLine, dedupEntries, hasUsageBlock, hasUnsupportedNullField } from "./parser.js";
export type { CookedEntry, RawUsageEntry } from "./parser.js";
export { calculateCost, tiered } from "./cost.js";
export type { UsageTokens } from "./cost.js";
export { createPricing, _resetPricingWarnings } from "./pricing.js";
export type { PricingFinder } from "./pricing.js";
export { PRICING_TABLE } from "./pricing-data.js";
export type { PriceRow } from "./pricing-data.js";
export { discoverRoots, discoverJsonlFiles } from "./paths.js";
export type { DiscoverOptions } from "./paths.js";
export { loadJsonlContent, loadJsonlFiles } from "./loader.js";
export type { LoadOptions, LoaderResult, LoaderTotals, ModelBreakdownRow, Mode } from "./loader.js";
export { runNative, inferAgentFromPath } from "./runner.js";
export type { NativeRunnerOptions } from "./runner.js";
