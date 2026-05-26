// Period-key helpers for `computeDerived`.
//
// All keys are produced in a caller-supplied IANA timezone (defaults
// to UTC at the call-site). Round-1 bug fix #3: `today`/`week`/`month`
// must roll over in the user's local TZ, not at 00:00 UTC.
//
// Key formats — chosen to match ccusage's `--json` bucket conventions
// (verified against live `~/.claude` output, Round-1.5 fix M-A1):
//   day   → YYYY-MM-DD                  (matches daily.records[i].period)
//   week  → YYYY-MM-DD (Monday-anchored) (matches weekly.records[i].period)
//   month → YYYY-MM                     (matches monthly.records[i].period)
//
// Round-1 returned `YYYY-Www` for `week`. That format never matched ccusage's
// Monday-anchored output, so `derived.week.cost` always summed to 0. The
// ISO-week-number form is kept as `getISOWeekNumberKey` for callers who
// genuinely need the W-format; `getWeekStartKey` is what `computeDerived`
// uses (and was renamed from the old `getISOWeekKey`).

function getCalendarParts(now: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string): number => {
    const p = parts.find((x) => x.type === t);
    return p ? Number(p.value) : 0;
  };
  return { y: get("year"), m: get("month"), d: get("day") };
}

export function getTodayKey(now: Date, tz: string): string {
  const { y, m, d } = getCalendarParts(now, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function getMonthKey(now: Date, tz: string): string {
  const { y, m } = getCalendarParts(now, tz);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Anchor day of the current week, in YYYY-MM-DD format.
 *
 * Default (ISO convention): Monday-anchored — matches ccusage's
 * `weekly --json` `period` field exactly. R3.2: caller can pass
 * `startOfWeek` to anchor the week on a different day; invalid values
 * fall back to Monday with a `console.warn`. Valid values:
 *   monday | tuesday | wednesday | thursday | friday | saturday | sunday
 *
 * Note: with `startOfWeek !== "monday"`, the returned key no longer
 * matches ccusage's emitted week buckets verbatim. Callers using the
 * week key as a filter for ccusage's weekly records should pass the
 * same `--start-of-week` flag to the binary (R3.2.AC4: D2 picker +
 * server flag must agree).
 */
export type StartOfWeek =
  | "monday" | "tuesday" | "wednesday" | "thursday"
  | "friday" | "saturday" | "sunday";

const VALID_START_OF_WEEK: ReadonlySet<StartOfWeek> = new Set<StartOfWeek>([
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
]);

const START_OF_WEEK_INDEX: Record<StartOfWeek, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

export function getWeekStartKey(now: Date, tz: string, startOfWeek: StartOfWeek = "monday"): string {
  let sow: StartOfWeek = startOfWeek;
  if (!VALID_START_OF_WEEK.has(sow)) {
    console.warn(`[ccusage-web/period-keys] invalid startOfWeek=${JSON.stringify(startOfWeek)}; falling back to monday`);
    sow = "monday";
  }
  const { y, m, d } = getCalendarParts(now, tz);
  const date = new Date(Date.UTC(y, m - 1, d));
  // JS getUTCDay: Sun=0..Sat=6. Normalize to Mon=0..Sun=6.
  const monBased = (date.getUTCDay() + 6) % 7;
  // Subtract enough to land on the configured start-of-week anchor.
  // Example: sow="wednesday" → index 2 → if today is Friday (monBased=4),
  // delta=4-2=2 → anchor on Wednesday.
  const sowIndex = START_OF_WEEK_INDEX[sow];
  let delta = monBased - sowIndex;
  if (delta < 0) delta += 7;
  date.setUTCDate(date.getUTCDate() - delta);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * ISO-8601 week-number key (`YYYY-Www`). Retained for any caller that
 * genuinely needs the W-format; **not** used by `computeDerived`, which
 * needs the Monday-anchored YYYY-MM-DD form to match ccusage's output.
 */
export function getISOWeekNumberKey(now: Date, tz: string): string {
  const { y, m, d } = getCalendarParts(now, tz);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThuDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThuDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * @deprecated Renamed to `getWeekStartKey` after Round-1.5 fix M-A1. Kept
 * as an alias for the ISO-week-number variant so callers don't silently
 * regress; new code should use `getWeekStartKey` for ccusage parity.
 */
export const getISOWeekKey = getISOWeekNumberKey;
