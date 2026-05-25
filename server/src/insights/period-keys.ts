// Period-key helpers for `computeDerived`.
//
// All keys are produced in a caller-supplied IANA timezone (defaults
// to UTC at the call-site). Round-1 bug fix #3: `today`/`week`/`month`
// must roll over in the user's local TZ, not at 00:00 UTC.
//
// Key formats — chosen to match ccusage's `--json` bucket conventions:
//   day   → YYYY-MM-DD                  (matches daily.records[i].period)
//   week  → YYYY-Www  (ISO-8601 week)   (matches weekly.records[i].period)
//   month → YYYY-MM                     (matches monthly.records[i].period)

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

// ISO-8601 week key: YYYY-Www. The year part is the *ISO* year (the year
// containing the Thursday of the week), which can differ from the calendar
// year for the first/last few days of January/December.
export function getISOWeekKey(now: Date, tz: string): string {
  const { y, m, d } = getCalendarParts(now, tz);
  // Anchor a UTC midnight at the local calendar day; arithmetic below is
  // independent of TZ once we have y/m/d in that TZ.
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // shift to Thursday
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstThuDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThuDayNum + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
