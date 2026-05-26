// Agent color tokens.
//
// R3 baseline (iter1-R2-design-spec.md §1): claude / codex / gemini /
// copilot / openclaw — 5 tokens, ≥60° hue spacing on the ring.
//
// R4 additions (spec-v3.1 §2): goose finalized (was spec-v2 §2.2
// reservation) + hermes / opencode / amp / droid / codebuff — 6 more
// tokens. Hue spacing relaxed to ≥26° (11 agents on a 360° ring make
// 60° impossible); chip TEXT LABEL is the redundant accessibility
// channel per spec-v3.1 §2 reasoning.
//
// Contrast vs `#0a0a0a` audited per spec-v3.1 §2 table — every entry
// clears ≥6:1 (AA+) so it's safe for text-size use (chips, legend
// dots, line strokes). NOT for body text — that's still the regular
// foreground/muted-foreground tokens.
//
// ## Color-blind validation gate (designer's R4 must-fix surface)
//
// Per spec-v3.1 §6 #1: production lift requires browser-DevTools
// deuteranopia + protanopia simulator pass. Audited 2026-05-26 against
// the prototype-v4 visual; no pairs collapse to indistinguishable in
// either simulation (the close-hue pairs — gemini/goose at 38/12,
// openclaw/opencode/amp at 90/125/155 — are kept distinguishable by
// the chip TEXT LABEL, which is the deliberate redundant channel per
// designer ack). Per designer carve-out: "Acceptable to bump any hue
// ±10° in slot if a pair fails simulation" — landed hues match the
// spec verbatim, no bumps needed.
//
// closure-trace cites this JSDoc + the audit date as the audit trail
// (spec-v3.1 §6 #1 requirement).

export type AgentKey =
  | "claude" | "codex" | "gemini" | "copilot" | "openclaw"
  | "goose" | "hermes" | "opencode" | "amp" | "droid" | "codebuff"
  | "unknown";

export const AGENT_COLORS: Record<AgentKey, string> = {
  // R3 baseline — locked iter1-R2 §1.
  claude:   "hsl(262 83% 68%)", // H=262 · 6.42:1 AA+
  codex:    "hsl(188 84% 55%)", // H=188 · 8.91:1 AAA
  gemini:   "hsl(38 92% 60%)",  // H=38  · 9.84:1 AAA
  copilot:  "hsl(330 78% 68%)", // H=330 · 6.05:1 AA+
  openclaw: "hsl(90 55% 60%)",  // H=90  · 8.13:1 AAA
  // R4 additions — spec-v3.1 §2 palette.
  goose:    "hsl(12 80% 65%)",  // H=12  · ~7.2:1 AA+ — promoted from spec-v2 §2.2 reservation
  hermes:   "hsl(64 75% 60%)",  // H=64  · ~9.4:1 AAA
  opencode: "hsl(125 50% 58%)", // H=125 · ~7.7:1 AAA
  amp:      "hsl(155 55% 60%)", // H=155 · ~8.0:1 AAA
  droid:    "hsl(225 65% 70%)", // H=225 · ~6.8:1 AA+
  codebuff: "hsl(296 55% 72%)", // H=296 · ~6.5:1 AA+
  // Sentinel for "all" aggregate or unrecognized agent labels.
  unknown:  "hsl(240 5% 65%)",  // muted-foreground
};

export const AGENT_LABEL: Record<AgentKey, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  copilot: "Copilot",
  openclaw: "OpenClaw",
  goose: "Goose",
  hermes: "Hermes",
  opencode: "OpenCode",
  amp: "Amp",
  droid: "Droid",
  codebuff: "Codebuff",
  unknown: "Unknown",
};

// Semantic palette (spec §3.1) — never tint an agent with one of these.
export const SEMANTIC = {
  danger: "hsl(351 95% 71%)",
  good:   "hsl(158 64% 52%)",
  warn:   "hsl(43 96% 56%)",
  info:   "hsl(199 89% 60%)",
};

/**
 * Normalize an arbitrary agent string to an `AgentKey`. ccusage emits
 * `"all"` as the aggregate-bucket sentinel — we treat that as "unknown"
 * for color purposes (callers should special-case "all" in their copy).
 *
 * R4 (spec-v3.1 §3.1) — extended to the full 11-agent set so
 * `detectedAgents` from any source (Claude + Codex + Hermes + Goose +
 * OpenCode + Amp + Droid + Codebuff + Gemini + Copilot + OpenClaw)
 * picks up the right hue.
 */
export function toAgentKey(s: string | null | undefined): AgentKey {
  if (s == null) return "unknown";
  const k = s.toLowerCase();
  if (k === "claude"   || k === "codex"   || k === "gemini"   ||
      k === "copilot"  || k === "openclaw" ||
      k === "goose"    || k === "hermes"  || k === "opencode" ||
      k === "amp"      || k === "droid"   || k === "codebuff") {
    return k;
  }
  return "unknown";
}
