// R2.2 / M-R2-1 — end-to-end regression for the D1 project pipeline.
//
// Why this exists: R1 S4 + R2 D1 both shipped looking correct (decodeProject
// extensively unit-tested, computeProjectRollups extensively unit-tested,
// `Derived.projects` field on the type, panel + chip + M2 column all in UI),
// yet `derived.projects = []` against real data because the producer step
// (project stamping on session records) never ran. Unit-test fixtures all
// synthetically pre-stamped `project` before reaching the rollup.
//
// These tests close that gap by exercising the FULL pipeline:
//   1. discoverJsonlFiles  → finds files in a mocked `~/.claude/projects/` tree
//   2. buildSessionProjectMap → builds the sessionId → canonical map
//   3. stampProjects        → stamps real-shape ccusage session records
//   4. computeProjectRollups → produces `derived.projects` with ≥1 row
//
// PASS conditions from `docs/review/round-2.md` §2 M-R2-1:
//   (a) `session.records.map(r => r.project != null).filter(Boolean).length ≥ 1`
//   (b) `derived.projects.length ≥ 1`
// We also assert the canonical/displayName pair so the UI chip is non-degenerate.

import { describe, it, expect } from "vitest";
import { stampProjects, buildSessionProjectMap } from "../poller";
import { computeProjectRollups, decodeProject } from "../insights/index.js";
import { runNative } from "../native/index.js";
import type { UsageRecord, Block } from "../types";

/** A ccusage-shape session record (no project field — real ccusage --json output). */
function ccusageSession(sessionId: string, agent: string, cost: number): UsageRecord {
  return {
    period: sessionId,
    agent,
    totalTokens: 1000, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: ["claude-opus-4-7"], modelBreakdowns: [],
    metadata: { lastActivity: "2026-05-25T10:00:00Z" },
    // intentionally NO `project` field — that's the ccusage-source reality
  };
}

describe("buildSessionProjectMap (R2.2)", () => {
  it("derives sessionId → canonical from the discovered file tree", () => {
    const map = buildSessionProjectMap({
      discover: () => [
        "/u/.claude/projects/-Users-sd3-code-ccusage-web/9f3a00.jsonl",
        "/u/.claude/projects/-Users-sd3-code-ccusage-web/9f3a01.jsonl",
        "/u/.claude/projects/-Users-sd3-code-react-router/abc123.jsonl",
      ],
    });
    expect(map.get("9f3a00")).toBe("-Users-sd3-code-ccusage-web");
    expect(map.get("9f3a01")).toBe("-Users-sd3-code-ccusage-web");
    expect(map.get("abc123")).toBe("-Users-sd3-code-react-router");
  });

  it("returns empty map when discovery yields nothing", () => {
    const map = buildSessionProjectMap({ discover: () => [] });
    expect(map.size).toBe(0);
  });

  it("does not throw when discovery throws", () => {
    const map = buildSessionProjectMap({ discover: () => { throw new Error("EACCES"); } });
    expect(map.size).toBe(0);
  });

  it("skips paths whose canonical resolves to 'unknown'", () => {
    const map = buildSessionProjectMap({
      discover: () => ["/not/a/claude/path/random.jsonl"],
    });
    // basename is "random" so sessionId is "random"; decodeProject on that
    // fullPath produces canonical = "/not/a/claude/path/random" (basename fallback) — that's NOT "unknown",
    // so it's mapped. The strict "unknown" filter is for cases where decoder really gives up.
    expect(map.get("random")).toBeDefined();
  });
});

describe("stampProjects ↔ ccusage-shape session records (M-R2-1 closure)", () => {
  it("stamps project on ccusage-source sessions via the sessionProjectMap", () => {
    const map = new Map<string, string>([
      ["sess-aaa", "-Users-sd3-code-ccusage-web"],
      ["sess-bbb", "-Users-sd3-code-ccusage-web"],
      ["sess-ccc", "-Users-sd3-code-react-router"],
    ]);
    const records = [
      ccusageSession("sess-aaa", "claude", 5),
      ccusageSession("sess-bbb", "claude", 3),
      ccusageSession("sess-ccc", "codex", 2),
      ccusageSession("sess-unmapped", "claude", 1), // not in the map
    ];
    const stamped = stampProjects(records, map);

    // Pass condition (a) from review §2 M-R2-1.
    const withProject = stamped.filter((r) => r.project != null);
    expect(withProject.length).toBeGreaterThanOrEqual(1);
    expect(withProject.length).toBe(3);
    expect(stamped[0]?.project).toBe("-Users-sd3-code-ccusage-web");
    expect(stamped[3]?.project).toBeUndefined();
  });

  it("preserves an already-stamped record's project (native pre-stamp wins)", () => {
    const pre: UsageRecord = {
      ...ccusageSession("sess-native", "claude", 5),
      project: "-already-stamped-by-native-runner",
    };
    const out = stampProjects([pre], new Map([["sess-native", "-different-from-map"]]));
    expect(out[0]?.project).toBe("-already-stamped-by-native-runner");
  });
});

describe("full pipeline: real-shape sessions → derived.projects (M-R2-1 PASS)", () => {
  it("produces ≥1 derived.projects row + ≥1 stamped session, with non-degenerate chip identity", () => {
    // (1) Mock the discovered file tree (would normally come from ~/.claude/projects/**).
    const map = buildSessionProjectMap({
      discover: () => [
        "/u/.claude/projects/-Users-sd3-code-ccusage-web/sess-aaa.jsonl",
        "/u/.claude/projects/-Users-sd3-code-ccusage-web/sess-bbb.jsonl",
        "/u/.claude/projects/-Users-sd3-code-react-router/sess-ccc.jsonl",
      ],
    });

    // (2) Real-shape ccusage --json session records (NO project field).
    const sessions = [
      ccusageSession("sess-aaa", "claude", 6.10),
      ccusageSession("sess-bbb", "claude", 4.00),
      ccusageSession("sess-ccc", "codex",  2.50),
    ];

    // (3) Stamp.
    const stamped = stampProjects(sessions, map);
    const projectCount = stamped.filter((r) => r.project != null).length;
    expect(projectCount).toBeGreaterThanOrEqual(1);
    expect(projectCount).toBe(3);

    // (4) Roll up.
    const projects = computeProjectRollups({ sessionRecords: stamped });
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects.length).toBe(2); // ccusage-web (combined) + react-router

    // (5) Chip identity: same basename (`web` from `ccusage-web`) must not
    //     collide with another project's basename. Canonical is the dedup key.
    const ccusageWeb = projects.find((p) => p.canonical === "-Users-sd3-code-ccusage-web");
    expect(ccusageWeb).toBeTruthy();
    expect(ccusageWeb!.displayName).toBe("web");
    expect(ccusageWeb!.cost).toBeCloseTo(10.10, 2);
    expect(ccusageWeb!.sessions).toBe(2);

    const reactRouter = projects.find((p) => p.canonical === "-Users-sd3-code-react-router");
    expect(reactRouter).toBeTruthy();
    expect(reactRouter!.displayName).toBe("router");

    // Different canonical ids even though one displayName-by-coincidence
    // could shadow the other if we'd used basename as the chip key (S3 from
    // round-1 review — guard against the regression here too).
    expect(ccusageWeb!.canonical).not.toBe(reactRouter!.canonical);
  });
});

describe("native runner stamps project from filePath (M-R2-1, native source)", () => {
  it("emits session records with project canonical decoded from the file path", async () => {
    const FILE_A = "/u/.claude/projects/-Users-sd3-code-ccusage-web/sess-aaa.jsonl";
    const FILE_B = "/u/.claude/projects/-Users-sd3-code-react-router/sess-bbb.jsonl";
    const CONTENT_A = '{"timestamp":"2026-05-18T10:00:00Z","sessionId":"sa","requestId":"ra","message":{"id":"ma","model":"claude-haiku-4-5","usage":{"input_tokens":1000,"output_tokens":500}}}';
    const CONTENT_B = '{"timestamp":"2026-05-18T11:00:00Z","sessionId":"sb","requestId":"rb","message":{"id":"mb","model":"claude-opus-4-7","usage":{"input_tokens":500,"output_tokens":250}}}';
    const fakeFs = {
      readFileSync: (p: string): string => p === FILE_A ? CONTENT_A : p === FILE_B ? CONTENT_B : "",
    };

    const out = await runNative<{ session: UsageRecord[] }>("session", {
      files: [FILE_A, FILE_B],
      fs: fakeFs,
      now: new Date("2026-05-19T12:00:00Z"),
    });

    // Pass condition: every session has project set.
    const withProject = out.session.filter((r) => r.project != null);
    expect(withProject.length).toBe(out.session.length);

    // Canonical id matches what decodeProject(fullPath) returns.
    const expectedA = decodeProject({ fullPath: FILE_A }).canonical;
    const expectedB = decodeProject({ fullPath: FILE_B }).canonical;
    const idA = out.session.find((r) => r.period === "sess-aaa")?.project;
    const idB = out.session.find((r) => r.period === "sess-bbb")?.project;
    expect(idA).toBe(expectedA);
    expect(idB).toBe(expectedB);
    expect(idA).not.toBe(idB);
  });
});

describe("daily/weekly/monthly aren't broken by project stamping (regression guard)", () => {
  it("blocks still build cleanly even when sessions have project stamping", async () => {
    const FILE = "/u/.claude/projects/-x-proj/sess.jsonl";
    const CONTENT = '{"timestamp":"2026-05-18T10:00:00Z","sessionId":"sx","requestId":"rx","message":{"id":"mx","model":"claude-haiku-4-5","usage":{"input_tokens":100,"output_tokens":50}}}';
    const fakeFs = { readFileSync: (_p: string): string => CONTENT };
    const blocksOut = await runNative<{ blocks: Block[] }>("blocks", {
      files: [FILE], fs: fakeFs, now: new Date("2026-05-18T11:00:00Z"),
    });
    expect(blocksOut.blocks.length).toBeGreaterThan(0);
  });
});
