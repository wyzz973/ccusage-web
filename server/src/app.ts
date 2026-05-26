import express from "express";
import path from "node:path";
import { createSnapshotStore } from "./snapshot-store.js";
import { createSseHub } from "./sse-hub.js";
import { createRoutes } from "./routes.js";
import { createPoller } from "./poller.js";
import { createCcusageUpdater, runNpmInstall } from "./ccusage-updater.js";
import { runCcusage, getCcusageVersion } from "./ccusage-runner.js";
import { runNative } from "./native/index.js";
import { loadConfig } from "./insights/config-loader.js";
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
  // R3.9–R3.12 — resolve the active config via the priority chain at boot.
  // Surfaced on `/api/health` via the routes layer + used by the runner
  // (R3.1 / R3.2 / R3.7 flag passthrough). CLI override (`--config PATH`)
  // is wired through `process.env.CCUSAGE_CONFIG` per the env layer.
  const loadedConfig = loadConfig();
  // M6: route through the native loader when `USAGE_SOURCE=native`; default
  // stays on the `ccusage` shell-out path so this commit can land without
  // changing observed behavior on any existing deploy.
  const useNative = cfg.usageSource === "native";
  // R3.1 / R3.2 / R3.7 — derive ccusage CLI flag passthroughs from the
  // loaded config. Each flag only added when the config value is set
  // (otherwise we trust ccusage's own defaults). Native source ignores
  // these (uses period-keys.ts + insights internally) — the period-key
  // helper already accepts the same week-start values via R3.2.
  const ccusageExtraArgs: string[] = [];
  // R3.1: --config <path> passthrough (env CCUSAGE_CONFIG wins per
  // priority chain; surface the active file to the binary too so its
  // own behaviour aligns with ours).
  if (loadedConfig.mergedFrom.length > 0) {
    // Pick the highest-priority file (head of mergedFrom).
    const top = loadedConfig.mergedFrom[0]!;
    ccusageExtraArgs.push("--config", top);
  }
  // R3.2: --start-of-week
  if (loadedConfig.config.startOfWeek) {
    ccusageExtraArgs.push("--start-of-week", loadedConfig.config.startOfWeek);
  }
  // R3.7: --token-limit (the server-side flag passthrough portion of B9)
  if (loadedConfig.config.tokenLimit != null && loadedConfig.config.tokenLimit > 0) {
    ccusageExtraArgs.push("--token-limit", String(loadedConfig.config.tokenLimit));
  }
  // R4.5 B16: --session-length passthrough (default 5h per iter0-R1 §5)
  if (loadedConfig.config.sessionLengthHours != null && loadedConfig.config.sessionLengthHours > 0) {
    ccusageExtraArgs.push("--session-length", String(loadedConfig.config.sessionLengthHours));
  }
  // R3 §D: --mode resolved (`calculate` default; config can override).
  const resolvedMode = loadedConfig.config.costMode ?? "calculate";
  ccusageExtraArgs.push("--mode", resolvedMode);

  const runner = useNative
    ? <T>(cmd: string): Promise<T> => runNative<T>(cmd, {
        tz: cfg.tz,
        mode: resolvedMode,
        sessionLengthHours: loadedConfig.config.sessionLengthHours,
      })
    : <T>(cmd: string): Promise<T> => runCcusage<T>(cmd, {
        bin: cfg.ccusageBin,
        timeoutMs: cfg.ccusageTimeoutMs,
        extraArgs: ccusageExtraArgs,
      });
  const versionFn = useNative
    ? async (): Promise<string> => "native"
    : (): Promise<string> => getCcusageVersion({ bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs });

  const poller = createPoller({
    store,
    runCcusage: runner,
    getVersion: versionFn,
    intervalMs: cfg.pollIntervalMs,
    tz: cfg.tz,
    // M6.d — stamp `derived.mode.parser` honestly from the active source.
    // The UI's ModeBadgesV1 mounts off this; post-M6.d-flip auto-fallback
    // will rewrite this string when soak-drift trips.
    parserMode: useNative ? "native" : "fallback",
    // R3.2 — week-start anchor pulled from the loaded config.
    startOfWeek: loadedConfig.config.startOfWeek,
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
  app.use("/api", createRoutes({
    store, hub,
    refresh: () => poller.runOnce(),
    tz: cfg.tz,
    config: loadedConfig,
    // R4.4 — pass through ccusage bin for per-agent shellouts;
    // perAgentTask default uses `runCcusageAgent(agent, "session", ...)`.
    ccusageBin: cfg.ccusageBin,
  }));
  app.use(express.static(cfg.staticDir));
  // SPA fallback
  app.get("*", (_req, res) => res.sendFile(path.join(cfg.staticDir, "index.html")));

  return { app, store, hub, poller, updater };
}
