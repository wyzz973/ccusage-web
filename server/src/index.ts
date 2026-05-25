import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseUsageSource(raw: string | undefined): "ccusage" | "native" {
  if (raw === "native") return "native";
  return "ccusage";
}

const cfg = {
  port: Number(process.env.PORT ?? 47821),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 2000),
  ccusageTimeoutMs: Number(process.env.CCUSAGE_TIMEOUT_MS ?? 30000),
  ccusageBin: process.env.CCUSAGE_BIN ?? "ccusage",
  autoUpdateIntervalMs: Number(process.env.CCUSAGE_AUTO_UPDATE_INTERVAL_MS ?? 86_400_000),
  staticDir: path.resolve(__dirname, "public"),
  // TZ honors the standard env var; falls back to UTC. Round-1 bug fix #3:
  // today/week/month buckets now roll over at local midnight, not 00:00 UTC.
  tz: process.env.TZ ?? "UTC",
  // M6 (R2): in-tree native loader vs shell-out to ccusage. Default `ccusage`
  // so this flag landing doesn't change behavior on any existing deploy.
  // Flip to `native` to opt into the in-tree parser. Researcher v2 §C.4
  // step M6.d will flip the default once soak validates parity.
  usageSource: parseUsageSource(process.env.USAGE_SOURCE),
};

const { app, poller, updater, hub } = buildApp(cfg);

await poller.runOnce().catch((e: unknown) => console.error("[startup poll]", e));
poller.start();
updater.start();
hub.startHeartbeat(15_000);

app.listen(cfg.port, () => {
  console.log(`ccusage-web listening on :${cfg.port}`);
});
