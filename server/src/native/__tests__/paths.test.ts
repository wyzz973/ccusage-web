import { describe, it, expect } from "vitest";
import * as path from "node:path";
import type { Dirent } from "node:fs";
import { discoverRoots, discoverJsonlFiles } from "../paths";

// In-memory fake fs implementation for tests.
function makeFs(tree: Record<string, "dir" | "file">) {
  return {
    existsSync(p: string) { return p in tree; },
    statSync(p: string) {
      return { isDirectory: () => tree[p] === "dir" };
    },
    readdirSync(p: string, opts?: { withFileTypes?: boolean }) {
      const prefix = p.endsWith(path.sep) ? p : p + path.sep;
      const names: string[] = [];
      for (const full of Object.keys(tree)) {
        if (!full.startsWith(prefix)) continue;
        const rest = full.slice(prefix.length);
        if (rest.includes(path.sep)) continue;
        names.push(rest);
      }
      if (opts?.withFileTypes) {
        return names.map((name) => ({
          name,
          isDirectory: () => tree[path.join(p, name)] === "dir",
          isFile: () => tree[path.join(p, name)] === "file",
        })) as unknown as Dirent[];
      }
      return names;
    },
  };
}

describe("discoverRoots", () => {
  it("returns ~/.claude when projects/ exists there", () => {
    const home = "/u/alice";
    const tree = {
      [`${home}/.claude`]: "dir" as const,
      [`${home}/.claude/projects`]: "dir" as const,
    };
    const out = discoverRoots({ env: {}, home, fs: makeFs(tree) });
    expect(out).toEqual([`${home}/.claude`]);
  });

  it("returns empty when projects/ is missing", () => {
    const home = "/u/alice";
    const tree = { [`${home}/.claude`]: "dir" as const };
    const out = discoverRoots({ env: {}, home, fs: makeFs(tree) });
    expect(out).toEqual([]);
  });

  it("honors CLAUDE_CONFIG_DIR (comma-split, dedup)", () => {
    const tree = {
      "/a": "dir" as const, "/a/projects": "dir" as const,
      "/b": "dir" as const, "/b/projects": "dir" as const,
    };
    const out = discoverRoots({
      env: { CLAUDE_CONFIG_DIR: "/a,/b,/a" },
      home: "/u",
      fs: makeFs(tree),
    });
    expect(out).toEqual(["/a", "/b"]);
  });

  it("honors XDG_CONFIG_HOME when CLAUDE_CONFIG_DIR is unset", () => {
    const tree = {
      "/xdg/claude": "dir" as const, "/xdg/claude/projects": "dir" as const,
    };
    const out = discoverRoots({
      env: { XDG_CONFIG_HOME: "/xdg" },
      home: "/u",
      fs: makeFs(tree),
    });
    expect(out).toContain("/xdg/claude");
  });
});

describe("discoverJsonlFiles", () => {
  it("walks projects/**/*.jsonl and returns lex-sorted absolute paths", () => {
    const home = "/u/alice";
    const tree = {
      [`${home}/.claude`]: "dir" as const,
      [`${home}/.claude/projects`]: "dir" as const,
      [`${home}/.claude/projects/p1`]: "dir" as const,
      [`${home}/.claude/projects/p1/b.jsonl`]: "file" as const,
      [`${home}/.claude/projects/p1/a.jsonl`]: "file" as const,
      [`${home}/.claude/projects/p2`]: "dir" as const,
      [`${home}/.claude/projects/p2/c.jsonl`]: "file" as const,
      [`${home}/.claude/projects/p2/note.txt`]: "file" as const,
    };
    const out = discoverJsonlFiles({ env: {}, home, fs: makeFs(tree) });
    expect(out).toEqual([
      `${home}/.claude/projects/p1/a.jsonl`,
      `${home}/.claude/projects/p1/b.jsonl`,
      `${home}/.claude/projects/p2/c.jsonl`,
    ]);
  });
});
