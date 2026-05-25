import { Router, type Response } from "express";
import type { SnapshotStore } from "./snapshot-store.js";
import type { SseHub } from "./sse-hub.js";
import { bucketHourly, getTodayKey } from "./insights/index.js";

export interface RoutesDeps {
  store: SnapshotStore;
  hub: SseHub;
  refresh: () => Promise<void>;
  /** IANA timezone fallback when the request doesn't supply one. */
  tz?: string;
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

  return r;
}
