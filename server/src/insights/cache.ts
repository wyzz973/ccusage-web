// D5 — Cache-savings derivation.
//
// Spec-v2 §3.4 share-of-total invariant:
//   N (hit%): cacheReadTokens   summed across the range
//   D (hit%): inputTokens + cacheCreationTokens + cacheReadTokens
//   D = 0 → null (UI renders "—", never NaN).
//
// `savedUSD`: dollar value the user avoided by hitting the cache. Computed
// per-record as `cacheReadTokens * (input_rate - cache_read_rate)` and
// summed. Pricing lookup uses the fuzzy `PricingFinder` from native/.
//
// `sparkPctPerDay`: per-day hit% for the trailing 14 days, oldest → newest.
//
// `wkOverWkDropPct`: drop in cache-hit% from prior 7d to current 7d, as a
// fraction. Used by the UI to flip the header to amber per spec-v2 §3.4.
// Returns null when either week has zero denominator.

import type { UsageRecord } from "../types.js";
import { createPricing, type PricingFinder } from "../native/pricing.js";

export interface CacheInsight {
  hitPct: number | null;
  savedUSD: number;
  sparkPctPerDay: number[];          // 0..1 fractions
  wkOverWkDropPct: number | null;    // 0..1 fraction; null when prior=0
}

export interface CacheInputs {
  /** Records to roll up. Caller decides the window (range-aware). */
  dailyRecords: UsageRecord[];
  /** Pricing source (defaults to the built-in). */
  pricing?: PricingFinder;
}

export function computeCacheInsight(input: CacheInputs): CacheInsight {
  const pricing = input.pricing ?? createPricing();
  let cacheRead = 0;
  let inputT = 0;
  let cacheCreate = 0;
  let savedUSD = 0;

  for (const r of input.dailyRecords) {
    if (!Number.isFinite(r.totalCost)) continue;
    cacheRead += r.cacheReadTokens;
    inputT += r.inputTokens;
    cacheCreate += r.cacheCreationTokens;

    // Saved = how much these cache reads WOULD have cost at the input rate,
    // minus what they actually cost at the cache-read rate. Per-model so we
    // pick the right rate.
    for (const mb of r.modelBreakdowns ?? []) {
      const price = pricing.find(mb.modelName);
      if (!price) continue;
      const wouldCostAsInput = (mb.cacheReadTokens || 0) * price.input;
      const actualCacheCost = (mb.cacheReadTokens || 0) * price.cache_read;
      const delta = wouldCostAsInput - actualCacheCost;
      if (delta > 0) savedUSD += delta;
    }
  }

  const denom = inputT + cacheCreate + cacheRead;
  const hitPct = denom > 0 ? cacheRead / denom : null;

  const sparkPctPerDay = computeSparkSeries(input.dailyRecords, 14);
  const wkOverWkDropPct = computeWkOverWkDrop(input.dailyRecords);

  return { hitPct, savedUSD, sparkPctPerDay, wkOverWkDropPct };
}

// ── helpers ──────────────────────────────────────────────────────────────

function computeSparkSeries(records: UsageRecord[], n: number): number[] {
  // Per-day hit% over the last `n` days present in records.
  const byDay = new Map<string, { cacheRead: number; denom: number }>();
  for (const r of records) {
    const cur = byDay.get(r.period) ?? { cacheRead: 0, denom: 0 };
    cur.cacheRead += r.cacheReadTokens;
    cur.denom += r.inputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    byDay.set(r.period, cur);
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-n)
    .map(([, v]) => (v.denom > 0 ? v.cacheRead / v.denom : 0));
}

function computeWkOverWkDrop(records: UsageRecord[]): number | null {
  // Sort daily records by period; bucket trailing 14 days into two 7-day chunks.
  const days = new Map<string, { cacheRead: number; denom: number }>();
  for (const r of records) {
    const cur = days.get(r.period) ?? { cacheRead: 0, denom: 0 };
    cur.cacheRead += r.cacheReadTokens;
    cur.denom += r.inputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    days.set(r.period, cur);
  }
  const sorted = Array.from(days.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (sorted.length < 8) return null;
  const tail = sorted.slice(-14);
  const prior = tail.slice(0, 7);
  const recent = tail.slice(-7);
  const priorPct = sumPct(prior);
  const recentPct = sumPct(recent);
  if (priorPct == null || recentPct == null) return null;
  if (priorPct < 0.05) return null; // spec-v2 §3.4: require ≥5% baseline to compute
  return priorPct - recentPct; // positive = drop
}

function sumPct(rows: [string, { cacheRead: number; denom: number }][]): number | null {
  let cr = 0, d = 0;
  for (const [, v] of rows) { cr += v.cacheRead; d += v.denom; }
  if (d <= 0) return null;
  return cr / d;
}
