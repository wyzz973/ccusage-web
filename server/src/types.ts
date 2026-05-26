export type UsageRecord = {
  period: string;
  agent: string;
  totalTokens: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  metadata?: { agents?: string[]; lastActivity?: string };
  /**
   * Round-1 additive: project name decoded from the Claude session path.
   * Populated by the native parser in Round 2 (M6); typically `undefined`
   * in Round 1. Classic UI ignores this field; v1 UI surfaces it.
   *
   * Carries the **canonical** form (encoded `-Users-…-ccusage-web`),
   * suitable as a stable filter-chip identity. The short label is in
   * `projectDisplay` (R3 §C).
   */
  project?: string;
  /**
   * R3 §C: short human label for the project chip. Derived from the
   * line's `cwd` field when available (high-quality); falls back to the
   * trailing-`-`-segment heuristic on the canonical (R2 behavior;
   * known-lossy when project names contain `-`).
   */
  projectDisplay?: string;
  /** R3 §C: provenance of `projectDisplay`. UI renders a hint when "encoded-heuristic". */
  projectDisplaySource?: "cwd" | "encoded-heuristic" | "absent";
};

export type ModelBreakdown = {
  modelName: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

export type Block = {
  id: string;
  startTime: string;
  endTime: string;
  actualEndTime: string | null;
  isActive: boolean;
  isGap: boolean;
  costUSD: number;
  totalTokens: number;
  entries: number;
  models: string[];
  burnRate: { costPerHour: number; tokensPerMinute: number; tokensPerMinuteForIndicator: number } | null;
  projection: { remainingMinutes: number; totalCost: number; totalTokens: number } | null;
  tokenCounts: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
  /**
   * R3.13 — upstream `usage_limit_reset_time` (RFC3339 UTC) when the
   * Anthropic API returns the `Claude AI usage limit reached|<unixts>`
   * marker on a session line. Surfaces as `derived.activeBlock.usageLimitResetTime`;
   * D9 LimitResetBanner reads it for its `source: "upstream"` path.
   *
   * `null` = field absent / malformed (banner falls back to the burn
   * heuristic in `computeLimitResetInsight`). Both native + ccusage
   * source paths populate this when upstream emits it; pre-upstream-land,
   * value stays null and the heuristic carries.
   */
  usageLimitResetTime?: string | null;
};

export type Derived = {
  today:   { tokens: number; cost: number };
  week:    { tokens: number; cost: number };
  month:   { tokens: number; cost: number };
  allTime: { tokens: number; cost: number };
  activeBlock: Block | null;
  activeSessionCount: number;
  /**
   * Round-1 additive (Tier 2 / insights). Optional so classic consumers
   * keep type-checking against the legacy shape. Populated by the poller
   * via `server/src/insights/`.
   */
  todayDrivers?: {
    agent?:   { name: string; pct: number; costUSD: number };
    model?:   { name: string; pct: number; costUSD: number };
    project?: { name: string; pct: number; costUSD: number };
    totalCostUSD: number;
  };
  deltas?: {
    today: { pct: number | null; vsLabel: string; current: number; previous: number };
    week:  { pct: number | null; vsLabel: string; current: number; previous: number };
    month: { pct: number | null; vsLabel: string; current: number; previous: number };
  };
  /** R2 D1 — top projects rollup. R3 §C adds `displayNameSource`. */
  projects?: Array<{
    canonical: string;
    displayName: string;
    /** R3 §C: "cwd" | "encoded-heuristic" | "absent". UI hint when lossy. */
    displayNameSource?: "cwd" | "encoded-heuristic" | "absent";
    cost: number;
    tokens: number;
    sessions: number;
    pctOfWindow: number;
  }>;
  /** R2 D5 — cache-savings insight. */
  cache?: {
    hitPct: number | null;
    savedUSD: number;
    sparkPctPerDay: number[];
    wkOverWkDropPct: number | null;
  };
  /** R2 D9 — limit-reset banner state. */
  limitReset?: {
    active: boolean;
    resetAt: string | null;
    minutesUntilReset: number | null;
    source: "upstream" | "heuristic" | null;
  };
  /** R3.5 — detected agents (spec-v3 §3.1.4). Drives AgentChipRow visibility. */
  detectedAgents?: string[];
  /** R3.7 — budget + projection (spec-v3 §3.3.1). */
  budget?: {
    monthToDateUSD: number;
    monthEndProjectionUSD: number;
    monthlyCapUSD: number | null;
    overshootUSD: number | null;
    overshootPct: number | null;
    perBlockTokenLimit: number | null;
    banner: boolean;
  };
  /**
   * M6.d — parser-mode badge truth source (spec-v3 §2.3).
   * `"native"`: in-tree loader is active. `"fallback"`: post-M6.d-flip
   * default behavior fell back to the ccusage binary (e.g. soak
   * detected drift, or USAGE_SOURCE=ccusage explicitly). UI mounts
   * `ModeBadgesV1` off this field.
   */
  mode?: {
    parser: "native" | "fallback";
  };
};

export type Snapshot = {
  generatedAt: string;
  ccusageVersion: string;
  daily:   { records: UsageRecord[] };
  weekly:  { records: UsageRecord[] };
  monthly: { records: UsageRecord[] };
  session: { records: UsageRecord[] };
  blocks:  { records: Block[] };
  derived: Derived;
};

export type HealthInfo = {
  status: "ok" | "degraded";
  lastPollAt: string | null;
  lastError: string | null;
};
