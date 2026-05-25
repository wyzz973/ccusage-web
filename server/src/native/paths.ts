// Path discovery for Claude Code logs.
//
// Mirrors iter0-R1 §2 + claude/paths.rs:13-45,93-113:
//   $CLAUDE_CONFIG_DIR (comma-separated multi-root)
//   → $XDG_CONFIG_HOME/claude
//   → ~/.claude
// Each root must contain a `projects/` subdir to qualify.
// Within a qualifying root, glob `<root>/projects/**/*.jsonl` and sort lex.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface DiscoverOptions {
  /** Override env entirely. Useful for tests. */
  env?: NodeJS.ProcessEnv;
  /** Override $HOME. Useful for tests. */
  home?: string;
  /** Filesystem facade for tests. */
  fs?: {
    existsSync(p: string): boolean;
    statSync(p: string): { isDirectory(): boolean };
    readdirSync(p: string, opts?: { withFileTypes?: boolean }): fs.Dirent[] | string[];
  };
}

/** Return the list of qualifying root directories (each contains projects/). */
export function discoverRoots(opts: DiscoverOptions = {}): string[] {
  const env = opts.env ?? process.env;
  const home = opts.home ?? env.HOME ?? os.homedir();
  const fsImpl = opts.fs ?? fs;

  const candidates: string[] = [];
  const raw = env.CLAUDE_CONFIG_DIR;
  if (raw && raw.length > 0) {
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (trimmed) candidates.push(trimmed);
    }
  } else {
    const xdg = env.XDG_CONFIG_HOME;
    if (xdg && xdg.length > 0) candidates.push(path.join(xdg, "claude"));
    candidates.push(path.join(home, ".claude"));
  }

  const qualifying: string[] = [];
  const seen = new Set<string>();
  for (const root of candidates) {
    if (seen.has(root)) continue;
    seen.add(root);
    const proj = path.join(root, "projects");
    try {
      if (fsImpl.existsSync(proj) && fsImpl.statSync(proj).isDirectory()) {
        qualifying.push(root);
      }
    } catch {
      // ignore inaccessible roots
    }
  }
  return qualifying;
}

/** Discover all *.jsonl files under qualifying Claude roots, sorted lexicographically. */
export function discoverJsonlFiles(opts: DiscoverOptions = {}): string[] {
  const fsImpl = opts.fs ?? fs;
  const roots = discoverRoots(opts);
  const out: string[] = [];
  for (const root of roots) {
    const projects = path.join(root, "projects");
    walk(projects, out, fsImpl);
  }
  return out.sort();
}

function walk(
  dir: string,
  acc: string[],
  fsImpl: NonNullable<DiscoverOptions["fs"]>,
): void {
  let entries: fs.Dirent[] | string[] = [];
  try {
    entries = fsImpl.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const isDirent = typeof ent !== "string";
    const name = isDirent ? (ent as fs.Dirent).name : (ent as string);
    const full = path.join(dir, name);
    let isDir = false;
    let isFile = false;
    if (isDirent) {
      const d = ent as fs.Dirent;
      isDir = d.isDirectory();
      isFile = d.isFile();
    } else {
      try {
        const st = fsImpl.statSync(full);
        isDir = st.isDirectory();
        isFile = !isDir;
      } catch {
        continue;
      }
    }
    if (isDir) {
      walk(full, acc, fsImpl);
    } else if (isFile && name.endsWith(".jsonl")) {
      acc.push(full);
    }
  }
}
