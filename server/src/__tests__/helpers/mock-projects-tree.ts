// R3 precursor — shared test infrastructure for asserting against
// **real-shape** ccusage data (not synthetic pre-stamped fixtures).
//
// ## Why this exists
//
// Both R1's bug-A (week/month aggregation) and R2's M-R2-1 (project
// pipeline empty in both modes) slipped because unit tests passed
// against synthetic fixtures that **pre-stamped** the field under test.
// The real producer (poller / loader / runner) never ran in the test,
// so the test couldn't catch the producer being a no-op against real
// ccusage `--json` output.
//
// `mockClaudeProjectsTree(layout)` builds a declarative file-system tree
// + matching real-shape ccusage session records + a `discover()` mock,
// so every PRD AC that asserts on data shape can plug in directly:
//
//   const tree = mockClaudeProjectsTree({
//     "/u/.claude/projects": {
//       "-Users-sd3-code-ccusage-web": ["sess-aaa", "sess-bbb"],
//       "-Users-sd3-code-react-router": ["sess-ccc"],
//     },
//   });
//   const map = buildSessionProjectMap({ discover: tree.discover });
//   const stamped = stampProjects(tree.sessionRecords, map);
//   // Now assert the real producer step actually ran.
//
// ## Per-poll caching convention (R2.2 carryover, R3 standardized)
//
// Anything that joins records against the filesystem (project map,
// future multi-agent root discovery, project-name normalization tables,
// …) should follow R2.2's `buildSessionProjectMap` shape: build ONCE at
// the top of `runOnce`, pass the cached structure into pure transforms
// downstream. Tests use the `discover` callback to inject a deterministic
// file list without touching the actual filesystem.

import * as path from "node:path";
import type { UsageRecord } from "../../types.js";

/**
 * Declarative layout. Top-level keys are *parent* directories (the
 * `~/.claude/projects` equivalent); nested keys are encoded project
 * directory names (`-Users-sd3-code-ccusage-web`); the array is the
 * list of session IDs (becomes `<sid>.jsonl` filenames).
 */
export interface ProjectsLayout {
  [parentDir: string]: {
    [encodedProjectDir: string]: string[];
  };
}

export interface SessionFixtureOptions {
  /**
   * Agent label stamped on the generated UsageRecord. Defaults to
   * `"claude"` (matches the most common Claude Code case). Tests that
   * exercise multi-agent paths can pass `"codex"` / `"gemini"` / etc.
   */
  agent?: string;
  /**
   * Per-session cost override. Defaults to a small deterministic value
   * derived from the sessionId so tests don't have to hand-craft.
   */
  costFor?: (sessionId: string) => number;
  /**
   * Per-session tokens override. Defaults to 1000.
   */
  tokensFor?: (sessionId: string) => number;
}

export interface MockedTree {
  /** Absolute file paths in lex order — what `discoverJsonlFiles()` would return. */
  files: string[];
  /** Drop-in for `discoverJsonlFiles` / `buildSessionProjectMap`'s `discover`. */
  discover: () => string[];
  /**
   * Real-shape ccusage session records — ONE per `<sid>.jsonl`. NO
   * `project` field (that's the point: the producer step has to fill it).
   * `period` = sessionId, matching ccusage's actual `--json` output.
   */
  sessionRecords: UsageRecord[];
  /**
   * Pre-computed `sessionId → encoded-project-dir-name` map. Useful when
   * tests want to bypass `buildSessionProjectMap` and pass an
   * already-built map directly into `stampProjects`.
   */
  sessionIdToProject: Map<string, string>;
  /**
   * Hand-roll JSONL content for any file in the tree. Returns empty
   * string for paths not in the layout. Plug into the native runner via
   * `runNative("session", { files: tree.files, fs: tree.fs, … })`.
   */
  fs: { readFileSync(p: string, enc: BufferEncoding): string };
}

const DEFAULT_TIMESTAMP = "2026-05-25T10:00:00Z";

function defaultCost(sessionId: string): number {
  // Small deterministic value, never zero, never identical across sessions:
  // sums the char codes (mod 1000) / 100. So `sess-aaa` → ~1.97, `sess-bbb` → ~1.99.
  let s = 0;
  for (let i = 0; i < sessionId.length; i++) s += sessionId.charCodeAt(i);
  return Number(((s % 1000) / 100 + 0.5).toFixed(2));
}

/**
 * Build a deterministic mocked Claude-Code projects tree for tests.
 *
 * The returned bundle gives every "join against the filesystem" test
 * what it needs: file paths for discover-mocks, real-shape session
 * records (no pre-stamped `project`), a pre-computed map for direct
 * assertion, and a `readFileSync` facade that returns a tiny one-line
 * JSONL fixture per file so the native runner has something to parse.
 */
export function mockClaudeProjectsTree(
  layout: ProjectsLayout,
  opts: SessionFixtureOptions = {},
): MockedTree {
  const files: string[] = [];
  const sessionRecords: UsageRecord[] = [];
  const sessionIdToProject = new Map<string, string>();
  const fileContents = new Map<string, string>();

  const agent = opts.agent ?? "claude";
  const costFor = opts.costFor ?? defaultCost;
  const tokensFor = opts.tokensFor ?? ((_: string): number => 1000);

  for (const parentDir of Object.keys(layout).sort()) {
    const projects = layout[parentDir]!;
    for (const encodedDir of Object.keys(projects).sort()) {
      const sessionIds = projects[encodedDir]!;
      for (const sid of sessionIds.slice().sort()) {
        const file = path.posix.join(parentDir, encodedDir, `${sid}.jsonl`);
        files.push(file);
        sessionIdToProject.set(sid, encodedDir);
        const cost = costFor(sid);
        const tokens = tokensFor(sid);
        // Real-shape session record: NO `project` field — matches what
        // ccusage's `session --json` actually emits.
        sessionRecords.push({
          period: sid,
          agent,
          totalTokens: tokens,
          totalCost: cost,
          inputTokens: Math.floor(tokens * 0.6),
          outputTokens: Math.floor(tokens * 0.4),
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelsUsed: ["claude-opus-4-7"],
          modelBreakdowns: [],
          metadata: { lastActivity: DEFAULT_TIMESTAMP },
        });
        // A tiny one-line JSONL the native parser will accept. The cost
        // computed by `calculateCost` for this content will NOT equal
        // `cost` above — that's fine; the native runner emits its own
        // costs from the JSONL content, while the `sessionRecords`
        // bundle here is for the ccusage-mode `stampProjects` join path.
        const jsonl = JSON.stringify({
          timestamp: DEFAULT_TIMESTAMP,
          version: "1.0.0",
          sessionId: sid,
          requestId: `r-${sid}`,
          message: {
            id: `m-${sid}`,
            model: "claude-opus-4-7",
            usage: {
              input_tokens: Math.floor(tokens * 0.6),
              output_tokens: Math.floor(tokens * 0.4),
            },
          },
        });
        fileContents.set(file, jsonl);
      }
    }
  }

  files.sort();

  return {
    files,
    discover: (): string[] => files.slice(),
    sessionRecords,
    sessionIdToProject,
    fs: {
      readFileSync: (p: string, _enc: BufferEncoding): string =>
        fileContents.get(p) ?? "",
    },
  };
}
