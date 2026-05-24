import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createSnapshotStore } from "../snapshot-store";
import { createSseHub } from "../sse-hub";
import { createRoutes } from "../routes";
import type { Snapshot } from "../types";

function snap(at: string): Snapshot {
  return {
    generatedAt: at, ccusageVersion: "1.0.0",
    daily:   { records: [] }, weekly:  { records: [] },
    monthly: { records: [] }, session: { records: [] },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 0, cost: 0 }, week:    { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 }, allTime: { tokens: 0, cost: 0 },
      activeBlock: null, activeSessionCount: 0,
    },
  };
}

function makeApp(opts: { runOnce?: () => Promise<void>; populated?: boolean }) {
  const store = createSnapshotStore();
  if (opts.populated) store.set(snap("2026-05-24T10:00:00Z"));
  const hub = createSseHub();
  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes({ store, hub, refresh: opts.runOnce ?? (async () => {}) }));
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
});
