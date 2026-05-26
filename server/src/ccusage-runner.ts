import { spawn } from "node:child_process";

export interface RunnerOptions {
  bin: string;
  timeoutMs: number;
  extraArgs?: string[];
  /**
   * R3.6: optional cancellation. When fired, the running child is
   * SIGTERM'd (then SIGKILL after 1s — same chase as the timeout
   * branch already does). Lets `shellPerAgent` cancel slow shellouts
   * at the wall-clock budget so they don't zombie.
   */
  signal?: AbortSignal;
}

export async function runCcusage<T = unknown>(command: string, opts: RunnerOptions): Promise<T> {
  const args = [command, "--json", ...(opts.extraArgs ?? [])];
  return execAndParse(opts.bin, args, opts.timeoutMs, opts.signal);
}

export async function getCcusageVersion(opts: { bin: string; timeoutMs: number }): Promise<string> {
  const text = await execAndCollect(opts.bin, ["--version"], opts.timeoutMs);
  return text.trim();
}

async function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function execAndCollect(bin: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    let aborted = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
      reject(new Error(`ccusage ${args.join(" ")} timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // R3.6: honor caller-side abort (per-agent budget cancel). Same
    // SIGTERM-then-SIGKILL chase as the timeout branch so zombie
    // children are bounded by ~1s either way.
    const onAbort = (): void => {
      if (aborted) return;
      aborted = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
      reject(new Error(`ccusage ${args.join(" ")} aborted`));
    };
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const stdoutP = collectStream(child.stdout);
    const stderrP = collectStream(child.stderr);

    child.on("error", (e: Error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(e);
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (timedOut || aborted) return; // already rejected above
      // Wait for streams to finish draining before resolving/rejecting
      Promise.all([stdoutP, stderrP]).then(([stdout, stderr]) => {
        if (code !== 0) return reject(new Error(`ccusage ${args.join(" ")} exit ${code}: ${stderr.slice(0, 500)}`));
        resolve(stdout);
      }).catch(reject);
    });
  });
}

async function execAndParse<T>(bin: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const stdout = await execAndCollect(bin, args, timeoutMs, signal);
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(`ccusage ${args.join(" ")} JSON parse failed: ${(err as Error).message}; output preview: ${stdout.slice(0, 200)}`);
  }
}
