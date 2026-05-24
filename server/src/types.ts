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
  burnRate: number | null;
  projection: unknown | null;
  tokenCounts: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
};

export type Derived = {
  today:   { tokens: number; cost: number };
  week:    { tokens: number; cost: number };
  month:   { tokens: number; cost: number };
  allTime: { tokens: number; cost: number };
  activeBlock: Block | null;
  activeSessionCount: number;
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
