import { spawn } from "node:child_process";

export interface RunnerOptions {
  bin: string;
  timeoutMs: number;
  extraArgs?: string[];
}

export async function runCcusage<T = unknown>(command: string, opts: RunnerOptions): Promise<T> {
  const args = [command, "--json", ...(opts.extraArgs ?? [])];
  return execAndParse(opts.bin, args, opts.timeoutMs);
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

async function execAndCollect(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
      reject(new Error(`ccusage ${args.join(" ")} timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const stdoutP = collectStream(child.stdout);
    const stderrP = collectStream(child.stderr);

    child.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`ccusage ${args.join(" ")} timeout after ${timeoutMs}ms`));
      // Wait for streams to finish draining before resolving/rejecting
      Promise.all([stdoutP, stderrP]).then(([stdout, stderr]) => {
        if (code !== 0) return reject(new Error(`ccusage ${args.join(" ")} exit ${code}: ${stderr.slice(0, 500)}`));
        resolve(stdout);
      }).catch(reject);
    });
  });
}

async function execAndParse<T>(bin: string, args: string[], timeoutMs: number): Promise<T> {
  const stdout = await execAndCollect(bin, args, timeoutMs);
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(`ccusage ${args.join(" ")} JSON parse failed: ${(err as Error).message}; output preview: ${stdout.slice(0, 200)}`);
  }
}
