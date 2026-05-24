import type { Response } from "express";

export interface SseHub {
  attach(res: Response, initialSnapshot: unknown): void;
  broadcast(snapshot: unknown): void;
  emitError(message: string, lastSuccessAt: string | null): void;
  startHeartbeat(intervalMs: number): () => void;
  size(): number;
}

export function createSseHub(): SseHub {
  const clients = new Set<Response>();

  function writeEvent(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  return {
    attach(res, initialSnapshot) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      clients.add(res);
      res.on("close", () => clients.delete(res));
      if (initialSnapshot != null) writeEvent(res, "snapshot", initialSnapshot);
    },
    broadcast(snapshot) {
      for (const c of clients) writeEvent(c, "update", snapshot);
    },
    emitError(message, lastSuccessAt) {
      for (const c of clients) writeEvent(c, "error", { message, lastSuccessAt });
    },
    startHeartbeat(intervalMs) {
      const t = setInterval(() => {
        for (const c of clients) c.write(":hb\n\n");
      }, intervalMs);
      return () => clearInterval(t);
    },
    size() { return clients.size; },
  };
}
