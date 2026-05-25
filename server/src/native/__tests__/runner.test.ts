import { describe, it, expect } from "vitest";
import { runNative, inferAgentFromPath } from "../runner";

// Two-file in-memory tree backed by a fake fs facade.
const FILE_A = "/u/.claude/projects/proj-a/sess-aaa.jsonl";
const FILE_B = "/u/.claude/projects/proj-b/sess-bbb.jsonl";

const CONTENT_A = [
  '{"timestamp":"2026-05-18T10:00:00Z","sessionId":"sa","requestId":"ra1","message":{"id":"ma1","model":"claude-haiku-4-5","usage":{"input_tokens":1000,"output_tokens":500}}}',
  '{"timestamp":"2026-05-18T11:00:00Z","sessionId":"sa","requestId":"ra2","message":{"id":"ma2","model":"claude-haiku-4-5","usage":{"input_tokens":2000,"output_tokens":1000}}}',
].join("\n");

const CONTENT_B = [
  '{"timestamp":"2026-05-19T09:00:00Z","sessionId":"sb","requestId":"rb1","message":{"id":"mb1","model":"claude-opus-4-7","usage":{"input_tokens":500,"output_tokens":250,"speed":"fast"}}}',
].join("\n");

const fakeFs = { readFileSync: (p: string) => p === FILE_A ? CONTENT_A : p === FILE_B ? CONTENT_B : "" };

describe("runNative — bucket shapes", () => {
  const opts = { files: [FILE_A, FILE_B], fs: fakeFs, tz: "UTC" as const, now: new Date("2026-05-19T12:00:00Z") };

  it("daily: groups by YYYY-MM-DD in target TZ", async () => {
    const out = await runNative<{ daily: { period: string; totalCost: number; totalTokens: number; metadata: { agents?: string[] } }[] }>("daily", opts);
    expect(out.daily.map((r) => r.period)).toEqual(["2026-05-18", "2026-05-19"]);
    // Each day's record carries the inferred agent in metadata.agents.
    expect(out.daily[0]?.metadata.agents).toEqual(["claude"]);
  });

  it("weekly: groups by Monday-anchored YYYY-MM-DD (matches ccusage)", async () => {
    // 2026-05-18 is Monday → both days fall in the week starting 2026-05-18.
    const out = await runNative<{ weekly: { period: string; totalCost: number }[] }>("weekly", opts);
    expect(out.weekly.map((r) => r.period)).toEqual(["2026-05-18"]);
    expect(out.weekly[0]?.totalCost).toBeGreaterThan(0);
  });

  it("monthly: groups by YYYY-MM", async () => {
    const out = await runNative<{ monthly: { period: string }[] }>("monthly", opts);
    expect(out.monthly.map((r) => r.period)).toEqual(["2026-05"]);
  });

  it("session: one record per file, period = sessionId-from-filename, agent inferred", async () => {
    const out = await runNative<{ session: { period: string; agent: string; metadata: { lastActivity?: string } }[] }>("session", opts);
    expect(out.session.map((r) => r.period).sort()).toEqual(["sess-aaa", "sess-bbb"]);
    for (const r of out.session) {
      expect(r.agent).toBe("claude");
      expect(r.metadata.lastActivity).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("blocks: emits at least one 5h window covering the cooked entries", async () => {
    const out = await runNative<{ blocks: { id: string; startTime: string; endTime: string; isActive: boolean; isGap: boolean }[] }>("blocks", opts);
    expect(out.blocks.length).toBeGreaterThan(0);
    expect(out.blocks.some((b) => !b.isGap)).toBe(true);
    // The active block should be the one containing `now` (2026-05-19T12:00:00Z).
    const active = out.blocks.find((b) => b.isActive);
    if (active) {
      const start = Date.parse(active.startTime);
      const end = Date.parse(active.endTime);
      expect(start).toBeLessThanOrEqual(opts.now.getTime());
      expect(end).toBeGreaterThan(opts.now.getTime());
    }
  });

  it("rejects unsupported commands", async () => {
    await expect(runNative("garbage", opts)).rejects.toThrow(/unsupported/);
  });
});

describe("inferAgentFromPath", () => {
  it("maps each well-known root to its agent slug", () => {
    expect(inferAgentFromPath("/u/.claude/projects/p/s.jsonl")).toBe("claude");
    expect(inferAgentFromPath("/u/.codex/projects/p/s.jsonl")).toBe("codex");
    expect(inferAgentFromPath("/u/.gemini/projects/p/s.jsonl")).toBe("gemini");
    expect(inferAgentFromPath("/u/.openclaw/projects/p/s.jsonl")).toBe("openclaw");
    expect(inferAgentFromPath("/u/.config/copilot/projects/p/s.jsonl")).toBe("copilot");
    expect(inferAgentFromPath("/tmp/random.jsonl")).toBe("unknown");
  });
});
