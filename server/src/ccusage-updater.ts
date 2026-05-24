import { spawn } from "node:child_process";

export interface UpdaterDeps {
  intervalMs: number;
  install: () => Promise<string>;
  onVersion: (v: string) => void;
}

export interface Updater {
  start(): void;
  stop(): void;
}

export async function runNpmInstall(timeoutMs = 180_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("npm", ["install", "-g", "ccusage@latest", "--silent"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.on("error", (e) => { clearTimeout(t); reject(e); });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`npm install failed (${code}): ${stderr.slice(0, 500)}`));
      resolve("ok");
    });
  });
}

export function createCcusageUpdater(deps: UpdaterDeps): Updater {
  if (deps.intervalMs === 0) return { start() {}, stop() {} };
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const version = await deps.install();
      deps.onVersion(version);
    } catch (err) {
      console.warn(`[ccusage-updater] update failed, keeping previous install: ${(err as Error).message}`);
    } finally {
      if (!stopped) timer = setTimeout(tick, deps.intervalMs);
    }
  }

  return {
    start() { timer = setTimeout(tick, 0); },
    stop()  { stopped = true; if (timer) { clearTimeout(timer); timer = null; } },
  };
}
