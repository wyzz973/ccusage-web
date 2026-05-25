import { describe, it, expect } from "vitest";
import { getTodayKey, getMonthKey, getISOWeekKey } from "../period-keys";

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

describe("getISOWeekKey", () => {
  it("matches the well-known ISO week for a mid-week date", () => {
    // 2026-05-25 (Mon) is in week 22 of 2026.
    expect(getISOWeekKey(new Date("2026-05-25T14:23:07Z"), "UTC")).toBe("2026-W22");
  });

  it("handles the year-boundary case (Jan 1 in previous year's last week)", () => {
    // 2027-01-01 is a Friday → ISO week 53 of 2026.
    expect(getISOWeekKey(new Date("2027-01-01T12:00:00Z"), "UTC")).toBe("2026-W53");
  });

  it("handles the year-boundary case (Dec 31 in next year's first week)", () => {
    // 2024-12-30 (Mon) is in ISO week 1 of 2025.
    expect(getISOWeekKey(new Date("2024-12-30T12:00:00Z"), "UTC")).toBe("2025-W01");
  });
});
