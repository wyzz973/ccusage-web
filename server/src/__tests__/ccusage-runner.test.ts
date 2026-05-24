import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { runCcusage, getCcusageVersion } from "../ccusage-runner";

function fakeChild(opts: { stdout?: string; stderr?: string; code?: number; signal?: NodeJS.Signals | null; emitClose?: boolean } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable; stderr: Readable; kill: (sig: NodeJS.Signals) => boolean;
  };
  child.stdout = Readable.from([opts.stdout ?? ""]);
  child.stderr = Readable.from([opts.stderr ?? ""]);
  child.kill = vi.fn(() => true);
  queueMicrotask(() => {
    if (opts.emitClose !== false) child.emit("close", opts.code ?? 0, opts.signal ?? null);
  });
  return child;
}

beforeEach(() => { spawnMock.mockReset(); });

describe("runCcusage", () => {
  it("spawns ccusage with command and --json", async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '{"daily":[]}', code: 0 }));
    const result = await runCcusage("daily", { bin: "ccusage", timeoutMs: 5000 });
    expect(spawnMock).toHaveBeenCalledWith("ccusage", ["daily", "--json"], expect.any(Object));
    expect(result).toEqual({ daily: [] });
  });

  it("rejects on non-zero exit code with stderr in message", async () => {
    spawnMock.mockReturnValue(fakeChild({ stderr: "boom", code: 2 }));
    await expect(runCcusage("daily", { bin: "ccusage", timeoutMs: 5000 })).rejects.toThrow(/exit 2.*boom/);
  });

  it("rejects on JSON parse failure", async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: "not json", code: 0 }));
    await expect(runCcusage("daily", { bin: "ccusage", timeoutMs: 5000 })).rejects.toThrow(/parse/i);
  });

  it("kills the subprocess on timeout", async () => {
    const child = fakeChild({ emitClose: false });
    spawnMock.mockReturnValue(child);
    const p = runCcusage("daily", { bin: "ccusage", timeoutMs: 5 });
    await expect(p).rejects.toThrow(/timeout/i);
    expect(child.kill).toHaveBeenCalled();
  });
});

describe("getCcusageVersion", () => {
  it("returns trimmed stdout", async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: "1.2.3\n", code: 0 }));
    const v = await getCcusageVersion({ bin: "ccusage", timeoutMs: 5000 });
    expect(v).toBe("1.2.3");
  });
});
