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

    it("fans out per detected agent and aggregates today's sessions", async () => {
      const { app } = makeApp({
        populated: true,
        sessionRecords: [
          sess("2026-05-25T10:00:00Z", 1.5, "claude", 100),
          sess("2026-05-25T11:00:00Z", 2.5, "claude", 200),
          sess("2026-05-25T12:00:00Z", 3.0, "codex",  300),
          sess("2026-05-24T10:00:00Z", 99,  "claude", 999), // wrong day → excluded
        ],
        detectedAgents: ["claude", "codex"],
      });
      const res = await request(app).get("/api/per-agent?date=2026-05-25&tz=UTC");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.succeeded).toHaveLength(2);
      const claude = res.body.succeeded.find((s: { agent: string }) => s.agent === "claude");
      const codex  = res.body.succeeded.find((s: { agent: string }) => s.agent === "codex");
      expect(claude.data).toEqual({ totalCostUSD: 4.0, totalTokens: 300, sessionCount: 2 });
      expect(codex.data).toEqual({ totalCostUSD: 3.0, totalTokens: 300, sessionCount: 1 });
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
  });
});
