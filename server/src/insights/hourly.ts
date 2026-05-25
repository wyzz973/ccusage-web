// 24-bucket hourly cost array for the v1 trend chart "Today" tab.
//
// Round-1 caveat: the current `ccusage --json session` output does NOT
// expose hourly timestamps per request — only the session `metadata.lastActivity`
// and per-session totals. The best Round-1 approximation is to fold each
// of today's sessions into the hour of its `lastActivity` (loose, but a
// directionally correct heuristic that lets the UI render).
//
// Round 2 (M6) will replace this with raw-log bucketing once the native
// parser is wired in.

import type { UsageRecord } from "../types.js";

export interface HourlyBucket {
  hour: number; // 0..23
  cost: number;
}

export interface HourlyInputs {
  sessionRecords: UsageRecord[];
  todayKey: string;
  tz: string;
}

export function bucketHourly(input: HourlyInputs): HourlyBucket[] {
  const buckets: HourlyBucket[] = [];
  for (let h = 0; h < 24; h++) buckets.push({ hour: h, cost: 0 });

  for (const r of input.sessionRecords) {
    const ts = r.metadata?.lastActivity;
    if (!ts) continue;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) continue;
    const date = new Date(ms);

    // Day key in target TZ — skip if not today.
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: input.tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
    if (dayKey !== input.todayKey) continue;

    // Hour in target TZ.
    const hourStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: input.tz, hour: "2-digit", hour12: false,
    }).format(date);
    const h = Number(hourStr.replace(/[^\d]/g, ""));
    if (!Number.isFinite(h) || h < 0 || h > 23) continue;
    const cost = Number.isFinite(r.totalCost) ? r.totalCost : 0;
    const target = buckets[h];
    if (target) target.cost += cost;
  }
  return buckets;
}
