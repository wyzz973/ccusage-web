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
 * Monday of the current ISO week, in YYYY-MM-DD format.
 *
 * This matches ccusage's `weekly --json` `period` field exactly. Sunday
 * counts as the end of the *previous* week (ISO convention: weeks start
 * on Monday).
 */
export function getWeekStartKey(now: Date, tz: string): string {
  const { y, m, d } = getCalendarParts(now, tz);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Mon=0..Sun=6 → shift back to Monday.
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum);
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
