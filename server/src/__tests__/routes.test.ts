import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createSnapshotStore } from "../snapshot-store";
import { createSseHub } from "../sse-hub";
import { createRoutes } from "../routes";
import type { Snapshot, UsageRecord } from "../types";

function snap(at: string, sessionRecords: UsageRecord[] = [], detectedAgents: string[] = []): Snapshot {
  return {
    generatedAt: at, ccusageVersion: "1.0.0",
    daily:   { records: [] }, weekly:  { records: [] },
    monthly: { records: [] }, session: { records: sessionRecords },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 0, cost: 0 }, week:    { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 }, allTime: { tokens: 0, cost: 0 },
      activeBlock: null, activeSessionCount: 0,
      detectedAgents,
    },
  };
}

function sess(lastActivity: string, cost: number, agent = "claude", tokens = 0): UsageRecord {
  return {
    period: `sess-${lastActivity}-${agent}`, agent,
    totalTokens: tokens, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: { lastActivity },
  };
}

function makeApp(opts: {
  runOnce?: () => Promise<void>;
  populated?: boolean;
  sessionRecords?: UsageRecord[];
  detectedAgents?: string[];
  tz?: string;
  perAgentBudgetMs?: number;
  config?: { mergedFrom: string[]; config: Record<string, unknown> };
  configSchemaPath?: string;
  perAgentTask?: (agent: string, signal: AbortSignal) => Promise<{
    totalCostUSD: number; totalTokens: number; sessionCount: number;
  }>;
}) {
  const store = createSnapshotStore();
  if (opts.populated) store.set(snap("2026-05-24T10:00:00Z", opts.sessionRecords ?? [], opts.detectedAgents ?? []));
  const hub = createSseHub();
  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes({
    store, hub,
    refresh: opts.runOnce ?? (async () => {}),
    tz: opts.tz,
    perAgentBudgetMs: opts.perAgentBudgetMs,
    config: opts.config as never,
    configSchemaPath: opts.configSchemaPath,
    perAgentTask: opts.perAgentTask,
  }));
  return { app, store, hub };
}

describe("routes", () => {
  it("GET /api/snapshot returns 503 when empty", async () => {
    const { app } = makeApp({});
    const res = await request(app).get("/api/snapshot");
    expect(res.status).toBe(503);
  });

  it("GET /api/snapshot returns snapshot when populated", async () => {
    const { app } = makeApp({ populated: true });
    const res = await request(app).get("/api/snapshot");
    expect(res.status).toBe(200);
    expect(res.body.generatedAt).toBe("2026-05-24T10:00:00Z");
  });

  it("POST /api/refresh calls refresh fn and returns ok", async () => {
    const refresh = vi.fn(async () => {});
    const { app } = makeApp({ runOnce: refresh, populated: true });
    const res = await request(app).post("/api/refresh");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it("GET /api/health returns store health", async () => {
    const { app } = makeApp({ populated: true });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.lastPollAt).toBe("2026-05-24T10:00:00Z");
  });

  // M-A2 (R1.5): hourly endpoint.
  describe("GET /api/usage/hourly", () => {
    it("returns 24 zero-filled buckets when no sessions match the date", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/usage/hourly?date=2026-05-25&tz=UTC");
      expect(res.status).toBe(200);
      expect(res.body.date).toBe("2026-05-25");
      expect(res.body.tz).toBe("UTC");
      expect(res.body.buckets).toHaveLength(24);
      expect(res.body.buckets.every((b: { cost: number }) => b.cost === 0)).toBe(true);
    });

    it("folds today's sessions into the correct hour-of-day buckets", async () => {
      const { app } = makeApp({
        populated: true,
        sessionRecords: [
          sess("2026-05-25T07:30:00Z", 1.5),  // 00:30 PDT → hour 0
          sess("2026-05-25T22:15:00Z", 2.5),  // 15:15 PDT → hour 15
        ],
      });
      const res = await request(app).get("/api/usage/hourly?date=2026-05-25&tz=America/Los_Angeles");
      expect(res.status).toBe(200);
      expect(res.body.buckets[0].cost).toBe(1.5);
      expect(res.body.buckets[15].cost).toBe(2.5);
    });

    it("uses today + fallback tz when query params are omitted", async () => {
      const { app } = makeApp({ populated: true, tz: "UTC" });
      const res = await request(app).get("/api/usage/hourly");
      expect(res.status).toBe(200);
      expect(res.body.tz).toBe("UTC");
      expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.body.buckets).toHaveLength(24);
    });

    it("returns 400 for an invalid date shape", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/usage/hourly?date=bogus&tz=UTC");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid date/);
    });

    it("returns 400 for an invalid TZ", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/usage/hourly?date=2026-05-25&tz=Not/A_Zone");
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid tz/);
    });

    it("returns 503 when snapshot isn't ready", async () => {
      const { app } = makeApp({});
      const res = await request(app).get("/api/usage/hourly?date=2026-05-25&tz=UTC");
      expect(res.status).toBe(503);
    });
  });

  // R3.9.AC2 + R3.12.AC3 — config endpoints.
  describe("config endpoints (R3.9 + R3.12)", () => {
    it("GET /api/health surfaces mergedFrom + active config when present", async () => {
      const { app } = makeApp({
        populated: true,
        config: { mergedFrom: ["/srv/cli.json"], config: { order: "asc" } },
      });
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.config).toEqual({
        mergedFrom: ["/srv/cli.json"],
        active: { order: "asc" },
      });
    });

    it("GET /api/health omits config field when no loaded config supplied", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.config).toBeUndefined();
    });

    it("GET /api/config-schema returns the JSON schema with schema+json content-type", async () => {
      const { app } = makeApp({});
      const res = await request(app).get("/api/config-schema");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/schema\+json/);
      const body = JSON.parse(res.text);
      expect(body.$schema).toMatch(/json-schema/);
      expect(body.properties.tokenLimit).toBeTruthy();
      expect(body.properties.startOfWeek.enum).toContain("monday");
    });

    it("GET /api/config-schema returns 500 with helpful error when schema file is missing", async () => {
      const { app } = makeApp({ configSchemaPath: "/definitely/not/here.json" });
      const res = await request(app).get("/api/config-schema");
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/config-schema unavailable/);
    });
  });

  // R3.6: lazy per-agent rollup.
  describe("GET /api/per-agent", () => {
    it("returns the empty-success shape when no agents are detected", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/per-agent?date=2026-05-25&tz=UTC");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.succeeded).toEqual([]);
      expect(res.body.failed).toEqual([]);
      expect(res.body.timedOut).toEqual([]);
      expect(res.body.budgetMs).toBe(800); // spec-v3 §1.4 default
    });

    it("fans out per detected agent — `perAgentTask` injection preserves R3 semantics", async () => {
      // R4.4 — production task body now does a real `ccusage <agent>
      // session --json --mode calculate --since/--until <YYYYMMDD>`
      // shellout, so this test injects a stub to verify the race
      // wrapper + envelope shape stay R3-stable.
      const stubTask = vi.fn(async (agent: string, _signal: AbortSignal) => ({
        totalCostUSD: agent === "claude" ? 4.0 : 3.0,
        totalTokens:  agent === "claude" ? 300 : 300,
        sessionCount: agent === "claude" ? 2 : 1,
      }));
      const { app } = makeApp({
        populated: true,
        detectedAgents: ["claude", "codex"],
        perAgentTask: stubTask,
      });
      const res = await request(app).get("/api/per-agent?date=2026-05-25&tz=UTC");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.succeeded).toHaveLength(2);
      const claude = res.body.succeeded.find((s: { agent: string }) => s.agent === "claude");
      const codex  = res.body.succeeded.find((s: { agent: string }) => s.agent === "codex");
      expect(claude.data).toEqual({ totalCostUSD: 4.0, totalTokens: 300, sessionCount: 2 });
      expect(codex.data).toEqual({ totalCostUSD: 3.0, totalTokens: 300, sessionCount: 1 });
      expect(stubTask).toHaveBeenCalledTimes(2);
      expect(stubTask).toHaveBeenCalledWith("claude", expect.anything());
      expect(stubTask).toHaveBeenCalledWith("codex", expect.anything());
    });

    it("R4.4: passes a real AbortSignal to the task (race wrapper contract)", async () => {
      let signalReceived: AbortSignal | null = null;
      const stubTask = async (_agent: string, signal: AbortSignal) => {
        signalReceived = signal;
        return { totalCostUSD: 0, totalTokens: 0, sessionCount: 0 };
      };
      const { app } = makeApp({
        populated: true,
        detectedAgents: ["claude"],
        perAgentTask: stubTask,
      });
      await request(app).get("/api/per-agent?date=2026-05-25&tz=UTC");
      expect(signalReceived).toBeInstanceOf(AbortSignal);
    });

    it("R4.4: thrown task error lands in `failed[]` (R3.6.AC5 silent-swallow preserved)", async () => {
      const stubTask = async (agent: string, _s: AbortSignal) => {
        if (agent === "codex") throw new Error("ccusage exit 2");
        return { totalCostUSD: 1, totalTokens: 100, sessionCount: 1 };
      };
      const { app } = makeApp({
        populated: true,
        detectedAgents: ["claude", "codex"],
        perAgentTask: stubTask,
      });
      const res = await request(app).get("/api/per-agent?date=2026-05-25&tz=UTC");
      expect(res.body.status).toBe("partial");
      expect(res.body.succeeded).toHaveLength(1);
      expect(res.body.failed).toHaveLength(1);
      expect(res.body.failed[0].agent).toBe("codex");
    });

    it("returns 400 for an invalid date shape", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/per-agent?date=bogus&tz=UTC");
      expect(res.status).toBe(400);
    });

    it("returns 503 when snapshot isn't ready", async () => {
      const { app } = makeApp({});
      const res = await request(app).get("/api/per-agent?date=2026-05-25&tz=UTC");
      expect(res.status).toBe(503);
    });

    it("falls back to today + fallback tz when query params are omitted", async () => {
      const { app } = makeApp({ populated: true, tz: "UTC" });
      const res = await request(app).get("/api/per-agent");
      expect(res.status).toBe(200);
      expect(res.body.tz).toBe("UTC");
      expect(res.body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // D13 (R2): thin statusline endpoint.
  describe("GET /api/statusline", () => {
    it("returns ready=false with safe defaults when snapshot empty", async () => {
      const { app } = makeApp({});
      const res = await request(app).get("/api/statusline");
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(false);
      expect(res.body.today).toEqual({ cost: 0, tokens: 0 });
      expect(res.body.activeBlock).toBeNull();
      expect(res.body.generatedAt).toBeNull();
    });

    it("returns ready=true with derived.today + ccusageVersion when populated", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/statusline");
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.today).toEqual({ tokens: 0, cost: 0 });
      expect(res.body.generatedAt).toBe("2026-05-24T10:00:00Z");
      expect(res.body.ccusageVersion).toBe("1.0.0");
    });

    // R4.5 B18: ?cache=N — server-side cache window.
    it("?cache=N serves the same payload to repeat requests within N seconds", async () => {
      const { app, store } = makeApp({ populated: true });
      const res1 = await request(app).get("/api/statusline?cache=5");
      const t1 = res1.body.generatedAt;
      // Mutate the store; without the cache, the next call would see the new value.
      store.set({
        generatedAt: "2026-05-25T11:11:11Z",
        ccusageVersion: "2.0.0",
        daily: { records: [] }, weekly: { records: [] }, monthly: { records: [] },
        session: { records: [] }, blocks: { records: [] },
        derived: {
          today:{tokens:0,cost:0}, week:{tokens:0,cost:0}, month:{tokens:0,cost:0}, allTime:{tokens:0,cost:0},
          activeBlock: null, activeSessionCount: 0,
        },
      });
      const res2 = await request(app).get("/api/statusline?cache=5");
      expect(res2.body.generatedAt).toBe(t1); // served from cache
    });

    it("no ?cache= → no server-side caching (each request reads fresh)", async () => {
      const { app, store } = makeApp({ populated: true });
      const res1 = await request(app).get("/api/statusline");
      store.set({
        generatedAt: "2026-05-25T11:11:11Z",
        ccusageVersion: "2.0.0",
        daily: { records: [] }, weekly: { records: [] }, monthly: { records: [] },
        session: { records: [] }, blocks: { records: [] },
        derived: {
          today:{tokens:0,cost:0}, week:{tokens:0,cost:0}, month:{tokens:0,cost:0}, allTime:{tokens:0,cost:0},
          activeBlock: null, activeSessionCount: 0,
        },
      });
      const res2 = await request(app).get("/api/statusline");
      expect(res2.body.generatedAt).not.toBe(res1.body.generatedAt);
    });

    // R4.5 B19: ?refresh=N — Cache-Control hint.
    it("?refresh=N sets Cache-Control: max-age=<N>", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/statusline?refresh=15");
      expect(res.headers["cache-control"]).toBe("max-age=15");
    });

    it("no ?refresh= → no Cache-Control header is set by the route", async () => {
      const { app } = makeApp({ populated: true });
      const res = await request(app).get("/api/statusline");
      // express may default-set cache-control; we assert the route didn't *override* it
      // with our max-age. Check absence of an `max-age=` value matching our pattern.
      const cc = res.headers["cache-control"] ?? "";
      expect(cc).not.toMatch(/max-age=\d/);
    });
  });

  // R4.5 B12 — /api/debug
  describe("GET /api/debug (R4.5 B12)", () => {
    it("returns generatedAt + health + null snapshot when store empty", async () => {
      const { app } = makeApp({});
      const res = await request(app).get("/api/debug");
      expect(res.status).toBe(200);
      expect(res.body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(res.body.health.status).toBe("ok");
      expect(res.body.snapshot).toBeNull();
    });

    it("returns recordCounts + derived hints when snapshot populated", async () => {
      const { app } = makeApp({
        populated: true,
        detectedAgents: ["claude", "codex"],
      });
      const res = await request(app).get("/api/debug");
      expect(res.status).toBe(200);
      expect(res.body.snapshot.recordCounts).toEqual({
        daily: 0, weekly: 0, monthly: 0, session: 0, blocks: 0,
      });
      expect(res.body.snapshot.derived.detectedAgents).toEqual(["claude", "codex"]);
      expect(res.body.snapshot.ccusageVersion).toBe("1.0.0");
      expect(res.body.pricing.snapshotMarker).toMatch(/R4\.10/);
    });

    it("returns config when supplied (mergedFrom + active)", async () => {
      const { app } = makeApp({
        populated: true,
        config: { mergedFrom: ["/srv/cfg.json"], config: { sessionLengthHours: 8 } },
      });
      const res = await request(app).get("/api/debug");
      expect(res.body.config).toEqual({
        mergedFrom: ["/srv/cfg.json"],
        active: { sessionLengthHours: 8 },
      });
    });
  });
});
