// Agent color tokens — locked in `docs/swarm/iter1-R2-design-spec.md §1`.
// Used as the single source of truth for v1 charts/chips. Replaces the
// ad-hoc COLORS[] array in the classic ModelBreakdown.tsx.

export type AgentKey = "claude" | "codex" | "gemini" | "copilot" | "openclaw" | "unknown";

export const AGENT_COLORS: Record<AgentKey, string> = {
  claude:   "hsl(262 83% 68%)", // 6.42:1 AA+
  codex:    "hsl(188 84% 55%)", // 8.91:1 AAA
  gemini:   "hsl(38 92% 60%)",  // 9.84:1 AAA
  copilot:  "hsl(330 78% 68%)", // 6.05:1 AA+
  openclaw: "hsl(90 55% 60%)",  // 8.13:1 AAA
  unknown:  "hsl(240 5% 65%)",  // muted-foreground; for "all" or unrecognized agents
};

export const AGENT_LABEL: Record<AgentKey, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  copilot: "Copilot",
  openclaw: "OpenClaw",
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
 */
export function toAgentKey(s: string | null | undefined): AgentKey {
  if (s == null) return "unknown";
  const k = s.toLowerCase();
  if (k === "claude" || k === "codex" || k === "gemini" || k === "copilot" || k === "openclaw") return k;
  return "unknown";
}
