import { Router, type Response } from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { SnapshotStore } from "./snapshot-store.js";
import type { SseHub } from "./sse-hub.js";
import {
  bucketHourly, getTodayKey,
  shellPerAgent, PER_AGENT_BUDGET_MS,
} from "./insights/index.js";
import type { LoadedConfig } from "./insights/config-loader.js";
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
  /**
   * R3.9 — the active LoadedConfig (resolved at app boot from the
   * priority chain). Surfaced verbatim on `/api/health` for debug
   * visibility, and the `mergedFrom: string[]` provenance closes
   * R3.9.AC2.
   */
  config?: LoadedConfig;
  /** R3.12 — overridable schema path for tests. Defaults to `docs/config-schema.json`. */
  configSchemaPath?: string;
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
    // R3.9.AC2: surface the active config's mergedFrom provenance on
    // /api/health so an ops sweep can see which files contributed
    // without grepping the loader logs.
    const base = deps.store.getHealth();
    const enriched = deps.config
      ? { ...base, config: { mergedFrom: deps.config.mergedFrom, active: deps.config.config } }
      : base;
    res.json(enriched);
  });

  /**
   * R4.5 B12 — debug snapshot. Returns internal state for ops + UI's
   * "Debug snapshot" footer link (opens in new tab). Read-only; no
   * sensitive data (snapshot is already public via `/api/snapshot`,
   * config is already public via `/api/health`).
   */
  r.get("/debug", (_req, res) => {
    const snap = deps.store.get();
    const health = deps.store.getHealth();
    res.json({
      generatedAt: new Date().toISOString(),
      health,
      snapshot: snap ? {
        generatedAt: snap.generatedAt,
        ccusageVersion: snap.ccusageVersion,
        recordCounts: {
          daily:   snap.daily.records.length,
          weekly:  snap.weekly.records.length,
          monthly: snap.monthly.records.length,
          session: snap.session.records.length,
          blocks:  snap.blocks.records.length,
        },
        derived: {
          detectedAgents: snap.derived.detectedAgents ?? [],
          mode: snap.derived.mode ?? null,
          activeBlockId: snap.derived.activeBlock?.id ?? null,
          activeSessionCount: snap.derived.activeSessionCount,
        },
      } : null,
      config: deps.config ? { mergedFrom: deps.config.mergedFrom, active: deps.config.config } : null,
      // R4.5 B12.AC1 mentions pricing-snapshot date; R4.10 updated rates
      // via hand-merge. We don't carry an explicit date field on
      // pricing-data.ts, so surface what we have: a row count + the
      // R4.10 marker.
      pricing: { snapshotMarker: "R4.10-2026-11" },
    });
  });

  /**
   * R3.12.AC3 — JSON schema endpoint for IDE autocomplete + tooling.
   * Returns the static schema verbatim with `application/schema+json`
   * content-type (per draft-07 IANA registration).
   */
  r.get("/config-schema", (_req, res) => {
    try {
      // Resolve from the source-relative path so the route works in
      // both dev (tsx) and built (dist/) modes. Override via
      // `deps.configSchemaPath` in tests.
      let schemaPath = deps.configSchemaPath;
      if (!schemaPath) {
        const here = fileURLToPath(import.meta.url);
        // <repo>/server/src/routes.ts → walk up to <repo> then docs/.
        // (built bundle path is symmetric to <repo>/server/dist/...).
        const repoRoot = path.resolve(path.dirname(here), "..", "..");
        schemaPath = path.join(repoRoot, "docs", "config-schema.json");
      }
      const text = fs.readFileSync(schemaPath, "utf8");
      res.type("application/schema+json").send(text);
    } catch (e) {
      res.status(500).json({ error: `config-schema unavailable: ${(e as Error).message}` });
    }
  });

  // R4.5 B18 — `?cache=N` server-side caching window (seconds). Stored
  // here at route-creation time so multiple requests within the window
  // share the same response payload.
  let statuslineCache: { until: number; payload: unknown } | null = null;

  /**
   * D13 (R2) — thin statusline endpoint. One-line compact JSON for
   * shell-prompt / status-bar integrations that don't want to pull the
   * full snapshot. Always 200 with safe defaults so callers can pipe to
   * `jq` without branching.
   *
   * R4.5 B18 — `?cache=N` server-side caches response for N seconds.
   * R4.5 B19 — `?refresh=N` adds `Cache-Control: max-age=N` hint for
   * consumers; doesn't change server behaviour beyond the header.
   */
  r.get("/statusline", (req, res) => {
    // R4.5 B19: refresh-interval hint via Cache-Control (does not affect
    // server-side cache; just signals to the consumer how often to poll).
    const refreshRaw = typeof req.query.refresh === "string" ? Number(req.query.refresh) : NaN;
    if (Number.isFinite(refreshRaw) && refreshRaw > 0) {
      res.setHeader("Cache-Control", `max-age=${Math.floor(refreshRaw)}`);
    }
    // R4.5 B18: server-side cache hit.
    const cacheRaw = typeof req.query.cache === "string" ? Number(req.query.cache) : NaN;
    const cacheSeconds = (Number.isFinite(cacheRaw) && cacheRaw > 0) ? Math.floor(cacheRaw) : 0;
    const nowMs = Date.now();
    if (cacheSeconds > 0 && statuslineCache && nowMs < statuslineCache.until) {
      res.json(statuslineCache.payload);
      return;
    }

    const snap = deps.store.get();
    let payload: unknown;
    if (!snap) {
      payload = {
        ready: false,
        today: { cost: 0, tokens: 0 },
        activeBlock: null,
        generatedAt: null,
      };
    } else {
      const active = snap.derived.activeBlock;
      payload = {
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
      };
    }
    if (cacheSeconds > 0) {
      statuslineCache = { until: nowMs + cacheSeconds * 1000, payload };
    }
    res.json(payload);
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
