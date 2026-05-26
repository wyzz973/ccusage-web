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
   * Cost-mode (matches ccusage's `--mode`). R3 (S-R2-2 root-cause fix
   * per Researcher v3 §D.2) honors all three:
   *
   *   `calculate` (default) — always recompute from token counts. Most
   *     conservative; matches ccusage `--mode calculate`. The M6 golden
   *     gate locks against this.
   *   `display`            — always use the raw `costUSD` from the line
   *     (0 when null/absent). Matches ccusage `--mode display`.
   *   `auto`               — use raw `costUSD` when finite, else fall
   *     back to recompute. Matches ccusage's binary default (`--mode auto`),
   *     which was what caused R2's +119–224 % drift in S-R2-2 — native
   *     was implicitly `calculate` while ccusage's default was `auto`.
   *     R3 finally honors the parameter so apples-to-apples comparisons
   *     work both ways.
   */
  mode?: Mode;
}

/**
 * R3 S-R2-2: apply the cost-mode resolution to a freshly-parsed entry,
 * mutating `costUSD` in-place. Always-recomputed value stays available
 * via `rawCostUSD` for `display`/`auto`. The function intentionally
 * mutates because the entry was JUST created by `parseLine` — no
 * outside reference yet — and the alternative (clone-every-entry)
 * triples allocations on hot paths with millions of records.
 */
function applyCostMode(e: CookedEntry, mode: Mode): void {
  if (mode === "calculate") return; // already in calculate; default.
  const raw = e.rawCostUSD;
  if (mode === "display") {
    e.costUSD = (typeof raw === "number" && Number.isFinite(raw)) ? raw : 0;
    return;
  }
  // mode === "auto" — prefer raw, fall back to recompute.
  if (typeof raw === "number" && Number.isFinite(raw)) {
    e.costUSD = raw;
  }
  // else: keep the already-recomputed calculate value.
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
export function loadJsonlContent(content: string, opts: LoadOptions & { filePath?: string } = {}): LoaderResult {
  const pricing = opts.pricing ?? createPricing();
  const mode: Mode = opts.mode ?? "calculate";
  const cooked: CookedEntry[] = [];
  // newlines: \r\n, \n, lone \r — keep behavior tolerant since fixtures
  // hand-crafted in editors may land different shapes on different boxes.
  const lines = content.split(/\r?\n|\r/);
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const e = parseLine(line, pricing, { filePath: opts.filePath });
    if (!e) continue;
    applyCostMode(e, mode);
    cooked.push(e);
  }
  const deduped = dedupEntries(cooked);
  return { entries: deduped, totals: aggregate(deduped) };
}

/**
 * Read each file and concatenate the entries before deduping. Dedup runs
 * cross-file so that a duplicate (messageId, requestId) that landed in
 * two different .jsonls (e.g. a session that was reopened) is collapsed.
 *
 * R2.2 (M-R2-1): every emitted entry carries `filePath` so the runner can
 * stamp `UsageRecord.project` per session via `decodeProject(filePath)`.
 * R3 (S-R2-2): respects `opts.mode` for cost resolution.
 *
 * R3 (§D.4.3 — cross-file dedup audit): the input `files` array is
 * deduped at the top so processing the same file twice (e.g. when
 * overlapping `CLAUDE_CONFIG_DIR` roots discover the same path, or when
 * a test passes a duplicate by accident) doesn't double-count entries
 * that are missing either `messageId` OR `requestId` (those would
 * otherwise land in `dedupEntries`'s `unkeyed` pass-through). The
 * keyed-dedup path catches normal overlap; the input-dedup catches the
 * same-file-twice edge case at the boundary.
 */
export function loadJsonlFiles(files: string[], opts: LoadOptions = {}): LoaderResult {
  const pricing = opts.pricing ?? createPricing();
  const mode: Mode = opts.mode ?? "calculate";
  // R3 §D.4.3 defensive dedup at the file level. Preserves input order
  // for the first occurrence (deterministic across runs).
  const seen = new Set<string>();
  const uniqueFiles: string[] = [];
  for (const f of files) {
    if (seen.has(f)) continue;
    seen.add(f);
    uniqueFiles.push(f);
  }
  const cooked: CookedEntry[] = [];
  for (const file of uniqueFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue; // skip unreadable file
    }
    const lines = content.split(/\r?\n|\r/);
    for (const line of lines) {
      if (!line || !line.trim()) continue;
      const e = parseLine(line, pricing, { filePath: file });
      if (!e) continue;
      applyCostMode(e, mode);
      cooked.push(e);
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
