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

export type DriverSegment = { name: string; pct: number; costUSD: number };

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
