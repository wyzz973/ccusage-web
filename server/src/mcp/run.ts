// R3.4.AC2 — `npm run mcp` entry. Spins up an in-process poller against
// the same snapshot store, then runs the MCP adapter over stdio. The
// http server is intentionally NOT started — MCP is a sibling surface.
//
// USAGE: `npm run --workspace=server mcp` (after `npm run --workspace=server build`).
//        Or `npx tsx server/src/mcp/run.ts` in dev.

import { runMcpServer } from "./index.js";
import { createSnapshotStore } from "../snapshot-store.js";
import { createPoller } from "../poller.js";
import { runCcusage, getCcusageVersion } from "../ccusage-runner.js";
import { runNative } from "../native/index.js";
import { loadConfig } from "../insights/config-loader.js";

async function main(): Promise<void> {
  const store = createSnapshotStore();
  const tz = process.env["TZ"] ?? "UTC";
  const usageSource = (process.env["USAGE_SOURCE"] === "native") ? "native" : "ccusage";
  const ccusageBin = process.env["CCUSAGE_BIN"] ?? "ccusage";
  const ccusageTimeoutMs = Number(process.env["CCUSAGE_TIMEOUT_MS"] ?? 30_000);
  const pollIntervalMs   = Number(process.env["POLL_INTERVAL_MS"]  ?? 5_000);

  // Share the config-loader stack with the HTTP path so MCP + HTTP
  // agree on the same `--start-of-week` / `--token-limit` / etc.
  const loaded = loadConfig();
  const extraArgs: string[] = [];
  if (loaded.mergedFrom.length > 0) extraArgs.push("--config", loaded.mergedFrom[0]!);
  if (loaded.config.startOfWeek) extraArgs.push("--start-of-week", loaded.config.startOfWeek);
  if (loaded.config.tokenLimit != null && loaded.config.tokenLimit > 0) {
    extraArgs.push("--token-limit", String(loaded.config.tokenLimit));
  }
  const resolvedMode = loaded.config.costMode ?? "calculate";
  extraArgs.push("--mode", resolvedMode);

  const useNative = usageSource === "native";
  const runner = useNative
    ? <T,>(cmd: string): Promise<T> => runNative<T>(cmd, { tz, mode: resolvedMode })
    : <T,>(cmd: string): Promise<T> => runCcusage<T>(cmd, { bin: ccusageBin, timeoutMs: ccusageTimeoutMs, extraArgs });
  const versionFn = useNative
    ? async (): Promise<string> => "native"
    : (): Promise<string> => getCcusageVersion({ bin: ccusageBin, timeoutMs: ccusageTimeoutMs });

  const poller = createPoller({
    store,
    runCcusage: runner,
    getVersion: versionFn,
    intervalMs: pollIntervalMs,
    tz,
    parserMode: useNative ? "native" : "fallback",
    startOfWeek: loaded.config.startOfWeek,
  });
  poller.start();

  // Stderr-only log so MCP stdout stays clean for JSON-RPC.
  process.stderr.write(`[ccusage-web/mcp] starting (usageSource=${usageSource}, tz=${tz})\n`);
  runMcpServer({ store });
}

main().catch((e: Error) => {
  process.stderr.write(`[ccusage-web/mcp] fatal: ${e.stack ?? e.message}\n`);
  process.exit(1);
});
