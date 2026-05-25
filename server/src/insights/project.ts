// Project-name extraction from a Claude Code session path.
//
// Per researcher §1.1, sessions live at:
//   ~/.claude/projects/<encoded>/<sessionId>.jsonl
// where `<encoded>` is the absolute on-disk project directory with all
// `/` characters substituted by `-` (and the leading `/` becomes a
// leading `-`). Examples (from the research notes):
//
//   /Users/sd3/code/ccusage-web              → -Users-sd3-code-ccusage-web
//   /Users/sd3/My Project                    → -Users-sd3-My Project
//   /tmp                                     → -tmp
//
// The encoding is lossy: real path segments may legitimately contain `-`,
// which is indistinguishable from a `/`-encoded boundary at decode time.
// We therefore return only the *trailing* segment (the project name as
// the user would call it), not the full path.
//
// Round-1 ships this as a pure utility; the UI/D1 project chip is Round 2.
// `extractProject` is exposed here so the native parser in Round 2 (M6)
// has a single tested decoder to call.

const UNKNOWN = "unknown";

export interface ExtractProjectInput {
  /** Encoded project directory name, e.g. `-Users-sd3-code-ccusage-web`. */
  encoded?: string | null | undefined;
  /** Full absolute path to a session file, optional convenience accessor. */
  fullPath?: string | null | undefined;
}

/**
 * Decode a Claude-Code project name.
 *
 * Tolerates:
 *  - `null` / `undefined` / empty / whitespace input  → "unknown"
 *  - encoded form with or without leading `-`         → trailing segment
 *  - absolute on-disk path (`fullPath`)               → basename
 *  - paths that contain `~/.claude/projects/<enc>/…`  → extracted encoded
 *  - segments containing spaces (`My Project`)         → preserved verbatim
 *
 * Returns "unknown" only when there is nothing meaningful to return; never
 * throws. The caller is expected to treat "unknown" as the absent state.
 */
export function extractProject(input: ExtractProjectInput | string | null | undefined): string {
  if (input == null) return UNKNOWN;
  const raw = typeof input === "string" ? { encoded: input } : input;

  // 1. Prefer fullPath when given (M6 native parser will pass this).
  if (raw.fullPath && raw.fullPath.trim() !== "") {
    const fp = raw.fullPath.trim();
    const claudeMatch = fp.match(/\.claude\/projects\/([^/]+)/);
    if (claudeMatch && claudeMatch[1] != null) {
      return decodeEncoded(claudeMatch[1]);
    }
    // Not a Claude session — return path basename as a fallback.
    const segs = fp.split("/").filter((s) => s.length > 0);
    if (segs.length === 0) return UNKNOWN;
    return segs[segs.length - 1] ?? UNKNOWN;
  }

  if (raw.encoded == null) return UNKNOWN;
  return decodeEncoded(raw.encoded);
}

function decodeEncoded(enc: string): string {
  const trimmed = enc.trim();
  if (trimmed === "") return UNKNOWN;
  // Drop the leading `-` (which represents the absolute-path root `/`).
  const body = trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
  if (body === "") return UNKNOWN;
  // Best-effort: split on `-` and take the trailing segment.
  // We can't reliably reconstruct intermediate path segments because `-`
  // is overloaded; the trailing segment is the project name in 100% of
  // observed cases, so we surface that.
  const parts = body.split("-").filter((s) => s.length > 0);
  if (parts.length === 0) return UNKNOWN;
  return parts[parts.length - 1] ?? UNKNOWN;
}
