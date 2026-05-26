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
  /** Round-1 additive: project name (Round-2 M6 populates). */
  project?: string;
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
};

/**
 * S-R3-1: `displayName` carries the cwd-sniffed short label for the
 * project dimension. UI renders `displayName ?? name` so the segment
 * shows "ccusage-web" instead of "-Users-sd3-Desktop-project-ccusage-web".
 * Optional because agents/models don't have a separate display form.
 */
export type DriverSegment = { name: string; displayName?: string; pct: number; costUSD: number };

export type Derived = {
  today:   { tokens: number; cost: number };
  week:    { tokens: number; cost: number };
  month:   { tokens: number; cost: number };
  allTime: { tokens: number; cost: number };
  activeBlock: Block | null;
  activeSessionCount: number;
  todayDrivers?: {
    agent?: DriverSegment;
    model?: DriverSegment;
    project?: DriverSegment;
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
  /** M6.d — parser-mode badge truth source (spec-v3 §2.3). */
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
