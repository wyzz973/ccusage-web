import { describe, it, expect, vi } from "vitest";
import {
  getTodayKey, getMonthKey,
  getWeekStartKey, getISOWeekNumberKey,
  getISOWeekKey,
} from "../period-keys";

describe("getTodayKey", () => {
  it("returns UTC day key by default", () => {
    expect(getTodayKey(new Date("2026-05-25T14:23:07Z"), "UTC")).toBe("2026-05-25");
  });

  it("rolls over at the local TZ midnight, not UTC midnight (bug fix #3)", () => {
    // 07:00 UTC = 00:00 PDT (UTC-7). Local day is 2026-05-25.
    expect(getTodayKey(new Date("2026-05-25T07:00:00Z"), "America/Los_Angeles")).toBe("2026-05-25");
    // 06:00 UTC = 23:00 PDT on the 24th (UTC-7).
    expect(getTodayKey(new Date("2026-05-25T06:00:00Z"), "America/Los_Angeles")).toBe("2026-05-24");
  });

  it("handles Asia/Tokyo (UTC+9) correctly", () => {
    // 15:00 UTC = 00:00 JST next day.
    expect(getTodayKey(new Date("2026-05-25T15:00:00Z"), "Asia/Tokyo")).toBe("2026-05-26");
  });

  it("pads single-digit month and day", () => {
    expect(getTodayKey(new Date("2026-01-05T12:00:00Z"), "UTC")).toBe("2026-01-05");
  });
});

describe("getMonthKey", () => {
  it("returns YYYY-MM in target TZ", () => {
    expect(getMonthKey(new Date("2026-05-25T14:23:07Z"), "UTC")).toBe("2026-05");
    // First of June UTC, but still May 31 in LA.
    expect(getMonthKey(new Date("2026-06-01T05:00:00Z"), "America/Los_Angeles")).toBe("2026-05");
  });
});

describe("getWeekStartKey (M-A1: Monday-anchored YYYY-MM-DD, matches ccusage weekly)", () => {
  it("returns the Monday of the week containing a Monday", () => {
    // 2026-05-18 IS a Monday.
    expect(getWeekStartKey(new Date("2026-05-18T12:00:00Z"), "UTC")).toBe("2026-05-18");
  });

  it("returns the same Monday for a Wednesday in that week", () => {
    // 2026-05-20 (Wed) → Mon = 2026-05-18.
    expect(getWeekStartKey(new Date("2026-05-20T12:00:00Z"), "UTC")).toBe("2026-05-18");
  });

  it("returns the Monday for a Sunday at the end of the week", () => {
    // 2026-05-24 (Sun) → still belongs to week starting 2026-05-18.
    expect(getWeekStartKey(new Date("2026-05-24T23:59:00Z"), "UTC")).toBe("2026-05-18");
  });

  it("crosses month boundaries cleanly", () => {
    // 2026-06-01 (Mon) is its own week.
    expect(getWeekStartKey(new Date("2026-06-01T12:00:00Z"), "UTC")).toBe("2026-06-01");
    // 2026-05-31 (Sun) belongs to the week starting 2026-05-25 (Mon).
    expect(getWeekStartKey(new Date("2026-05-31T12:00:00Z"), "UTC")).toBe("2026-05-25");
  });

  it("honors the target TZ when rolling over local midnight", () => {
    // 2026-05-25T06:00:00Z = 23:00 PDT on 2026-05-24 (Sun) → Monday is 2026-05-18.
    expect(getWeekStartKey(new Date("2026-05-25T06:00:00Z"), "America/Los_Angeles")).toBe("2026-05-18");
  });
});

describe("getISOWeekNumberKey (legacy YYYY-Www; not used by computeDerived)", () => {
  it("matches the well-known ISO week for a mid-week date", () => {
    expect(getISOWeekNumberKey(new Date("2026-05-25T14:23:07Z"), "UTC")).toBe("2026-W22");
  });

  it("handles the year-boundary case (Jan 1 in previous year's last week)", () => {
    expect(getISOWeekNumberKey(new Date("2027-01-01T12:00:00Z"), "UTC")).toBe("2026-W53");
  });

  it("handles the year-boundary case (Dec 31 in next year's first week)", () => {
    expect(getISOWeekNumberKey(new Date("2024-12-30T12:00:00Z"), "UTC")).toBe("2025-W01");
  });

  it("getISOWeekKey alias is preserved for back-compat", () => {
    expect(getISOWeekKey).toBe(getISOWeekNumberKey);
  });
});

// R3.2 — startOfWeek honoring (PRD v3 §1 R3.2.AC1–AC3).
describe("getWeekStartKey · startOfWeek anchor (R3.2)", () => {
  // 2026-05-20 is a Wednesday. The expected anchor for each
  // startOfWeek value, derived by walking back from Wed.
  const cases: Array<[string, string]> = [
    ["monday",    "2026-05-18"], // back 2 days
    ["tuesday",   "2026-05-19"], // back 1 day
    ["wednesday", "2026-05-20"], // same day
    ["thursday",  "2026-05-14"], // back 6 days
    ["friday",    "2026-05-15"], // back 5 days
    ["saturday",  "2026-05-16"], // back 4 days
    ["sunday",    "2026-05-17"], // back 3 days
  ];
  it.each(cases)("Wednesday 2026-05-20 with startOfWeek=%s → %s", (sow, expected) => {
    expect(getWeekStartKey(new Date("2026-05-20T12:00:00Z"), "UTC", sow as never)).toBe(expected);
  });

  it("invalid startOfWeek falls back to monday with console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(getWeekStartKey(new Date("2026-05-20T12:00:00Z"), "UTC", "funday" as never)).toBe("2026-05-18");
      expect(warnSpy).toHaveBeenCalled();
      expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toMatch(/invalid startOfWeek/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("DST transition (spring forward): startOfWeek=sunday picks correct Sunday in America/Los_Angeles", () => {
    // 2026-03-10 was a Tuesday. DST in LA fires Sunday 2026-03-08 at 02:00.
    // startOfWeek=sunday on the Tuesday → anchor Sunday 2026-03-08.
    expect(getWeekStartKey(new Date("2026-03-10T20:00:00Z"), "America/Los_Angeles", "sunday")).toBe("2026-03-08");
  });

  it("year boundary: startOfWeek=monday on Jan 1 2027 picks Mon 2026-12-28", () => {
    expect(getWeekStartKey(new Date("2027-01-01T12:00:00Z"), "UTC", "monday")).toBe("2026-12-28");
  });
});
