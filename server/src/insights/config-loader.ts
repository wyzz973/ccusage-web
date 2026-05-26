// R3.9 + R3.10 + R3.11 + R3.12 — Config-file loader.
//
// Per PRD v3 §1 R3.9.AC1, the priority chain (highest → lowest):
//
//   CLI (--config / ?config=) > env (CCUSAGE_CONFIG) >
//   project (.ccusage/ccusage.json from cwd-walk-up) >
//   user (~/.config/claude/ccusage.json) >
//   legacy (~/.claude/ccusage.json) >
//   defaults
//
// Each layer is loaded independently and merged top-down so later
// layers OVERRIDE earlier ones (priority chain reads left-to-right; the
// merge applies right-to-left so the top of the chain wins). Unknown
// keys are allowed + logged; type-violating keys are rejected with
// `console.warn` and skipped.
//
// `mergedFrom: string[]` provenance records each file the active
// config was merged from, in priority order. Surfaced on `/api/health`
// for debuggability (R3.9.AC2).
//
// Pure function: takes deps (fs, env, cwd) so tests can simulate any
// directory layout + env state without touching the real filesystem.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/** All keys the config loader recognises. Add new keys here. */
export interface Config {
  /** R3.7: monthly USD cap fed to ccusage shellout via `--token-limit`. */
  tokenLimit?: number;
  /** R3.2: which day starts the week (default monday). */
  startOfWeek?: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  /** R3.3: default order for tables (default desc). */
  order?: "asc" | "desc";
  /** R3.7: monthly USD cap (X1 banner threshold). */
  monthlyCapUSD?: number;
  /** R3.7: per-block token cap. */
  perBlockTokenLimit?: number;
  /** Optional cost mode override (carries through to ccusage `--mode`). */
  costMode?: "calculate" | "auto" | "display";
  /** Optional timezone override (IANA). */
  timezone?: string;
  /**
   * R4.5 B16: `--session-length` — billing-block window in hours.
   * Defaults to 5 per iter0-R1 §5. Honored both by native `buildBlocks`
   * (sessionLengthMs derive) AND ccusage shellout (`--session-length N`
   * extraArg). Positive number; non-positive falls back to default with
   * `console.warn` per validation block in `readOneConfig`.
   */
  sessionLengthHours?: number;
  /**
   * R4.5 B15: `recentBlocks` — how many trailing blocks the
   * BlocksPanel `Recent` tab surfaces (default 8 per spec-v3.1).
   * Pure UI; passed through `/api/health.config` for the client to
   * read.
   */
  recentBlocks?: number;
}

export interface LoadedConfig {
  config: Config;
  /**
   * Per R3.9.AC2: provenance — each file the active config was merged
   * from, listed in priority order (CLI first, defaults last). When
   * empty, the active config is pure defaults.
   */
  mergedFrom: string[];
}

export interface ConfigLoaderDeps {
  cwd?: string;
  homedir?: string;
  env?: NodeJS.ProcessEnv;
  cliConfigPath?: string | null;
  /** Filesystem facade for tests. */
  fs?: Pick<typeof fs, "existsSync" | "readFileSync">;
}

const PROJECT_REL = path.join(".ccusage", "ccusage.json");
const USER_REL    = path.join(".config", "claude", "ccusage.json");
const LEGACY_REL  = path.join(".claude", "ccusage.json");

const VALID_START_OF_WEEK = new Set(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]);
const VALID_ORDER = new Set(["asc","desc"]);
const VALID_COST_MODE = new Set(["calculate","auto","display"]);

/**
 * Walk up from `cwd` looking for `.ccusage/ccusage.json` (R3.9.AC3).
 * Stops at filesystem root or homedir, whichever first.
 *
 * Returns the absolute path of the project config file, or null when
 * none was found in the walk-up.
 */
export function findProjectConfig(
  cwd: string, homedir: string,
  existsSync: (p: string) => boolean,
): string | null {
  let dir = path.resolve(cwd);
  const homeResolved = path.resolve(homedir);
  // Cap the walk at filesystem root OR the homedir — whichever first.
  // The cap matters: ccusage's convention is "project beats user", so
  // a project file living *inside* the homedir would falsely shadow
  // the user file. Hitting the homedir boundary stops the walk.
  while (true) {
    const candidate = path.join(dir, PROJECT_REL);
    if (existsSync(candidate)) return candidate;
    if (dir === homeResolved) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // hit fs root
    dir = parent;
  }
}

/**
 * Read + parse + validate one config file. Returns the (possibly
 * partial) config + a list of warnings. `null` config means the file
 * doesn't exist or was unreadable; warnings are still returned in case
 * the caller wants to surface "we tried but the file was broken".
 */
function readOneConfig(
  filePath: string | null,
  fsImpl: Pick<typeof fs, "existsSync" | "readFileSync">,
): { config: Config | null; warnings: string[] } {
  if (!filePath) return { config: null, warnings: [] };
  const warnings: string[] = [];
  if (!fsImpl.existsSync(filePath)) return { config: null, warnings };
  let raw = "";
  try {
    raw = fsImpl.readFileSync(filePath, "utf8");
  } catch (e) {
    warnings.push(`config ${filePath}: read failed (${(e as Error).message})`);
    return { config: null, warnings };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    warnings.push(`config ${filePath}: malformed JSON (${(e as Error).message}); ignored`);
    return { config: null, warnings };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    warnings.push(`config ${filePath}: not a JSON object; ignored`);
    return { config: null, warnings };
  }
  const obj = parsed as Record<string, unknown>;
  // R3.12 schema validation: per-key type check. Unknown keys allowed
  // + logged (loader is forward-compatible); type-violating keys are
  // rejected with `console.warn`.
  const out: Config = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "$schema") continue; // R3.12 AC2: IDE-autocomplete pointer; ignore.
    switch (k) {
      case "tokenLimit":
      case "monthlyCapUSD":
      case "perBlockTokenLimit":
      case "sessionLengthHours":
      case "recentBlocks": {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          (out as Record<string, unknown>)[k] = v;
        } else {
          warnings.push(`config ${filePath}: ${k} must be positive number; got ${JSON.stringify(v)}; skipped`);
        }
        break;
      }
      case "startOfWeek": {
        if (typeof v === "string" && VALID_START_OF_WEEK.has(v)) {
          out.startOfWeek = v as Config["startOfWeek"];
        } else {
          warnings.push(`config ${filePath}: startOfWeek must be one of monday|tuesday|…|sunday; got ${JSON.stringify(v)}; skipped`);
        }
        break;
      }
      case "order": {
        if (typeof v === "string" && VALID_ORDER.has(v)) {
          out.order = v as Config["order"];
        } else {
          warnings.push(`config ${filePath}: order must be asc|desc; got ${JSON.stringify(v)}; skipped`);
        }
        break;
      }
      case "costMode": {
        if (typeof v === "string" && VALID_COST_MODE.has(v)) {
          out.costMode = v as Config["costMode"];
        } else {
          warnings.push(`config ${filePath}: costMode must be calculate|auto|display; got ${JSON.stringify(v)}; skipped`);
        }
        break;
      }
      case "timezone": {
        if (typeof v === "string" && v.trim() !== "") {
          out.timezone = v;
        } else {
          warnings.push(`config ${filePath}: timezone must be non-empty IANA string; got ${JSON.stringify(v)}; skipped`);
        }
        break;
      }
      default: {
        // R3.12 AC4: unknown-but-not-violating keys are allowed
        // (forward-compat). Log for debug visibility.
        warnings.push(`config ${filePath}: unknown key "${k}"; ignored (forward-compat)`);
        break;
      }
    }
  }
  return { config: out, warnings };
}

/**
 * Load the active config by walking the priority chain. Each found
 * file contributes to `mergedFrom` in priority order (CLI first); the
 * merge applies right-to-left so the highest-priority file wins each
 * key.
 */
export function loadConfig(deps: ConfigLoaderDeps = {}): LoadedConfig {
  const cwd = deps.cwd ?? process.cwd();
  const homedir = deps.homedir ?? os.homedir();
  const env = deps.env ?? process.env;
  const fsImpl = deps.fs ?? { existsSync: fs.existsSync, readFileSync: fs.readFileSync };

  // Build the priority chain — each step yields its source path (or null).
  const chain: { source: string; path: string | null }[] = [
    { source: "cli",     path: deps.cliConfigPath ?? null },
    { source: "env",     path: env["CCUSAGE_CONFIG"] ?? null },
    { source: "project", path: findProjectConfig(cwd, homedir, fsImpl.existsSync) },
    { source: "user",    path: path.join(homedir, USER_REL) },
    { source: "legacy",  path: path.join(homedir, LEGACY_REL) },
  ];

  const mergedFrom: string[] = [];
  // Merge bottom-up so the top-of-chain entry wins. We iterate chain
  // in reverse (lowest priority first); later spreads override earlier.
  let merged: Config = {};
  for (let i = chain.length - 1; i >= 0; i--) {
    const layer = chain[i]!;
    const loaded = readOneConfig(layer.path, fsImpl);
    for (const w of loaded.warnings) console.warn(`[ccusage-web/config] ${w}`);
    if (loaded.config) {
      merged = { ...merged, ...loaded.config };
      // record in priority order (push at front)
      mergedFrom.unshift(layer.path!);
    }
  }

  return { config: merged, mergedFrom };
}
