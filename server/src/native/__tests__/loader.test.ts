import { describe, it, expect } from "vitest";
import { loadJsonlContent, loadJsonlFiles } from "../loader";
import { createPricing } from "../pricing";

const pricing = createPricing();

describe("loadJsonlContent", () => {
  it("returns zero totals for empty input", () => {
    const out = loadJsonlContent("", { pricing });
    expect(out.entries).toEqual([]);
    expect(out.totals.totalCostUSD).toBe(0);
    expect(out.totals.totalTokens).toBe(0);
    expect(out.totals.modelBreakdowns).toEqual([]);
  });

  it("tolerates blank lines and trailing whitespace", () => {
    const text = [
      "",
      '{"timestamp":"2026-05-01T10:00:00Z","sessionId":"s","requestId":"r","message":{"id":"m","model":"claude-haiku-4-5","usage":{"input_tokens":1000,"output_tokens":500}}}',
      "  ",
      "",
    ].join("\n");
    const out = loadJsonlContent(text, { pricing });
    expect(out.entries).toHaveLength(1);
    expect(out.totals.totalTokens).toBe(1500);
  });

  it("sorts modelBreakdowns by descending cost", () => {
    const text = [
      '{"timestamp":"2026-05-01T10:00:00Z","sessionId":"s","requestId":"r1","message":{"id":"m1","model":"claude-haiku-4-5","usage":{"input_tokens":1,"output_tokens":1}}}',
      '{"timestamp":"2026-05-01T10:00:01Z","sessionId":"s","requestId":"r2","message":{"id":"m2","model":"claude-opus-4-7","usage":{"input_tokens":1000,"output_tokens":500}}}',
    ].join("\n");
    const out = loadJsonlContent(text, { pricing });
    expect(out.totals.modelBreakdowns.map((m) => m.modelName)).toEqual([
      "claude-opus-4-7",
      "claude-haiku-4-5",
    ]);
  });

  it("dedups cross-line (same messageId+requestId)", () => {
    const text = [
      '{"timestamp":"2026-05-01T10:00:00Z","sessionId":"s","requestId":"R","message":{"id":"D","model":"claude-haiku-4-5","usage":{"input_tokens":100,"output_tokens":50}}}',
      '{"timestamp":"2026-05-01T10:00:01Z","sessionId":"s","requestId":"R","message":{"id":"D","model":"claude-haiku-4-5","usage":{"input_tokens":200,"output_tokens":100}}}',
    ].join("\n");
    const out = loadJsonlContent(text, { pricing });
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]?.totalTokens).toBe(300);
  });

  it("counts synthetic-model tokens in totals but omits from modelBreakdowns", () => {
    const text =
      '{"timestamp":"2026-05-01T10:00:00Z","sessionId":"s","requestId":"r","message":{"id":"m","model":"<synthetic>","usage":{"input_tokens":1000,"output_tokens":500}}}';
    const out = loadJsonlContent(text, { pricing });
    expect(out.totals.totalTokens).toBe(1500);
    expect(out.totals.modelBreakdowns).toEqual([]);
    expect(out.totals.totalCostUSD).toBe(0);
  });
});

describe("loadJsonlFiles", () => {
  it("skips unreadable files without throwing", () => {
    const out = loadJsonlFiles(["/does/not/exist.jsonl"], { pricing });
    expect(out.entries).toEqual([]);
    expect(out.totals.totalCostUSD).toBe(0);
  });
});
