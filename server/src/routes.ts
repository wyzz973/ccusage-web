import { Router, type Response } from "express";
import type { SnapshotStore } from "./snapshot-store.js";
import type { SseHub } from "./sse-hub.js";
import {
  bucketHourly, getTodayKey,
  shellPerAgent, PER_AGENT_BUDGET_MS,
} from "./insights/index.js";
import type { UsageRecord } from "./types.js";

export interface RoutesDeps {
  store: SnapshotStore;
  hub: SseHub;
  refresh: () => Promise<void>;
  /** IANA timezone fallback when the request doesn't supply one. */
  tz?: string;
  /**
   * R3.6 — per-agent budget override (defaults to spec-v3 §1.4's 800 ms).
   * Test-only escape hatch; production should leave it at the default.
   */
  perAgentBudgetMs?: number;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createRoutes(deps: RoutesDeps): Router {
  const r = Router();
  const fallbackTz = deps.tz ?? "UTC";

  r.get("/snapshot", (_req, res: Response) => {
    const snap = deps.store.get();
    if (!snap) {
      res.status(503).json({ error: "snapshot not ready" });
      return;
    }
    res.json(snap);
  });

  r.get("/events", (_req, res) => {
    deps.hub.attach(res, deps.store.get());
  });

  r.post("/refresh", async (_req, res) => {
    await deps.refresh();
    res.json({ ok: true, generatedAt: deps.store.get()?.generatedAt ?? null });
  });

  r.get("/health", (_req, res) => {
    res.json(deps.store.getHealth());
  });

  /**
   * D13 (R2) — thin statusline endpoint. One-line compact JSON for
   * shell-prompt / status-bar integrations that don't want to pull the
   * full snapshot. Always 200 with safe defaults so callers can pipe to
   * `jq` without branching.
   */
  r.get("/statusline", (_req, res) => {
    const snap = deps.store.get();
    if (!snap) {
      res.json({
        ready: false,
        today: { cost: 0, tokens: 0 },
        activeBlock: null,
        generatedAt: null,
      });
      return;
    }
    const active = snap.derived.activeBlock;
    res.json({
      ready: true,
      today: snap.derived.today,
      activeBlock: active
        ? {
          id: active.id,
          startTime: active.startTime,
          endTime: active.endTime,
          costUSD: active.costUSD,
          pctOfProjection: active.projection && active.projection.totalCost > 0
            ? Math.min(100, Math.round((active.costUSD / active.projection.totalCost) * 100))
            : null,
          isActive: active.isActive,
        }
        : null,
      driver: snap.derived.todayDrivers?.agent ?? null,
      generatedAt: snap.generatedAt,
      ccusageVersion: snap.ccusageVersion,
    });
  });

  /**
   * M-A2 (R1.5): hourly cost buckets for a single date in a given TZ.
   * Closes PRD §7.1 Tier 2 contract. The actual bucketing is done by the
   * pure `bucketHourly` insight; this route just shapes the request and
   * keeps the snapshot lookup at the edge.
   *
   * Returns 24 buckets *always* (zero-filled for hours without usage) so
   * the UI can render a stable x-axis even on quiet days.
   */
  r.get("/usage/hourly", (req, res) => {
    const dateRaw = typeof req.query.date === "string" ? req.query.date : "";
    const tzRaw   = typeof req.query.tz === "string" ? req.query.tz : "";
    const tz = tzRaw || fallbackTz;

    let date = dateRaw;
    if (!date) {
      date = getTodayKey(new Date(), tz);
    }
    if (!DATE_KEY_RE.test(date)) {
      res.status(400).json({ error: "invalid date; expected YYYY-MM-DD" });
      return;
    }
    try {
      // Validate the TZ early (Intl throws RangeError on bad IANA names).
      new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    } catch {
      res.status(400).json({ error: `invalid tz: ${tz}` });
      return;
    }

    const snap = deps.store.get();
    if (!snap) {
      res.status(503).json({ error: "snapshot not ready" });
      return;
    }
    const buckets = bucketHourly({
      sessionRecords: snap.session.records,
      todayKey: date,
      tz,
    });
    res.json({ date, tz, buckets });
  });

  /**
   * R3.6 — lazy per-agent rollup. The v1 UI's TrendChart fires this
   * once when the user flips the "By agent" toggle, then renders a
   * skeleton until the response lands. The route fans out across all
   * `detectedAgents` from the current snapshot using `shellPerAgent`,
   * so the wall-clock is bounded by the 800ms budget regardless of how
   * many agents are in play.
   *
   * The current implementation derives totals from the snapshot's
   * session records (in-memory; constant-time). The shape is intentionally
   * forward-compatible with a real per-agent shellout — `shellPerAgent`
   * doesn't care whether the task does IO or not. Future R4 can swap the
   * task body for `runCcusage("session", { extraArgs: ["--agent", agent] })`
   * once ccusage gains that flag, without changing the response contract.
   *
   * Response envelope mirrors `PerAgentSummary<{...}>` from per-agent.ts —
   * the UI consumes `status`, `succeeded`, `failed`, `timedOut`,
   * `elapsedMs`, `budgetMs` directly to drive its §3.2 state machine.
   */
  r.get("/per-agent", async (req, res) => {
    const dateRaw = typeof req.query.date === "string" ? req.query.date : "";
    const tzRaw   = typeof req.query.tz   === "string" ? req.query.tz   : "";
    const tz = tzRaw || fallbackTz;

    let date = dateRaw;
    if (!date) date = getTodayKey(new Date(), tz);
    if (!DATE_KEY_RE.test(date)) {
      res.status(400).json({ error: "invalid date; expected YYYY-MM-DD" });
      return;
    }

    const snap = deps.store.get();
    if (!snap) {
      res.status(503).json({ error: "snapshot not ready" });
      return;
    }

    const agents = snap.derived.detectedAgents ?? [];
    if (agents.length === 0) {
      // No detected agents → nothing to fan out. Return the empty-success
      // shape so the UI doesn't need a special-case branch.
      res.json({
        date, tz,
        status: "ok",
        succeeded: [], failed: [], timedOut: [],
        elapsedMs: 0,
        budgetMs: deps.perAgentBudgetMs ?? PER_AGENT_BUDGET_MS,
      });
      return;
    }

    // Per-agent task: today's session records filtered to `agent`, summed.
    // The signal isn't honored here because the work is sync-after-await;
    // when this swaps to a real shellout in R4 the runner will honor it.
    const todaysSessions = snap.session.records.filter((s: UsageRecord) => {
      const t = s.metadata?.lastActivity;
      if (!t) return false;
      const ms = Date.parse(t);
      if (!Number.isFinite(ms)) return false;
      const dayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(ms));
      return dayKey === date;
    });

    const summary = await shellPerAgent<{ totalCostUSD: number; totalTokens: number; sessionCount: number }>({
      agents,
      budgetMs: deps.perAgentBudgetMs ?? PER_AGENT_BUDGET_MS,
      task: async (agent, _signal) => {
        const rs = todaysSessions.filter((s) => s.agent === agent);
        let totalCostUSD = 0;
        let totalTokens = 0;
        for (const s of rs) {
          totalCostUSD += Number.isFinite(s.totalCost)   ? s.totalCost   : 0;
          totalTokens  += Number.isFinite(s.totalTokens) ? s.totalTokens : 0;
        }
        return { totalCostUSD, totalTokens, sessionCount: rs.length };
      },
    });

    res.json({ date, tz, ...summary });
  });

  return r;
}
