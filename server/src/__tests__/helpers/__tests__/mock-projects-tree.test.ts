// Self-tests for the shared `mockClaudeProjectsTree` helper.
//
// The helper is itself test infrastructure, but it has enough surface
// area (default cost shaping, file-content fabrication, fs facade,
// lex-sort guarantee) that a regression in the helper would silently
// invalidate every test that uses it. These guards keep that
// possibility narrow.

import { describe, it, expect } from "vitest";
import { mockClaudeProjectsTree } from "../mock-projects-tree";

describe("mockClaudeProjectsTree", () => {
  it("returns no files / empty bundles for an empty layout", () => {
    const t = mockClaudeProjectsTree({});
    expect(t.files).toEqual([]);
    expect(t.sessionRecords).toEqual([]);
    expect(t.sessionIdToProject.size).toBe(0);
    expect(t.discover()).toEqual([]);
  });

  it("builds <parent>/<encoded>/<sid>.jsonl paths in lex order", () => {
    const t = mockClaudeProjectsTree({
      "/u/.claude/projects": {
        "-z-second": ["sess-y", "sess-x"],
        "-a-first":  ["sess-b", "sess-a"],
      },
    });
    expect(t.files).toEqual([
      "/u/.claude/projects/-a-first/sess-a.jsonl",
      "/u/.claude/projects/-a-first/sess-b.jsonl",
      "/u/.claude/projects/-z-second/sess-x.jsonl",
      "/u/.claude/projects/-z-second/sess-y.jsonl",
    ]);
  });

  it("emits one real-shape session record per session, WITHOUT a project field", () => {
    const t = mockClaudeProjectsTree({
      "/u/.claude/projects": {
        "-Users-sd3-code-ccusage-web": ["sess-aaa"],
      },
    });
    expect(t.sessionRecords).toHaveLength(1);
    const r = t.sessionRecords[0]!;
    expect(r.period).toBe("sess-aaa");
    expect(r.project).toBeUndefined();   // ← the WHOLE POINT
    expect(r.agent).toBe("claude");
    expect(r.metadata?.lastActivity).toBeDefined();
  });

  it("pre-computes sessionId → encoded-project-dir map", () => {
    const t = mockClaudeProjectsTree({
      "/u/.claude/projects": {
        "-Users-sd3-code-ccusage-web": ["sess-aaa", "sess-bbb"],
        "-Users-sd3-code-react-router": ["sess-ccc"],
      },
    });
    expect(t.sessionIdToProject.get("sess-aaa")).toBe("-Users-sd3-code-ccusage-web");
    expect(t.sessionIdToProject.get("sess-bbb")).toBe("-Users-sd3-code-ccusage-web");
    expect(t.sessionIdToProject.get("sess-ccc")).toBe("-Users-sd3-code-react-router");
  });

  it("returns a fs facade that yields parseable JSONL for known files", () => {
    const t = mockClaudeProjectsTree({
      "/u/.claude/projects": {
        "-x-proj": ["sess-x"],
      },
    });
    const txt = t.fs.readFileSync(t.files[0]!, "utf8");
    expect(() => JSON.parse(txt)).not.toThrow();
    const parsed = JSON.parse(txt);
    expect(parsed.sessionId).toBe("sess-x");
    expect(parsed.timestamp).toMatch(/T/);
  });

  it("returns empty string for unknown paths in the fs facade", () => {
    const t = mockClaudeProjectsTree({});
    expect(t.fs.readFileSync("/not/in/tree.jsonl", "utf8")).toBe("");
  });

  it("respects the `agent` override (multi-agent path coverage)", () => {
    const t = mockClaudeProjectsTree(
      { "/u/.codex/projects": { "-x-proj": ["sess-c"] } },
      { agent: "codex" },
    );
    expect(t.sessionRecords[0]?.agent).toBe("codex");
  });

  it("uses deterministic default cost so tests don't flake on rebuild", () => {
    const a = mockClaudeProjectsTree({ "/p": { "-x": ["s1"] } });
    const b = mockClaudeProjectsTree({ "/p": { "-x": ["s1"] } });
    expect(a.sessionRecords[0]?.totalCost).toBe(b.sessionRecords[0]?.totalCost);
  });

  it("respects custom costFor", () => {
    const t = mockClaudeProjectsTree(
      { "/p": { "-x": ["s1", "s2"] } },
      { costFor: (id) => (id === "s1" ? 100 : 200) },
    );
    expect(t.sessionRecords.find((r) => r.period === "s1")?.totalCost).toBe(100);
    expect(t.sessionRecords.find((r) => r.period === "s2")?.totalCost).toBe(200);
  });

  it("discover() returns a fresh array each call (no aliasing surprises)", () => {
    const t = mockClaudeProjectsTree({ "/p": { "-x": ["s1"] } });
    const a = t.discover();
    a.push("garbage");
    expect(t.discover()).toEqual(t.files);
  });
});
