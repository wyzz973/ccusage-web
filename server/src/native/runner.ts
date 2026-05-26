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
  const files = opts.files ?? discoverJsonlFiles();
  const pricing = opts.pricing ?? createPricing();
  const fsImpl = opts.fs ?? fs;

  const perFile = files.map((file) => loadFile(file, fsImpl, pricing));

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
      return { blocks: buildBlocks(perFile, now) } as T;
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
): FileBundle {
  let text = "";
  try { text = fsImpl.readFileSync(file, "utf8"); } catch { /* unreadable */ }
  // R2.2 (M-R2-1): pass `filePath` through so each cooked entry knows
  // which file it came from, enabling per-session project stamping in
  // `bucketBySession` below.
  const result = loadJsonlContent(text, { pricing, filePath: file });
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
    const decoded = decodeProject({ fullPath: fb.file });
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
    };
    out.push(record);
  }
  return out;
}

function buildBlocks(perFile: FileBundle[], now: Date): Block[] {
  // 5h windows anchored to the earliest entry's hour. Simple Phase-1 model.
  const all: CookedEntry[] = [];
  for (const fb of perFile) all.push(...fb.result.entries);
  if (all.length === 0) return [];
  all.sort((a, b) => a.timestampMs - b.timestampMs);

  // Floor to the hour for the first window's start.
  const firstMs = all[0]!.timestampMs;
  const firstHour = new Date(firstMs);
  firstHour.setUTCMinutes(0, 0, 0);
  let cursor = firstHour.getTime();

  const blocks: Block[] = [];
  let idx = 0;
  while (cursor <= now.getTime() + BLOCK_MS) {
    const start = cursor;
    const end = cursor + BLOCK_MS;
    const inWindow: CookedEntry[] = [];
    while (idx < all.length && all[idx]!.timestampMs < end) {
      if (all[idx]!.timestampMs >= start) inWindow.push(all[idx]!);
      idx++;
    }
    if (inWindow.length === 0 && cursor + BLOCK_MS < now.getTime()) {
      // Gap window — mark and skip.
      blocks.push({
        id: `gap-${new Date(start).toISOString()}`,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        actualEndTime: null,
        isActive: false,
        isGap: true,
        costUSD: 0, totalTokens: 0, entries: 0,
        models: [], burnRate: null, projection: null,
        tokenCounts: {
          inputTokens: 0, outputTokens: 0,
          cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
        },
      });
    } else if (inWindow.length > 0) {
      const totals = inWindow.reduce((acc, e) => ({
        cost: acc.cost + e.costUSD,
        tokens: acc.tokens + e.totalTokens,
        input: acc.input + e.inputTokens,
        output: acc.output + e.outputTokens,
        cc: acc.cc + e.cacheCreationInputTokens,
        cr: acc.cr + e.cacheReadInputTokens,
      }), { cost: 0, tokens: 0, input: 0, output: 0, cc: 0, cr: 0 });
      const isActive = now.getTime() >= start && now.getTime() < end;
      const lastActivity = inWindow[inWindow.length - 1]!.timestampMs;
      const models = Array.from(new Set(inWindow.map((e) => e.displayModel).filter((m): m is string => !!m)));
      blocks.push({
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
      });
    }
    cursor += BLOCK_MS;
  }
  return blocks;
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
