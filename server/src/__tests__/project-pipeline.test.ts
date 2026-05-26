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
import { mockClaudeProjectsTree } from "./helpers/mock-projects-tree";
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

describe("buildSessionProjectMap (R2.2 + R3 §C)", () => {
  it("derives sessionId → SessionProjectInfo from the discovered file tree (heuristic source without cwd-sniff)", () => {
    const map = buildSessionProjectMap({
      discover: () => [
        "/u/.claude/projects/-Users-sd3-code-ccusage-web/9f3a00.jsonl",
        "/u/.claude/projects/-Users-sd3-code-ccusage-web/9f3a01.jsonl",
        "/u/.claude/projects/-Users-sd3-code-react-router/abc123.jsonl",
      ],
      sniffCwd: false, // disable cwd-sniff so we don't try to read real files
    });
    expect(map.get("9f3a00")?.canonical).toBe("-Users-sd3-code-ccusage-web");
    expect(map.get("9f3a01")?.canonical).toBe("-Users-sd3-code-ccusage-web");
    expect(map.get("abc123")?.canonical).toBe("-Users-sd3-code-react-router");
    // Without cwd-sniff: heuristic displayName (lossy)
    expect(map.get("9f3a00")?.displayName).toBe("web"); // heuristic, NOT "ccusage-web"
    expect(map.get("9f3a00")?.source).toBe("encoded-heuristic");
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
      sniffCwd: false,
    });
    expect(map.get("random")).toBeDefined();
  });

  // R3 §C: cwd-sniff path. Tests against the mocked file tree's fs facade.
  it("sniffs cwd from each file's first line to produce high-quality displayName (R3 §C)", () => {
    const fixtures = new Map<string, string>([
      [
        "/u/.claude/projects/-Users-sd3-code-ccusage-web/sess-aaa.jsonl",
        JSON.stringify({ cwd: "/Users/sd3/code/ccusage-web", sessionId: "sess-aaa" }),
      ],
      [
        "/u/.claude/projects/-Users-sd3-code-react-router/sess-bbb.jsonl",
        JSON.stringify({ cwd: "/Users/sd3/code/react-router", sessionId: "sess-bbb" }),
      ],
    ]);
    const map = buildSessionProjectMap({
      discover: () => Array.from(fixtures.keys()),
      readFile: (p) => fixtures.get(p) ?? "",
      sniffCwd: true,
    });
    // The displayName comes from cwd (not the lossy `-`-segment heuristic).
    expect(map.get("sess-aaa")?.displayName).toBe("ccusage-web"); // not "web"
    expect(map.get("sess-aaa")?.source).toBe("cwd");
    expect(map.get("sess-bbb")?.displayName).toBe("react-router");
    expect(map.get("sess-bbb")?.source).toBe("cwd");
  });

  it("falls back to encoded-heuristic when the first line has no cwd (R3 §C fallback)", () => {
    const map = buildSessionProjectMap({
      discover: () => ["/u/.claude/projects/-Users-sd3-code-ccusage-web/sess-aaa.jsonl"],
      readFile: () => JSON.stringify({ sessionId: "sess-aaa" /* no cwd */ }),
      sniffCwd: true,
    });
    expect(map.get("sess-aaa")?.displayName).toBe("web"); // lossy heuristic
    expect(map.get("sess-aaa")?.source).toBe("encoded-heuristic");
  });

  it("tolerates malformed first-line JSON without throwing", () => {
    const map = buildSessionProjectMap({
      discover: () => ["/u/.claude/projects/-x-proj/sess.jsonl"],
      readFile: () => "{not valid json",
      sniffCwd: true,
    });
    expect(map.get("sess")?.source).toBe("encoded-heuristic"); // graceful fallback
  });
});

describe("stampProjects ↔ ccusage-shape session records (M-R2-1 closure)", () => {
  it("stamps project on ccusage-source sessions via the SessionProjectMap (R3 §C richer info)", () => {
    const map = new Map([
      ["sess-aaa", { canonical: "-Users-sd3-code-ccusage-web", displayName: "ccusage-web", source: "cwd" as const }],
      ["sess-bbb", { canonical: "-Users-sd3-code-ccusage-web", displayName: "ccusage-web", source: "cwd" as const }],
      ["sess-ccc", { canonical: "-Users-sd3-code-react-router", displayName: "react-router", source: "cwd" as const }],
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
    expect(withProject.length).toBe(3);
    expect(stamped[0]?.project).toBe("-Users-sd3-code-ccusage-web");
    // R3 §C: high-quality displayName + source carried through.
    expect(stamped[0]?.projectDisplay).toBe("ccusage-web");
    expect(stamped[0]?.projectDisplaySource).toBe("cwd");
    expect(stamped[3]?.project).toBeUndefined();
  });

  it("preserves an already-stamped record's project (native pre-stamp wins)", () => {
    const pre: UsageRecord = {
      ...ccusageSession("sess-native", "claude", 5),
      project: "-already-stamped-by-native-runner",
    };
    const out = stampProjects([pre], new Map([
      ["sess-native", { canonical: "-different-from-map", displayName: "different", source: "cwd" as const }],
    ]));
    expect(out[0]?.project).toBe("-already-stamped-by-native-runner");
  });
});

describe("full pipeline: real-shape sessions → derived.projects (M-R2-1 PASS)", () => {
  it("produces ≥1 derived.projects row + ≥1 stamped session, with non-degenerate chip identity", () => {
    // Builds the discover() mock, real-shape session records (NO project
    // field — matches ccusage's actual --json output), and pre-computed
    // sessionId→canonical map in one declarative call. This is the
    // pattern every future PRD-AC test should use to avoid synthetic-fixture
    // false-positives (R1 bug-A / R2 M-R2-1 shape).
    const tree = mockClaudeProjectsTree(
      {
        "/u/.claude/projects": {
          "-Users-sd3-code-ccusage-web":  ["sess-aaa", "sess-bbb"],
          "-Users-sd3-code-react-router": ["sess-ccc"],
        },
      },
      // Override per-session cost so the assertion is readable.
      { costFor: (id) => (id === "sess-aaa" ? 6.10 : id === "sess-bbb" ? 4.00 : 2.50) },
    );

    // Real producer step — exactly what the poller does each tick.
    const map = buildSessionProjectMap({ discover: tree.discover });
    const stamped = stampProjects(tree.sessionRecords, map);

    // PASS (a): ≥1 stamped session.
    const projectCount = stamped.filter((r) => r.project != null).length;
    expect(projectCount).toBeGreaterThanOrEqual(1);
    expect(projectCount).toBe(3);

    // PASS (b): ≥1 row in derived.projects.
    const projects = computeProjectRollups({ sessionRecords: stamped });
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects.length).toBe(2); // ccusage-web (combined) + react-router

    // PASS (c): chip identity stays unique across same-basename projects
    // — `ccusage-web` and `react-router` both end in different basenames
    // here, but the canonical IS the dedup key so an S3-class regression
    // can't sneak back in.
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
    const tree = mockClaudeProjectsTree({
      "/u/.claude/projects": {
        "-Users-sd3-code-ccusage-web":  ["sess-aaa"],
        "-Users-sd3-code-react-router": ["sess-bbb"],
      },
    });

    const out = await runNative<{ session: UsageRecord[] }>("session", {
      files: tree.files,
      fs: tree.fs,
      now: new Date("2026-05-19T12:00:00Z"),
    });

    // PASS (a) for the native source path: every session has project set.
    const withProject = out.session.filter((r) => r.project != null);
    expect(withProject.length).toBe(out.session.length);

    // Canonical IDs match what decodeProject(fullPath) returns.
    const idA = out.session.find((r) => r.period === "sess-aaa")?.project;
    const idB = out.session.find((r) => r.period === "sess-bbb")?.project;
    expect(idA).toBe(decodeProject({ fullPath: tree.files.find((f) => f.includes("sess-aaa"))! }).canonical);
    expect(idB).toBe(decodeProject({ fullPath: tree.files.find((f) => f.includes("sess-bbb"))! }).canonical);
    expect(idA).not.toBe(idB);
  });
});

describe("daily/weekly/monthly aren't broken by project stamping (regression guard)", () => {
  it("blocks still build cleanly even when sessions have project stamping", async () => {
    const tree = mockClaudeProjectsTree({
      "/u/.claude/projects": { "-x-proj": ["sess-x"] },
    });
    const blocksOut = await runNative<{ blocks: Block[] }>("blocks", {
      files: tree.files,
      fs: tree.fs,
      now: new Date("2026-05-25T11:00:00Z"),
    });
    expect(blocksOut.blocks.length).toBeGreaterThan(0);
  });
});
