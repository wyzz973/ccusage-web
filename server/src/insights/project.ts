// Project-name extraction from a Claude Code session path.
//
// Per researcher §1.1, sessions live at:
//   ~/.claude/projects/<encoded>/<sessionId>.jsonl
// where `<encoded>` is the absolute on-disk project directory with all
// `/` characters substituted by `-`. Examples (from the research notes):
//
//   /Users/sd3/code/ccusage-web              → -Users-sd3-code-ccusage-web
//   /Users/sd3/My Project                    → -Users-sd3-My Project
//   /tmp                                     → -tmp
//
// The encoding is lossy: real path segments may legitimately contain `-`,
// which is indistinguishable from a `/`-encoded boundary at decode time.
//
// R2 S3 fix: surface BOTH the canonical decoded body (path-like) AND the
// short display name. `extractProject` (R1 entry-point) keeps the short
// behavior for back-compat; R2 callers should prefer `decodeProject` which
// returns `{ canonical, displayName }`. The UI uses canonical as the
// filter-chip value (stable cross-session) and displayName as the label.

const UNKNOWN = "unknown";

export interface ExtractProjectInput {
  /** Encoded project directory name, e.g. `-Users-sd3-code-ccusage-web`. */
  encoded?: string | null | undefined;
  /** Full absolute path to a session file, optional convenience accessor. */
  fullPath?: string | null | undefined;
}

export interface DecodedProject {
  /**
   * Stable identifier. When `fullPath` is given, this is the encoded form
   * (round-trip preserves uniqueness even when the project name contains
   * `-`). When only `encoded` is given, this is the input verbatim. When
   * nothing is decodable, this is "unknown".
   */
  canonical: string;
  /**
   * Short human-facing label. For Claude session paths this is the
   * trailing path segment of the parent dir (best-effort, since `-`
   * encoding is lossy). For absolute paths it's `path.basename`. For
   * nothing decodable, "unknown".
   */
  displayName: string;
}

/**
 * R2 entry point — returns both the canonical encoded form and a short
 * display name. The canonical form is suitable as a stable filter-chip
 * value; displayName is suitable as a label.
 */
export function decodeProject(input: ExtractProjectInput | string | null | undefined): DecodedProject {
  if (input == null) return { canonical: UNKNOWN, displayName: UNKNOWN };
  const raw = typeof input === "string" ? { encoded: input } : input;

  if (raw.fullPath && raw.fullPath.trim() !== "") {
    const fp = raw.fullPath.trim();
    const claudeMatch = fp.match(/\.claude\/projects\/([^/]+)/);
    if (claudeMatch && claudeMatch[1] != null) {
      const enc = claudeMatch[1];
      return { canonical: enc, displayName: displayNameOf(enc) };
    }
    // Not a Claude session — derive display from path basename.
    const segs = fp.split("/").filter((s) => s.length > 0);
    if (segs.length === 0) return { canonical: UNKNOWN, displayName: UNKNOWN };
    const last = segs[segs.length - 1] ?? UNKNOWN;
    return { canonical: fp, displayName: last };
  }

  if (raw.encoded == null) return { canonical: UNKNOWN, displayName: UNKNOWN };
  const trimmed = raw.encoded.trim();
  if (trimmed === "") return { canonical: UNKNOWN, displayName: UNKNOWN };
  return { canonical: trimmed, displayName: displayNameOf(trimmed) };
}

/**
 * R1 back-compat entry point — returns the short display name only.
 * New R2 callers should prefer `decodeProject` for the canonical/display
 * pair (S3 from the round-1 review: bare display name collapses
 * `ccusage-web` → `web` and loses uniqueness for filter-chip purposes).
 */
export function extractProject(input: ExtractProjectInput | string | null | undefined): string {
  return decodeProject(input).displayName;
}

function displayNameOf(enc: string): string {
  const trimmed = enc.trim();
  if (trimmed === "") return UNKNOWN;
  const body = trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
  if (body === "") return UNKNOWN;
  const parts = body.split("-").filter((s) => s.length > 0);
  if (parts.length === 0) return UNKNOWN;
  return parts[parts.length - 1] ?? UNKNOWN;
}
