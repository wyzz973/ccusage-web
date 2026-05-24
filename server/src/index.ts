import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cfg = {
  port: Number(process.env.PORT ?? 47821),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 2000),
  ccusageTimeoutMs: Number(process.env.CCUSAGE_TIMEOUT_MS ?? 30000),
  ccusageBin: process.env.CCUSAGE_BIN ?? "ccusage",
  autoUpdateIntervalMs: Number(process.env.CCUSAGE_AUTO_UPDATE_INTERVAL_MS ?? 86_400_000),
  staticDir: path.resolve(__dirname, "public"),
};

const { app, poller, updater, hub } = buildApp(cfg);

await poller.runOnce().catch((e: unknown) => console.error("[startup poll]", e));
poller.start();
updater.start();
hub.startHeartbeat(15_000);

app.listen(cfg.port, () => {
  console.log(`ccusage-web listening on :${cfg.port}`);
});
