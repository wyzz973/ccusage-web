import { describe, it, expect } from "vitest";
import { formatDelta, formatPct } from "@/views/v1/lib/format";

describe("formatDelta", () => {
  it("returns 'no prior data' for null pct", () => {
    expect(formatDelta(null)).toMatchObject({ text: "no prior data", tone: "info" });
  });

  it("returns ≈ neutral when |pct| < 2 %", () => {
    expect(formatDelta(0.01)).toMatchObject({ text: "≈", tone: "neutral" });
    expect(formatDelta(-0.015)).toMatchObject({ text: "≈", tone: "neutral" });
  });

  it("uses relative percent for moderate deltas with bad-on-rise default valence", () => {
    expect(formatDelta(0.23)).toMatchObject({ text: "▲ 23%", tone: "bad" });
    expect(formatDelta(-0.18)).toMatchObject({ text: "▼ 18%", tone: "good" });
  });

  it("inverts valence when inverted=true (activity cards)", () => {
    expect(formatDelta(0.10, { inverted: true })).toMatchObject({ tone: "good" });
    expect(formatDelta(-0.20, { inverted: true })).toMatchObject({ tone: "bad" });
  });

  it("falls back to absolute amount when |pct| ≥ 1000 %", () => {
    expect(formatDelta(15, { absoluteFallback: 11.2, absoluteFormat: "cost" }).text).toMatch(/\$11/);
    expect(formatDelta(15, { absoluteFallback: 1234, absoluteFormat: "number" }).text).toMatch(/1,234/);
  });
});

describe("formatPct", () => {
  it("rounds and appends %", () => {
    expect(formatPct(0.234)).toBe("23%");
    expect(formatPct(0.234, 1)).toBe("23.4%");
  });

  it("returns — for non-finite", () => {
    expect(formatPct(Number.NaN)).toBe("—");
  });
});
