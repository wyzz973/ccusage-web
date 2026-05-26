// Native runCcusage-shape adapter.
//
// `runNative(cmd, opts)` is a drop-in for `runCcusage(cmd)` from the
// existing `ccusage-runner.ts`. Both return the same envelope:
//
//   { daily:   UsageRecord[] }
//   { weekly:  UsageRecord[] }
//   { monthly: UsageRecord[] }
//   { session: UsageRecord[] }
//   { blocks:  Block[] }
//
// The poller is agnostic — when `USAGE_SOURCE=native` is set,
// `app.ts` swaps in this runner. Phase-1 M6 caveats:
//   - Discovery only covers Claude Code (~/.claude/projects/**) — other
//     agents (Codex, Gemini, OpenClaw, …) are not yet wired up here
//     (researcher v2 §B.2 — out of M6 scope, lands in agent-coverage work).
//   - Block detection is a simplified 5-hour window scheme; M6.c soak
//     against ccusage will surface any drift before the default flip.
//   - `metadata.agents` is heuristic from per-file root (Phase 1: always
//     `["claude"]` since only ~/.claude is discovered).
//
// `USAGE_SOURCE=ccusage` (default) leaves the existing path untouched.

import * as fs from "node:fs";
import * as path from "node:path";
import type { UsageRecord, Block, ModelBreakdown } from "../types.js";
import {
  getTodayKey, getWeekStartKey, getMonthKey, decodeProject,
} from "../insights/index.js";
import { discoverJsonlFiles } from "./paths.js";
import { loadJsonlContent, type LoaderResult } from "./loader.js";
import { createPricing, type PricingFinder } from "./pricing.js";
import type { CookedEntry } from "./parser.js";

export interface NativeRunnerOptions {
  /** Override discovered files (tests). */
  files?: string[];
  /** Override `now` for block timing / bucket-key derivation (tests). */
  now?: Date;
  /** IANA TZ for date-bucket keys. Default UTC. */
  tz?: string;
  /** Override the pricing finder (tests). */
  pricing?: PricingFinder;
  /** Filesystem facade (tests). */
  fs?: { readFileSync(p: string, enc: BufferEncoding): string };
  /**
   * R3 (S-R2-2): cost-mode resolution. Defaults to `"calculate"` —
   * matches the M6 golden gate and Researcher v3 §D's recommendation
   * for the native default. Apples-to-apples vs ccusage requires
   * passing `--mode calculate` to the binary too.
   */
  mode?: import("./loader.js").Mode;
}

const BLOCK_HOURS = 5;
const BLOCK_MS = BLOCK_HOURS * 60 * 60 * 1000;

/** ccusage-runner-compatible facade. */
export async function runNative<T = unknown>(
  cmd: string,
  opts: NativeRunnerOptions = {},
): Promise<T> {
  const tz = opts.tz ?? "UTC";
  const now = opts.now ?? new Date();
  const rawFiles = opts.files ?? discoverJsonlFiles();
  const pricing = opts.pricing ?? createPricing();
  const fsImpl = opts.fs ?? fs;
  const mode = opts.mode ?? "calculate";

  // R3 §D.4.3 — dedup input file list. Overlapping CLAUDE_CONFIG_DIR
  // roots and accidental test duplicates both surface here. Preserves
  // first-occurrence order so output stays deterministic.
  const seen = new Set<string>();
  const files: string[] = [];
  for (const f of rawFiles) {
    if (seen.has(f)) continue;
    seen.add(f);
    files.push(f);
  }

  const perFile = files.map((file) => loadFile(file, fsImpl, pricing, mode));

  switch (cmd) {
    case "daily":
      return { daily: bucketByDay(perFile, tz) } as T;
    case "weekly":
      return { weekly: bucketByWeek(perFile, tz) } as T;
    case "monthly":
      return { monthly: bucketByMonth(perFile, tz) } as T;
    case "session":
      return { session: bucketBySession(perFile) } as T;
    case "blocks":
      // R4.0.a (Researcher v4 §B.1) — `tz` is now threaded so blocks
      // floor to user-local hour (matches ccusage's `identify_session_blocks`).
      return { blocks: buildBlocks(perFile, now, tz) } as T;
    default:
      throw new Error(`runNative: unsupported command "${cmd}"`);
  }
}

interface FileBundle {
  file: string;
  agent: string;             // inferred from root (M6 Phase 1: usually "claude")
  result: LoaderResult;
}

function loadFile(
  file: string,
  fsImpl: { readFileSync(p: string, enc: BufferEncoding): string },
  pricing: PricingFinder,
  mode: import("./loader.js").Mode = "calculate",
): FileBundle {
  let text = "";
  try { text = fsImpl.readFileSync(file, "utf8"); } catch { /* unreadable */ }
  // R2.2 (M-R2-1): pass `filePath` through so each cooked entry knows
  // which file it came from, enabling per-session project stamping in
  // `bucketBySession` below.
  // R3 (S-R2-2): pass `mode` so cost resolution happens inside the loader.
  const result = loadJsonlContent(text, { pricing, mode, filePath: file });
  return { file, agent: inferAgentFromPath(file), result };
}

/** Map a discovered file path to the owning agent's slug.
 *  Phase-1 only recognizes Claude Code's `~/.claude` root; everything else
 *  falls through to "claude" because that's all `discoverJsonlFiles()` returns. */
export function inferAgentFromPath(filePath: string): string {
  const norm = filePath.toLowerCase();
  if (norm.includes("/.claude/")) return "claude";
  if (norm.includes("/.codex/")) return "codex";
  if (norm.includes("/.gemini/")) return "gemini";
  if (norm.includes("/.copilot/") || norm.includes("/.config/copilot/")) return "copilot";
  if (norm.includes("/.openclaw/")) return "openclaw";
  return "unknown";
}

// ── bucketing helpers ────────────────────────────────────────────────────

interface PeriodBucket {
  period: string;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  perModel: Map<string, ModelBreakdown>;
  agents: Set<string>;
  lastActivityMs: number;
}

function emptyBucket(period: string): PeriodBucket {
  return {
    period,
    costUSD: 0, inputTokens: 0, outputTokens: 0,
    cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 0,
    perModel: new Map(), agents: new Set(),
    lastActivityMs: 0,
  };
}

function fold(b: PeriodBucket, e: CookedEntry, agent: string): void {
  b.costUSD += e.costUSD;
  b.inputTokens += e.inputTokens;
  b.outputTokens += e.outputTokens;
  b.cacheCreationTokens += e.cacheCreationInputTokens;
  b.cacheReadTokens += e.cacheReadInputTokens;
  b.totalTokens += e.totalTokens;
  if (agent) b.agents.add(agent);
  if (e.timestampMs > b.lastActivityMs) b.lastActivityMs = e.timestampMs;

  const model = e.displayModel;
  if (!model) return;
  const row = b.perModel.get(model) ?? {
    modelName: model, cost: 0,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
  };
  row.cost += e.costUSD;
  row.inputTokens += e.inputTokens;
  row.outputTokens += e.outputTokens;
  row.cacheCreationTokens += e.cacheCreationInputTokens;
  row.cacheReadTokens += e.cacheReadInputTokens;
  b.perModel.set(model, row);
}

function finalize(buckets: Map<string, PeriodBucket>): UsageRecord[] {
  const out: UsageRecord[] = [];
  // Sort lex ascending by period (matches ccusage).
  for (const period of Array.from(buckets.keys()).sort()) {
    const b = buckets.get(period)!;
    const modelBreakdowns = Array.from(b.perModel.values()).sort((a, b) => b.cost - a.cost);
    const agents = Array.from(b.agents).sort();
    const record: UsageRecord = {
      period: b.period,
      agent: "all",
      totalTokens: b.totalTokens,
      totalCost: b.costUSD,
      inputTokens: b.inputTokens,
      outputTokens: b.outputTokens,
      cacheCreationTokens: b.cacheCreationTokens,
      cacheReadTokens: b.cacheReadTokens,
      modelsUsed: modelBreakdowns.map((m) => m.modelName),
      modelBreakdowns,
      metadata: agents.length > 0 ? { agents } : {},
    };
    out.push(record);
  }
  return out;
}

function bucketByKey(perFile: FileBundle[], keyer: (e: CookedEntry) => string): UsageRecord[] {
  const buckets = new Map<string, PeriodBucket>();
  for (const fb of perFile) {
    for (const e of fb.result.entries) {
      const k = keyer(e);
      let b = buckets.get(k);
      if (!b) { b = emptyBucket(k); buckets.set(k, b); }
      fold(b, e, fb.agent);
    }
  }
  return finalize(buckets);
}

function bucketByDay(perFile: FileBundle[], tz: string): UsageRecord[] {
  return bucketByKey(perFile, (e) => getTodayKey(new Date(e.timestampMs), tz));
}

function bucketByWeek(perFile: FileBundle[], tz: string): UsageRecord[] {
  return bucketByKey(perFile, (e) => getWeekStartKey(new Date(e.timestampMs), tz));
}

function bucketByMonth(perFile: FileBundle[], tz: string): UsageRecord[] {
  return bucketByKey(perFile, (e) => getMonthKey(new Date(e.timestampMs), tz));
}

function bucketBySession(perFile: FileBundle[]): UsageRecord[] {
  // One UsageRecord per `<sessionId>.jsonl` file. period = sessionId-from-filename.
  // Agent is per-file (inferred from path root).
  //
  // R2.2 (M-R2-1): stamp `project` per session by decoding the encoded
  // parent directory of the file path (`<root>/projects/<encoded>/<sid>.jsonl`).
  // `decodeProject` returns the stable canonical id; the UI maps it to a
  // short displayName at render time. Sessions in non-Claude roots (no
  // `/projects/` segment in the path) end up with `project: undefined`.
  const out: UsageRecord[] = [];
  for (const fb of perFile) {
    if (fb.result.entries.length === 0) continue;
    const sessionId = path.basename(fb.file, ".jsonl");
    const t = fb.result.totals;
    const modelBreakdowns = t.modelBreakdowns.slice();
    let lastActivityMs = 0;
    for (const e of fb.result.entries) {
      if (e.timestampMs > lastActivityMs) lastActivityMs = e.timestampMs;
    }
    // R3 §C: sample the first entry's `cwd` (CC log lines always carry
    // it per `NULL_FORBIDDEN_FIELDS`; cwd is per-session-stable so the
    // first occurrence is sufficient). When absent, decodeProject falls
    // back to the R1/R2 trailing-`-`-segment heuristic.
    const sampleCwd = fb.result.entries[0]?.cwd;
    const decoded = decodeProject({ fullPath: fb.file, cwd: sampleCwd });
    const project = decoded.canonical === "unknown" ? undefined : decoded.canonical;
    const record: UsageRecord = {
      period: sessionId,
      agent: fb.agent,
      totalTokens: t.totalTokens,
      totalCost: t.totalCostUSD,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      cacheCreationTokens: t.cacheCreationTokens,
      cacheReadTokens: t.cacheReadTokens,
      modelsUsed: modelBreakdowns.map((m) => m.modelName),
      modelBreakdowns,
      metadata: lastActivityMs > 0
        ? { lastActivity: new Date(lastActivityMs).toISOString() }
        : {},
      project,
      projectDisplay: project ? decoded.displayName : undefined,
      projectDisplaySource: project ? decoded.displayNameSource : undefined,
    };
    out.push(record);
  }
  return out;
}

/**
 * R4.0.a — port of `identify_session_blocks` from ccusage upstream
 * (`blocks.rs:15-65`, pseudocode in iter0-R1 §5 / Researcher v4 §B.1).
 *
 * The pre-R4 implementation was a fixed UTC 5h grid with gap-filler
 * windows — produced 3.07× the block count of ccusage (608 vs 198
 * against the 4-month real `~/.claude` dataset). Two distinct
 * divergences from upstream:
 *
 *   1. Anchored to UTC hour (`setUTCMinutes(0,0,0)`), not user-local
 *      hour. `bucketByDay`/`Week`/`Month` already honor `tz`; only
 *      `buildBlocks` was missing the threading.
 *   2. Fixed 5h grid + gap-window-per-empty-cell, vs. ccusage's
 *      cluster-and-gap: a new block starts when an entry is > 5h from
 *      either the current block's start OR the previous entry —
 *      whichever fires first. Gap blocks ONLY emit when consecutive
 *      entries are > 5h apart (one big quiet weekend = one gap block,
 *      not a sequence of empty grid windows).
 *
 * Behaviour preserved verbatim from pre-R4:
 *   - Active block detection (`now ∈ [start, start+5h)` AND last
 *     activity within 5h of now)
 *   - R3.13 `usageLimitResetTime` propagation (latest-non-null wins)
 *   - Burn-rate / projection only on the active block
 */
function buildBlocks(perFile: FileBundle[], now: Date, tz: string): Block[] {
  const all: CookedEntry[] = [];
  for (const fb of perFile) all.push(...fb.result.entries);
  if (all.length === 0) return [];
  all.sort((a, b) => a.timestampMs - b.timestampMs);

  // Cluster the entries: each cluster starts at `floor_to_hour(entry.t)`
  // in user-local TZ. A new cluster begins when an entry is > BLOCK_MS
  // from EITHER the cluster start OR the previous entry. Gap blocks
  // are inserted between two real clusters when the last-entry-to-next
  // -entry gap is > BLOCK_MS.
  interface Cluster { start: number; entries: CookedEntry[] }
  const clusters: Cluster[] = [];
  const gapStarts: number[] = []; // index in `clusters` array AFTER which a gap was triggered
  let cur: Cluster | null = null;

  for (const e of all) {
    if (cur === null) {
      cur = { start: floorToTzHour(e.timestampMs, tz), entries: [e] };
      continue;
    }
    const lastT = cur.entries[cur.entries.length - 1]!.timestampMs;
    const exceedsStart = (e.timestampMs - cur.start) > BLOCK_MS;
    const exceedsLast  = (e.timestampMs - lastT)    > BLOCK_MS;
    if (exceedsStart || exceedsLast) {
      clusters.push(cur);
      if (exceedsLast) gapStarts.push(clusters.length - 1);
      cur = { start: floorToTzHour(e.timestampMs, tz), entries: [e] };
    } else {
      cur.entries.push(e);
    }
  }
  if (cur) clusters.push(cur);

  // Emit blocks + gap-blocks in chronological order. Each cluster
  // becomes a real block; for each gap-flagged transition we also
  // emit a gap block between the two real ones.
  const blocks: Block[] = [];
  const gapSet = new Set(gapStarts);
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i]!;
    blocks.push(toRealBlock(c, now));
    if (gapSet.has(i) && i + 1 < clusters.length) {
      const lastT  = c.entries[c.entries.length - 1]!.timestampMs;
      const nextT0 = clusters[i + 1]!.entries[0]!.timestampMs;
      blocks.push(toGapBlock(lastT + BLOCK_MS, nextT0));
    }
  }
  return blocks;
}

function toRealBlock(c: { start: number; entries: CookedEntry[] }, now: Date): Block {
  const inWindow = c.entries;
  const totals = inWindow.reduce((acc, e) => ({
    cost: acc.cost + e.costUSD,
    tokens: acc.tokens + e.totalTokens,
    input: acc.input + e.inputTokens,
    output: acc.output + e.outputTokens,
    cc: acc.cc + e.cacheCreationInputTokens,
    cr: acc.cr + e.cacheReadInputTokens,
  }), { cost: 0, tokens: 0, input: 0, output: 0, cc: 0, cr: 0 });
  const start = c.start;
  const end = start + BLOCK_MS;
  const lastActivity = inWindow[inWindow.length - 1]!.timestampMs;
  // R4.0.a — `is_active`: now within the block window AND last entry
  // less than BLOCK_MS ago. Matches ccusage's `blocks.rs:90-95`.
  const isActive = now.getTime() >= start && now.getTime() < end
    && (now.getTime() - lastActivity) < BLOCK_MS;
  const models = Array.from(new Set(inWindow.map((e) => e.displayModel).filter((m): m is string => !!m)));
  // R3.13 — latest non-null `usageLimitResetTime` wins.
  let usageLimitResetTime: string | null = null;
  for (const e of inWindow) {
    if (typeof e.usageLimitResetTime === "string" && e.usageLimitResetTime !== "") {
      usageLimitResetTime = e.usageLimitResetTime;
    }
  }
  return {
    id: `blk-${new Date(start).toISOString()}`,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    actualEndTime: isActive ? null : new Date(lastActivity).toISOString(),
    isActive,
    isGap: false,
    costUSD: totals.cost,
    totalTokens: totals.tokens,
    entries: inWindow.length,
    models,
    burnRate: isActive ? burnRateFor(totals, start, now.getTime()) : null,
    projection: isActive ? projectionFor(totals, start, end, now.getTime()) : null,
    tokenCounts: {
      inputTokens: totals.input, outputTokens: totals.output,
      cacheCreationInputTokens: totals.cc, cacheReadInputTokens: totals.cr,
    },
    usageLimitResetTime,
  };
}

function toGapBlock(startMs: number, endMs: number): Block {
  return {
    id: `gap-${new Date(startMs).toISOString()}`,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    actualEndTime: null,
    isActive: false,
    isGap: true,
    costUSD: 0, totalTokens: 0, entries: 0,
    models: [],
    burnRate: null,
    projection: null,
    tokenCounts: {
      inputTokens: 0, outputTokens: 0,
      cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
    },
    usageLimitResetTime: null,
  };
}

/**
 * Floor a UTC ms timestamp to the start of its containing hour AS
 * SEEN IN THE GIVEN TIMEZONE. Returns the UTC ms of that local hour
 * boundary. Matches ccusage's `TimestampMs::floor_to_hour` semantics
 * via `--timezone` (Researcher v4 §B.1 — closes the UTC-anchored
 * divergence).
 */
function floorToTzHour(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string): number => {
    const p = parts.find((x) => x.type === t);
    return p ? Number(p.value) : 0;
  };
  const localHourLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), 0, 0);
  // Compute the TZ offset at this instant (local-as-utc - actual-utc)
  // and subtract it back to get the real UTC ms of the local-hour
  // start. This is the canonical "interpret these calendar parts as
  // belonging to tz" trick.
  // Reconstruct the actual UTC ms that corresponds to these parts.
  const localFullLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = localFullLocal - ms; // ahead-of-UTC TZs return positive
  return localHourLocal - offsetMs;
}

function burnRateFor(totals: { cost: number; tokens: number }, startMs: number, nowMs: number) {
  const elapsedMin = Math.max(1, (nowMs - startMs) / 60_000);
  const elapsedHr = elapsedMin / 60;
  return {
    costPerHour: totals.cost / elapsedHr,
    tokensPerMinute: totals.tokens / elapsedMin,
    tokensPerMinuteForIndicator: totals.tokens / elapsedMin,
  };
}

function projectionFor(
  totals: { cost: number; tokens: number },
  startMs: number, endMs: number, nowMs: number,
) {
  const elapsed = Math.max(1, nowMs - startMs);
  const remainingMs = Math.max(0, endMs - nowMs);
  const scale = (elapsed + remainingMs) / elapsed;
  return {
    remainingMinutes: Math.round(remainingMs / 60_000),
    totalCost: totals.cost * scale,
    totalTokens: Math.round(totals.tokens * scale),
  };
}
