import express from "express";
import path from "node:path";
import { createSnapshotStore } from "./snapshot-store.js";
import { createSseHub } from "./sse-hub.js";
import { createRoutes } from "./routes.js";
import { createPoller } from "./poller.js";
import { createCcusageUpdater, runNpmInstall } from "./ccusage-updater.js";
import { runCcusage, getCcusageVersion } from "./ccusage-runner.js";
import type { Snapshot } from "./types.js";

export interface AppConfig {
  port: number;
  pollIntervalMs: number;
  ccusageTimeoutMs: number;
  ccusageBin: string;
  autoUpdateIntervalMs: number;
  staticDir: string;
}

export function buildApp(cfg: AppConfig) {
  const store = createSnapshotStore();
  const hub = createSseHub();
  const poller = createPoller({
    store,
    runCcusage: (cmd: string) => runCcusage(cmd, { bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs }),
    getVersion: () => getCcusageVersion({ bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs }),
    intervalMs: cfg.pollIntervalMs,
  });
  store.subscribe((snap: Snapshot) => hub.broadcast(snap));

  const updater = createCcusageUpdater({
    intervalMs: cfg.autoUpdateIntervalMs,
    install: async () => {
      await runNpmInstall();
      return getCcusageVersion({ bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs });
    },
    onVersion: (v: string) => console.log(`[updater] ccusage now ${v}`),
  });

  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes({ store, hub, refresh: () => poller.runOnce() }));
  app.use(express.static(cfg.staticDir));
  // SPA fallback
  app.get("*", (_req, res) => res.sendFile(path.join(cfg.staticDir, "index.html")));

  return { app, store, hub, poller, updater };
}
