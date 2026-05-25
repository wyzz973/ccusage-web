// JSONL loader + aggregator.
//
// Public surface for the golden parity test and the native runner. Reads
// JSONL content (text or file paths), runs each line through `parseLine`,
// dedupes the cooked entries by (messageId, requestId), and produces the
// totals + per-model breakdown rows that ccusage's `--json --mode calculate`
// emits at the aggregate level.
//
// Per Researcher v2 §C.2 the golden test calls into this module's
// `loadJsonlContent` (or `loadJsonlFiles` for the file-based variant).

import * as fs from "node:fs";
import { parseLine, dedupEntries, type CookedEntry } from "./parser.js";
import { createPricing, type PricingFinder } from "./pricing.js";

export type Mode = "calculate" | "display" | "auto";

export interface LoadOptions {
  /** Pricing finder. Defaults to the built-in snapshot. */
  pricing?: PricingFinder;
  /**
   * Cost-mode (matches ccusage's `--mode`). v1 only supports `calculate`
   * (always recompute, ignore embedded `costUSD`). The other modes wire
   * in M6.b/D10 — accept the param so callers can already pass it.
   */
  mode?: Mode;
}

export interface ModelBreakdownRow {
  modelName: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface LoaderTotals {
  totalCostUSD: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelBreakdowns: ModelBreakdownRow[];
}

export interface LoaderResult {
  /** Deduped, validated cooked entries. */
  entries: CookedEntry[];
  totals: LoaderTotals;
}

const ZERO_TOTALS = (): LoaderTotals => ({
  totalCostUSD: 0, totalTokens: 0,
  inputTokens: 0, outputTokens: 0,
  cacheCreationTokens: 0, cacheReadTokens: 0,
  modelBreakdowns: [],
});

/**
 * Parse the given JSONL content as one logical session-feed. Each line is
 * validated by `parseLine`; the resulting cooked entries are deduped
 * before aggregation.
 */
export function loadJsonlContent(content: string, opts: LoadOptions = {}): LoaderResult {
  const pricing = opts.pricing ?? createPricing();
  const cooked: CookedEntry[] = [];
  // newlines: \r\n, \n, lone \r — keep behavior tolerant since fixtures
  // hand-crafted in editors may land different shapes on different boxes.
  const lines = content.split(/\r?\n|\r/);
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const e = parseLine(line, pricing);
    if (e) cooked.push(e);
  }
  const deduped = dedupEntries(cooked);
  return { entries: deduped, totals: aggregate(deduped) };
}

/**
 * Read each file and concatenate the entries before deduping. Dedup runs
 * cross-file so that a duplicate (messageId, requestId) that landed in
 * two different .jsonls (e.g. a session that was reopened) is collapsed.
 */
export function loadJsonlFiles(files: string[], opts: LoadOptions = {}): LoaderResult {
  const pricing = opts.pricing ?? createPricing();
  const cooked: CookedEntry[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue; // skip unreadable file
    }
    const lines = content.split(/\r?\n|\r/);
    for (const line of lines) {
      if (!line || !line.trim()) continue;
      const e = parseLine(line, pricing);
      if (e) cooked.push(e);
    }
  }
  const deduped = dedupEntries(cooked);
  return { entries: deduped, totals: aggregate(deduped) };
}

function aggregate(entries: CookedEntry[]): LoaderTotals {
  const totals = ZERO_TOTALS();
  const perModel = new Map<string, ModelBreakdownRow>();

  for (const e of entries) {
    totals.totalCostUSD += e.costUSD;
    totals.totalTokens += e.totalTokens;
    totals.inputTokens += e.inputTokens;
    totals.outputTokens += e.outputTokens;
    totals.cacheCreationTokens += e.cacheCreationInputTokens;
    totals.cacheReadTokens += e.cacheReadInputTokens;

    // <synthetic> entries drop the model row but still count tokens (so we
    // skip the per-model row only — totals already includes them).
    const modelName = e.displayModel;
    if (!modelName) continue;
    const row = perModel.get(modelName) ?? {
      modelName, cost: 0,
      inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    };
    row.cost += e.costUSD;
    row.inputTokens += e.inputTokens;
    row.outputTokens += e.outputTokens;
    row.cacheCreationTokens += e.cacheCreationInputTokens;
    row.cacheReadTokens += e.cacheReadInputTokens;
    perModel.set(modelName, row);
  }

  totals.modelBreakdowns = Array.from(perModel.values()).sort((a, b) => b.cost - a.cost);
  return totals;
}
