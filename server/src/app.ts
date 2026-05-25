import express from "express";
import path from "node:path";
import { createSnapshotStore } from "./snapshot-store.js";
import { createSseHub } from "./sse-hub.js";
import { createRoutes } from "./routes.js";
import { createPoller } from "./poller.js";
import { createCcusageUpdater, runNpmInstall } from "./ccusage-updater.js";
import { runCcusage, getCcusageVersion } from "./ccusage-runner.js";
import { runNative } from "./native/index.js";
import type { Snapshot } from "./types.js";

export type UsageSource = "ccusage" | "native";

export interface AppConfig {
  port: number;
  pollIntervalMs: number;
  ccusageTimeoutMs: number;
  ccusageBin: string;
  autoUpdateIntervalMs: number;
  staticDir: string;
  /** IANA timezone for today/week/month key derivation. */
  tz: string;
  /**
   * Where the poller reads usage from. `ccusage` (default) shells out to
   * the installed binary; `native` walks `~/.claude/projects/**` directly
   * via the in-tree parser. M6 cutover lives behind this flag; the flip-
   * default decision is gated by the golden-parity test and a soak round
   * (Researcher v2 §C.4 steps M6.c → M6.d).
   */
  usageSource: UsageSource;
}

export function buildApp(cfg: AppConfig) {
  const store = createSnapshotStore();
  const hub = createSseHub();
  // M6: route through the native loader when `USAGE_SOURCE=native`; default
  // stays on the `ccusage` shell-out path so this commit can land without
  // changing observed behavior on any existing deploy.
  const useNative = cfg.usageSource === "native";
  const runner = useNative
    ? <T>(cmd: string): Promise<T> => runNative<T>(cmd, { tz: cfg.tz })
    : <T>(cmd: string): Promise<T> => runCcusage<T>(cmd, { bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs });
  const versionFn = useNative
    ? async (): Promise<string> => "native"
    : (): Promise<string> => getCcusageVersion({ bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs });

  const poller = createPoller({
    store,
    runCcusage: runner,
    getVersion: versionFn,
    intervalMs: cfg.pollIntervalMs,
    tz: cfg.tz,
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
  app.use("/api", createRoutes({ store, hub, refresh: () => poller.runOnce(), tz: cfg.tz }));
  app.use(express.static(cfg.staticDir));
  // SPA fallback
  app.get("*", (_req, res) => res.sendFile(path.join(cfg.staticDir, "index.html")));

  return { app, store, hub, poller, updater };
}
