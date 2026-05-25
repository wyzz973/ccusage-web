import pLimit from "p-limit";
import type { Snapshot, UsageRecord, Block, Derived } from "./types.js";
import type { SnapshotStore } from "./snapshot-store.js";
import {
  getTodayKey, getMonthKey, getISOWeekKey,
  computeTodayDrivers, computeSnapshotDeltas, previousPeriodKeys,
} from "./insights/index.js";

export interface PollerDeps {
  store: SnapshotStore;
  runCcusage: <T>(cmd: string) => Promise<T>;
  getVersion: () => Promise<string>;
  intervalMs: number;
  now?: () => Date;
  /**
   * IANA timezone used to compute today/week/month keys (bug fix #3).
   * Defaults to UTC if absent.
   */
  tz?: string;
}

export interface Poller {
  runOnce(): Promise<void>;
  start(): void;
  stop(): void;
}

const ACTIVE_SESSION_WINDOW_MS = 30 * 60 * 1000;

export interface ComputeDerivedDeps {
  /** IANA TZ; default UTC. */
  tz?: string;
}

export function computeDerived(
  buckets: { daily: UsageRecord[]; weekly: UsageRecord[]; monthly: UsageRecord[]; session: UsageRecord[]; blocks: Block[] },
  now: Date,
  deps: ComputeDerivedDeps = {},
): Derived {
  const tz = deps.tz ?? "UTC";
  const todayKey = getTodayKey(now, tz);
  const monthKey = getMonthKey(now, tz);
  const weekKey = getISOWeekKey(now, tz);

  const sum = (rs: UsageRecord[]): { tokens: number; cost: number } => rs.reduce(
    (acc, r) => ({ tokens: acc.tokens + r.totalTokens, cost: acc.cost + r.totalCost }),
    { tokens: 0, cost: 0 },
  );

  const todaysDailyRecords = buckets.daily.filter((r) => r.period === todayKey);
  const today = sum(todaysDailyRecords);

  // Bug fix #1: week/month must filter by the *current* ISO-week and
  // calendar-month, not sum the entire weekly/monthly bucket arrays.
  const week = sum(buckets.weekly.filter((r) => r.period === weekKey));
  const month = sum(buckets.monthly.filter((r) => r.period === monthKey));
  const allTime = sum(buckets.daily);

  const activeBlock = buckets.blocks.find((b) => b.isActive) ?? null;
  const activeSessionCount = buckets.session.filter((s) => {
    const t = s.metadata?.lastActivity;
    if (!t) return false;
    const ts = Date.parse(t);
    return Number.isFinite(ts) && (now.getTime() - ts) <= ACTIVE_SESSION_WINDOW_MS;
  }).length;

  // ── Tier 2: insights (additive, optional in legacy snapshot consumers) ──
  const todaysSessions = buckets.session
    .filter((s) => {
      const t = s.metadata?.lastActivity;
      if (!t) return false;
      const ms = Date.parse(t);
      if (!Number.isFinite(ms)) return false;
      const dayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(ms));
      return dayKey === todayKey;
    })
    .map((s) => ({ project: s.project, cost: s.totalCost }));

  const todayDrivers = computeTodayDrivers({
    todaysDailyRecords,
    todaysSessions,
  });

  const prev = previousPeriodKeys(now, tz);
  const deltas = computeSnapshotDeltas({
    todayKey,
    yesterdayKey: prev.yesterdayKey,
    weekKey,
    prevWeekKey: prev.prevWeekKey,
    monthKey,
    prevMonthKey: prev.prevMonthKey,
    dailyRecords: buckets.daily,
    weeklyRecords: buckets.weekly,
    monthlyRecords: buckets.monthly,
  });

  return {
    today, week, month, allTime,
    activeBlock, activeSessionCount,
    todayDrivers,
    deltas,
  };
}

export function createPoller(deps: PollerDeps): Poller {
  const now = deps.now ?? (() => new Date());
  const tz = deps.tz ?? "UTC";
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function runOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const limit = pLimit(2);
      const cmds = ["daily", "weekly", "monthly", "session", "blocks"] as const;
      const results = await Promise.all(
        cmds.map((cmd) => limit(() => deps.runCcusage<Record<string, unknown[]>>(cmd))),
      );
      const buckets = {
        daily:   (results[0] as any)["daily"]   as UsageRecord[],
        weekly:  (results[1] as any)["weekly"]  as UsageRecord[],
        monthly: (results[2] as any)["monthly"] as UsageRecord[],
        session: (results[3] as any)["session"] as UsageRecord[],
        blocks:  (results[4] as any)["blocks"]  as Block[],
      };
      const version = await deps.getVersion().catch(() => "unknown");
      const generatedAt = now().toISOString();
      const snap: Snapshot = {
        generatedAt,
        ccusageVersion: version,
        daily:   { records: buckets.daily ?? [] },
        weekly:  { records: buckets.weekly ?? [] },
        monthly: { records: buckets.monthly ?? [] },
        session: { records: buckets.session ?? [] },
        blocks:  { records: buckets.blocks ?? [] },
        derived: computeDerived(buckets, now(), { tz }),
      };
      deps.store.set(snap);
    } catch (err) {
      deps.store.recordError((err as Error).message);
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (timer) return;
    const tick = async (): Promise<void> => {
      await runOnce();
      timer = setTimeout(tick, deps.intervalMs);
    };
    timer = setTimeout(tick, deps.intervalMs);
  }

  return {
    runOnce,
    start() { schedule(); },
    stop() { if (timer) { clearTimeout(timer); timer = null; } },
  };
}
