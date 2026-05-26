import pLimit from "p-limit";
import * as path from "node:path";
import type { Snapshot, UsageRecord, Block, Derived } from "./types.js";
import type { SnapshotStore } from "./snapshot-store.js";
import {
  getTodayKey, getMonthKey, getWeekStartKey,
  computeTodayDrivers, computeSnapshotDeltas, previousPeriodKeys,
  computeProjectRollups, computeCacheInsight, computeLimitResetInsight,
  decodeProject,
} from "./insights/index.js";
import { discoverJsonlFiles } from "./native/paths.js";

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
  // M-A1 (R1.5): ccusage emits weekly periods as Monday-anchored YYYY-MM-DD,
  // not ISO YYYY-Www. Use the Monday-anchored form so the filter matches.
  const weekKey = getWeekStartKey(now, tz);

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
    // M-A3 (R1.5): pass through the session's `agent` so computeTodayDrivers
    // can build a real per-agent rollup (sessions carry "claude"/"codex"
    // labels; daily records all say "all" — see review §M-A3).
    .map((s) => ({ agent: s.agent, project: s.project, cost: s.totalCost }));

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

  // R2 D1 — project rollups from the entire session window.
  const projects = computeProjectRollups({ sessionRecords: buckets.session });

  // R2 D5 — cache-savings over all daily records present.
  const cache = computeCacheInsight({ dailyRecords: buckets.daily });

  // R2 D9 — limit-reset banner state.
  const limitReset = computeLimitResetInsight({ activeBlock, now });

  return {
    today, week, month, allTime,
    activeBlock, activeSessionCount,
    todayDrivers,
    deltas,
    projects,
    cache,
    limitReset,
  };
}

/**
 * R2 S4 / R2.2 M-R2-1 — stamp `record.project` on every session record so
 * the insights + UI layers don't have to re-derive from filename.
 *
 * Sources, in order of preference:
 *   1. Records that already carry `project` (the native runner pre-stamps
 *      now — see `native/runner.ts.bucketBySession`).
 *   2. The `sessionIdToProject` map (built by the caller from a discovered
 *      `~/.claude/projects/**` walk) — keyed by `record.period` which holds
 *      ccusage's session id. **This is what closes M-R2-1 for the ccusage
 *      source**, which otherwise has no file-path signal in its `--json`.
 *   3. `metadata.project` upstream hint (if a future ccusage version
 *      surfaces one).
 *   4. `undefined` (the rollup treats this as the absent state).
 */
export function stampProjects(
  records: UsageRecord[],
  sessionIdToProject: Map<string, string> = new Map(),
): UsageRecord[] {
  return records.map((r) => {
    if (r.project != null && r.project !== "") return r;
    // (2) sessionId → canonical map built from a `~/.claude/projects/` walk.
    const fromMap = sessionIdToProject.get(r.period);
    if (fromMap) return { ...r, project: fromMap };
    // (3) future-proof: optional `metadata.project` upstream hint.
    const meta = r.metadata as (Record<string, unknown> | undefined);
    const upstream = meta && typeof meta["project"] === "string" ? (meta["project"] as string) : null;
    if (upstream && upstream !== "") {
      const dec = decodeProject(upstream);
      return { ...r, project: dec.canonical };
    }
    return r;
  });
}

/**
 * R2.2 — walk the on-disk projects tree and build a `<sessionId> →
 * <canonical-project>` map. Called per-poll. Pluggable filesystem +
 * discovery for tests. When the discovery yields no files (no
 * `~/.claude/projects/` on the host), the map is empty and
 * `stampProjects` no-ops gracefully.
 */
export interface ProjectMapDeps {
  discover?: () => string[];
}
export function buildSessionProjectMap(deps: ProjectMapDeps = {}): Map<string, string> {
  const discover = deps.discover ?? discoverJsonlFiles;
  const out = new Map<string, string>();
  let files: string[] = [];
  try { files = discover(); } catch { /* discovery may throw on unusual fs configs */ }
  for (const file of files) {
    const sessionId = path.basename(file, ".jsonl");
    if (!sessionId) continue;
    const dec = decodeProject({ fullPath: file });
    if (dec.canonical && dec.canonical !== "unknown") {
      out.set(sessionId, dec.canonical);
    }
  }
  return out;
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
      // R2.2 (M-R2-1) — build the sessionId → canonical-project map from
      // the on-disk projects tree once per poll, then thread it into
      // stampProjects so both source modes (native + ccusage shellout)
      // get project attribution.
      const sessionProjectMap = buildSessionProjectMap();

      const buckets = {
        daily:   (results[0] as any)["daily"]   as UsageRecord[],
        weekly:  (results[1] as any)["weekly"]  as UsageRecord[],
        monthly: (results[2] as any)["monthly"] as UsageRecord[],
        session: stampProjects((results[3] as any)["session"] as UsageRecord[], sessionProjectMap),
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
