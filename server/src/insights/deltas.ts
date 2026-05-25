// Period-over-period delta computations for the v1 MetricCards (M8).
//
// `pct` is a *fraction* (e.g. +0.23 for ▲23%). Tone resolution lives in
// the web layer; this module returns raw numbers so the UI can apply the
// inversion rule (locked iter1-R2 §2.4) per card.

import type { UsageRecord } from "../types.js";
import { getWeekStartKey, getMonthKey } from "./period-keys.js";

export interface CardDelta {
  /** Δ as a fraction. `null` when prior period has no data (cold start). */
  pct: number | null;
  /** Human-friendly comparator label (e.g. "vs yesterday"). */
  vsLabel: string;
  /** Cost for the current bucket, for reference. */
  current: number;
  /** Cost for the prior bucket, for reference. */
  previous: number;
}

export interface SnapshotDeltas {
  today: CardDelta;
  week: CardDelta;
  month: CardDelta;
}

export interface DeltaInputs {
  todayKey: string;
  yesterdayKey: string;
  weekKey: string;
  prevWeekKey: string;
  monthKey: string;
  prevMonthKey: string;
  dailyRecords: UsageRecord[];
  weeklyRecords: UsageRecord[];
  monthlyRecords: UsageRecord[];
}

function sumCostFor(records: UsageRecord[], key: string): number {
  let total = 0;
  for (const r of records) {
    if (r.period === key && Number.isFinite(r.totalCost)) total += r.totalCost;
  }
  return total;
}

function computeDelta(current: number, previous: number, vsLabel: string): CardDelta {
  if (previous <= 0) {
    // Cold start / no prior data — return null so UI can render `≈` or "no prior".
    return { pct: null, vsLabel, current, previous };
  }
  return { pct: (current - previous) / previous, vsLabel, current, previous };
}

export function computeSnapshotDeltas(input: DeltaInputs): SnapshotDeltas {
  const todayCost = sumCostFor(input.dailyRecords, input.todayKey);
  const yesterdayCost = sumCostFor(input.dailyRecords, input.yesterdayKey);
  const weekCost = sumCostFor(input.weeklyRecords, input.weekKey);
  const prevWeekCost = sumCostFor(input.weeklyRecords, input.prevWeekKey);
  const monthCost = sumCostFor(input.monthlyRecords, input.monthKey);
  const prevMonthCost = sumCostFor(input.monthlyRecords, input.prevMonthKey);

  return {
    today: computeDelta(todayCost, yesterdayCost, "vs yesterday"),
    week: computeDelta(weekCost, prevWeekCost, "vs last week"),
    month: computeDelta(monthCost, prevMonthCost, "vs last month"),
  };
}

/** Compute the previous-period keys given the current keys. */
export function previousPeriodKeys(now: Date, tz: string): {
  yesterdayKey: string; prevWeekKey: string; prevMonthKey: string;
} {
  // Yesterday: take 24h earlier; close enough since DST shifts at most an
  // hour and the day grouping is taken at the resulting wall-clock moment.
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const yParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(yesterday);
  const get = (t: string): string => yParts.find((p) => p.type === t)?.value ?? "";
  const yesterdayKey = `${get("year")}-${get("month")}-${get("day")}`;

  // Previous week: anchor at last Monday.
  const prevWeek = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  // Previous month: anchor at the last day of the previous month so we never
  // land on Feb 28 → "skip Feb" (fixes S1 from the round-1 review).
  const here = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const here_y = Number(here.find((p) => p.type === "year")?.value ?? "0");
  const here_m = Number(here.find((p) => p.type === "month")?.value ?? "0");
  // Day 0 of the current month in UTC = last day of the previous month.
  const lastDayOfPrevMonth = new Date(Date.UTC(here_y, here_m - 1, 0));

  return {
    yesterdayKey,
    prevWeekKey: getWeekStartKey(prevWeek, tz),
    prevMonthKey: getMonthKey(lastDayOfPrevMonth, tz),
  };
}
