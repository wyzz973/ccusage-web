import pLimit from "p-limit";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Snapshot, UsageRecord, Block, Derived } from "./types.js";
import type { SnapshotStore } from "./snapshot-store.js";
import {
  getTodayKey, getMonthKey, getWeekStartKey,
  computeTodayDrivers, computeSnapshotDeltas, previousPeriodKeys,
  computeProjectRollups, computeCacheInsight, computeLimitResetInsight,
  computeDetectedAgents, computeBudgetInsight,
  decodeProject,
  type DisplayNameSource,
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
  /**
   * M6.d (R3) — what gets stamped onto `derived.mode.parser`. The mode
   * badge in the UI reads this field. `native` = in-tree loader is active;
   * `fallback` = ccusage shellout (either explicit `USAGE_SOURCE=ccusage`
   * or, post-M6.d-flip, the auto-fallback when soak-drift trips).
   */
  parserMode?: "native" | "fallback";
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
  /** M6.d (R3) — stamped onto `derived.mode.parser` for the UI badge. */
  parserMode?: "native" | "fallback";
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
    // S-R3-1 (R3.1): also carry `projectDisplay` so the driver-segment
    // surfaces the short label instead of the canonical encoded path.
    .map((s) => ({ agent: s.agent, project: s.project, projectDisplay: s.projectDisplay, cost: s.totalCost }));

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

  // R3.5 — detected agents (drives AgentChipRow visibility client-side).
  const detectedAgents = computeDetectedAgents({ sessionRecords: buckets.session });

  // R3.7 — month-end projection (server emits facts, client applies cap policy).
  // dayOfMonth/daysInMonth derived from the calendar parts in `tz` so the
  // run-rate denominator agrees with the user's local rollover.
  const monthCalParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const partVal = (t: string): number => {
    const p = monthCalParts.find((x) => x.type === t);
    return p ? Number(p.value) : 0;
  };
  const yNow = partVal("year");
  const mNow = partVal("month");
  const dNow = partVal("day");
  // `new Date(Date.UTC(y, m, 0))` returns last day of month `m-1` —
  // exactly the days-in-month for month index `m` (1-based). Works for
  // leap years because the Date arithmetic handles Feb-29 itself.
  const daysInMonth = new Date(Date.UTC(yNow, mNow, 0)).getUTCDate();
  const budget = computeBudgetInsight({
    dailyRecords: buckets.daily,
    monthKey,
    dayOfMonth: dNow,
    daysInMonth,
  });

  // M6.d — parser mode for the UI badge. Default `fallback` so existing
  // ccusage-shellout deploys keep the legacy badge until the native flip.
  const mode: { parser: "native" | "fallback" } = { parser: deps.parserMode ?? "fallback" };

  return {
    today, week, month, allTime,
    activeBlock, activeSessionCount,
    todayDrivers,
    deltas,
    projects,
    cache,
    limitReset,
    detectedAgents,
    budget,
    mode,
  };
}

/**
 * R3 §C: richer per-session project info than just the canonical string.
 * Includes the displayName + source so the UI can render a "ⓘ" hint when
 * the value came from the lossy heuristic instead of a real `cwd` sniff.
 */
export interface SessionProjectInfo {
  canonical: string;
  displayName: string;
  source: DisplayNameSource;
}
export type SessionProjectMap = Map<string, SessionProjectInfo>;

/**
 * R2 S4 / R2.2 M-R2-1 / R3 §C — stamp `record.project` (+ display +
 * source) on every session record so the insights + UI layers don't
 * have to re-derive from filename.
 *
 * Sources, in order of preference:
 *   1. Records that already carry `project` (the native runner pre-stamps
 *      now — see `native/runner.ts.bucketBySession`).
 *   2. The `sessionIdToInfo` map (built by the caller from a discovered
 *      `~/.claude/projects/**` walk + per-file cwd-sniff). This is what
 *      closes M-R2-1 for the ccusage source (which has no file-path
 *      signal in its `--json`) and powers the §C cwd-derived displayName.
 *   3. `metadata.project` upstream hint (future-proof).
 *   4. `undefined` (the rollup treats this as the absent state).
 */
export function stampProjects(
  records: UsageRecord[],
  sessionIdToInfo: SessionProjectMap = new Map(),
): UsageRecord[] {
  return records.map((r) => {
    if (r.project != null && r.project !== "") return r;
    // (2) sessionId → SessionProjectInfo map built from a fs walk + cwd-sniff.
    const info = sessionIdToInfo.get(r.period);
    if (info) {
      return {
        ...r,
        project: info.canonical,
        projectDisplay: info.displayName,
        projectDisplaySource: info.source,
      };
    }
    // (3) future-proof: optional `metadata.project` upstream hint.
    const meta = r.metadata as (Record<string, unknown> | undefined);
    const upstream = meta && typeof meta["project"] === "string" ? (meta["project"] as string) : null;
    if (upstream && upstream !== "") {
      const dec = decodeProject(upstream);
      return {
        ...r,
        project: dec.canonical,
        projectDisplay: dec.displayName,
        projectDisplaySource: dec.displayNameSource,
      };
    }
    return r;
  });
}

/**
 * R2.2 + R3 §C — walk the on-disk projects tree and build a
 * `<sessionId> → SessionProjectInfo` map. Called per-poll.
 *
 * R3 §C extension: optionally sniff each file's first line for the
 * `cwd` field so the displayName is high-quality (`ccusage-web` rather
 * than the lossy `web` heuristic). The sniff is gated by
 * `sniffCwd: true` (default; pass `false` in tests that don't need the
 * filesystem read). At most one read per discovered file — cheap; aligns
 * with the "cache at top of runOnce" pattern from R2.2's perf shape.
 *
 * Pluggable `discover` + `readFile` for tests.
 */
export interface ProjectMapDeps {
  discover?: () => string[];
  /** R3 §C: per-file first-line reader. Defaults to fs.readFileSync. */
  readFile?: (path: string) => string;
  /** R3 §C: enable cwd-sniff. Default true. Disable in unit tests that don't need it. */
  sniffCwd?: boolean;
}
export function buildSessionProjectMap(deps: ProjectMapDeps = {}): SessionProjectMap {
  const discover = deps.discover ?? discoverJsonlFiles;
  const readFile = deps.readFile ?? ((p: string): string => {
    try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
  });
  const sniffCwd = deps.sniffCwd !== false;
  const out: SessionProjectMap = new Map();
  let files: string[] = [];
  try { files = discover(); } catch { /* discovery may throw on unusual fs configs */ }
  for (const file of files) {
    const sessionId = path.basename(file, ".jsonl");
    if (!sessionId) continue;
    // R3 §C cwd-sniff: read just enough to find the first JSON line and
    // pull `cwd`. Bail early if the file is huge — we only need one line.
    let cwd: string | undefined;
    if (sniffCwd) {
      try {
        const text = readFile(file);
        if (text) {
          const firstNewline = text.indexOf("\n");
          const firstLine = firstNewline >= 0 ? text.slice(0, firstNewline) : text;
          if (firstLine.trim()) {
            try {
              const parsed = JSON.parse(firstLine) as { cwd?: unknown };
              if (typeof parsed.cwd === "string" && parsed.cwd.trim() !== "") {
                cwd = parsed.cwd;
              }
            } catch { /* malformed first line — skip cwd, fall through to heuristic */ }
          }
        }
      } catch { /* unreadable file — skip cwd */ }
    }
    const dec = decodeProject({ fullPath: file, cwd });
    if (dec.canonical && dec.canonical !== "unknown") {
      out.set(sessionId, {
        canonical: dec.canonical,
        displayName: dec.displayName,
        source: dec.displayNameSource,
      });
    }
  }
  return out;
}

export function createPoller(deps: PollerDeps): Poller {
  const now = deps.now ?? (() => new Date());
  const tz = deps.tz ?? "UTC";
  const parserMode = deps.parserMode ?? "fallback";
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
        derived: computeDerived(buckets, now(), { tz, parserMode }),
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
