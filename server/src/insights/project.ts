// Project-name extraction from a Claude Code session path.
//
// Per researcher §1.1, sessions live at:
//   ~/.claude/projects/<encoded>/<sessionId>.jsonl
// where `<encoded>` is the absolute on-disk project directory with all
// `/` characters substituted by `-`. Examples:
//
//   /Users/sd3/code/ccusage-web              → -Users-sd3-code-ccusage-web
//   /Users/sd3/My Project                    → -Users-sd3-My Project
//   /tmp                                     → -tmp
//
// The encoding is lossy: real path segments may legitimately contain `-`,
// which is indistinguishable from a `/`-encoded boundary at decode time
// (e.g. `-Users-sd3-code-ccusage-web` could equally decode to either
// `/Users/sd3/code/ccusage-web` (one segment `ccusage-web`) or
// `/Users/sd3/code/ccusage/web` (two segments)).
//
// ## Resolution tiers
//
// `canonical`   — encoded form, stable across sessions; used as the
//                 filter-chip identity (S3 from round-1 review). Same
//                 across all tiers.
// `displayName` — the human label shown in chips/legends:
//   R1: trailing-`-`-segment heuristic only (lossy).
//   R2: same heuristic; `canonical` separated for chip identity.
//   R3 §C: prefers `cwd` from the JSONL line when available (every CC log
//         line carries it per `NULL_FORBIDDEN_FIELDS`). Falls back to the
//         R1/R2 heuristic when `cwd` is absent.
//
// The `displayNameSource` flag lets the UI render a small "ⓘ" hint when
// the value came from the lossy heuristic (R3 §C end-state).

const UNKNOWN = "unknown";

export interface ExtractProjectInput {
  /** Encoded project directory name, e.g. `-Users-sd3-code-ccusage-web`. */
  encoded?: string | null | undefined;
  /** Full absolute path to a session file, optional convenience accessor. */
  fullPath?: string | null | undefined;
  /**
   * R3 §C: unambiguous absolute working directory from a Claude Code
   * log line's `cwd` field. When present and non-empty, takes precedence
   * over the encoded-heuristic for `displayName`. Disambiguates
   * `ccusage-web` (project name with `-`) from `ccusage/web` (path-segment
   * boundary) — the encoded form can't tell them apart.
   */
  cwd?: string | null | undefined;
}

export type DisplayNameSource =
  | "cwd"               // came from a real cwd value (high-quality)
  | "encoded-heuristic" // trailing-`-`-segment guess (R1/R2 behavior; known lossy)
  | "absent";           // nothing decodable

export interface DecodedProject {
  /**
   * Stable identifier. When `fullPath` is given, this is the encoded form
   * (round-trip preserves uniqueness even when the project name contains
   * `-`). When only `encoded` is given, this is the input verbatim. When
   * nothing is decodable, this is "unknown".
   */
  canonical: string;
  /**
   * Short human-facing label. Resolution order (R3 §C):
   *   1. `cwd` → `basename(cwd)`  (unambiguous; the win)
   *   2. fallback: trailing `-`-segment heuristic on encoded (lossy)
   *   3. `"unknown"`
   */
  displayName: string;
  /** R3 §C: provenance of `displayName`, so UI can render a hint when lossy. */
  displayNameSource: DisplayNameSource;
}

/**
 * R2/R3 entry point — canonical + display + source. Callers that only
 * need the label use the back-compat `extractProject` below.
 */
export function decodeProject(
  input: ExtractProjectInput | string | null | undefined,
): DecodedProject {
  if (input == null) return { canonical: UNKNOWN, displayName: UNKNOWN, displayNameSource: "absent" };
  const raw = typeof input === "string" ? { encoded: input } : input;

  // Resolve canonical first (independent of cwd availability).
  let canonical = UNKNOWN;
  if (raw.fullPath && raw.fullPath.trim() !== "") {
    const fp = raw.fullPath.trim();
    const claudeMatch = fp.match(/\.claude\/projects\/([^/]+)/);
    if (claudeMatch && claudeMatch[1] != null) {
      canonical = claudeMatch[1];
    } else if (basenameOf(fp) !== UNKNOWN) {
      // Not a Claude session — canonical = full path (R2 behavior).
      // Skip when the path has no usable basename (e.g. just "/").
      canonical = fp;
    }
  } else if (raw.encoded != null) {
    const trimmed = raw.encoded.trim();
    if (trimmed !== "") canonical = trimmed;
  }

  // R3 §C: prefer cwd basename for displayName when present.
  const cwd = typeof raw.cwd === "string" ? raw.cwd : null;
  if (cwd && cwd.trim() !== "") {
    const display = basenameOf(cwd);
    if (display !== UNKNOWN) {
      return { canonical, displayName: display, displayNameSource: "cwd" };
    }
  }

  // Fallback 1: heuristic on canonical (R1/R2 behavior — known lossy).
  if (canonical !== UNKNOWN) {
    // For non-Claude fullPath, canonical is the absolute path — basename it.
    if (canonical.startsWith("/")) {
      const display = basenameOf(canonical);
      if (display !== UNKNOWN) {
        return { canonical, displayName: display, displayNameSource: "encoded-heuristic" };
      }
    }
    const heuristic = trailingSegmentHeuristic(canonical);
    if (heuristic !== UNKNOWN) {
      return { canonical, displayName: heuristic, displayNameSource: "encoded-heuristic" };
    }
  }

  return { canonical: UNKNOWN, displayName: UNKNOWN, displayNameSource: "absent" };
}

/**
 * R1 back-compat entry point — returns the short display name only.
 * New callers should prefer `decodeProject` for the full triple
 * (canonical / display / source).
 */
export function extractProject(input: ExtractProjectInput | string | null | undefined): string {
  return decodeProject(input).displayName;
}

function basenameOf(absPath: string): string {
  // Normalize trailing slashes; take the last non-empty segment. Handles
  // multi-`/` collapse (e.g. "/a//b" → "b") same as the POSIX basename.
  const trimmed = absPath.trim().replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return UNKNOWN;
  const segs = trimmed.split("/").filter((s) => s.length > 0);
  if (segs.length === 0) return UNKNOWN;
  return segs[segs.length - 1] ?? UNKNOWN;
}

function trailingSegmentHeuristic(enc: string): string {
  const trimmed = enc.trim();
  if (trimmed === "") return UNKNOWN;
  const body = trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
  if (body === "") return UNKNOWN;
  const parts = body.split("-").filter((s) => s.length > 0);
  if (parts.length === 0) return UNKNOWN;
  return parts[parts.length - 1] ?? UNKNOWN;
}
