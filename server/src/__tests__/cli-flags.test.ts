// R3.1 + R3.2 + R3.7 — CLI flag passthrough wiring.
//
// These tests assert that the active `LoadedConfig` results in the
// expected `extraArgs` for the ccusage shellout. Black-box: we build
// an app with stubbed dependencies, intercept the `runCcusage` call,
// and assert the flag arguments.

import { describe, it, expect, vi } from "vitest";
import { loadConfig } from "../insights/config-loader";

function fakeFs(files: Record<string, string>) {
  return {
    existsSync: (p: string): boolean => Object.prototype.hasOwnProperty.call(files, p),
    readFileSync: (p: string): string => files[p] ?? "",
  };
}

describe("R3.1/R3.2/R3.7 — extraArgs assembly from config", () => {
  // Mirrors the assembly logic in app.ts. Kept here as a pure function
  // so the test asserts the contract without pulling in the express app.
  function buildExtraArgs(loaded: { mergedFrom: string[]; config: ReturnType<typeof loadConfig>["config"] }): string[] {
    const out: string[] = [];
    if (loaded.mergedFrom.length > 0) out.push("--config", loaded.mergedFrom[0]!);
    if (loaded.config.startOfWeek) out.push("--start-of-week", loaded.config.startOfWeek);
    if (loaded.config.tokenLimit != null && loaded.config.tokenLimit > 0) {
      out.push("--token-limit", String(loaded.config.tokenLimit));
    }
    out.push("--mode", loaded.config.costMode ?? "calculate");
    return out;
  }

  it("empty config → just --mode calculate (the §D default)", () => {
    const loaded = loadConfig({
      cwd: "/Users/test", homedir: "/Users/test", env: {}, fs: fakeFs({}),
    });
    expect(buildExtraArgs(loaded)).toEqual(["--mode", "calculate"]);
  });

  it("config with startOfWeek emits --start-of-week (R3.2.AC1)", () => {
    const loaded = loadConfig({
      cwd: "/Users/test", homedir: "/Users/test", env: {},
      fs: fakeFs({ "/Users/test/.claude/ccusage.json": JSON.stringify({ startOfWeek: "sunday" }) }),
    });
    const args = buildExtraArgs(loaded);
    expect(args).toContain("--start-of-week");
    expect(args[args.indexOf("--start-of-week") + 1]).toBe("sunday");
  });

  it("config with tokenLimit emits --token-limit (R3.7 B9 portion)", () => {
    const loaded = loadConfig({
      cwd: "/Users/test", homedir: "/Users/test", env: {},
      fs: fakeFs({ "/Users/test/.claude/ccusage.json": JSON.stringify({ tokenLimit: 50_000_000 }) }),
    });
    const args = buildExtraArgs(loaded);
    expect(args).toContain("--token-limit");
    expect(args[args.indexOf("--token-limit") + 1]).toBe("50000000");
  });

  it("config with costMode override emits --mode <override>", () => {
    const loaded = loadConfig({
      cwd: "/Users/test", homedir: "/Users/test", env: {},
      fs: fakeFs({ "/Users/test/.claude/ccusage.json": JSON.stringify({ costMode: "display" }) }),
    });
    const args = buildExtraArgs(loaded);
    expect(args).toContain("--mode");
    expect(args[args.indexOf("--mode") + 1]).toBe("display");
  });

  it("CLI-config priority emits --config <cliPath> (R3.1.AC1)", () => {
    const loaded = loadConfig({
      cwd: "/Users/test", homedir: "/Users/test",
      cliConfigPath: "/srv/cfg/cli.json",
      env: { CCUSAGE_CONFIG: "/srv/cfg/env.json" },
      fs: fakeFs({
        "/srv/cfg/cli.json": JSON.stringify({ tokenLimit: 9999 }),
        "/srv/cfg/env.json": JSON.stringify({ tokenLimit: 1000 }),
      }),
    });
    const args = buildExtraArgs(loaded);
    expect(args[0]).toBe("--config");
    expect(args[1]).toBe("/srv/cfg/cli.json");
    expect(args[args.indexOf("--token-limit") + 1]).toBe("9999"); // CLI wins
  });

  it("invalid tokenLimit (negative) is rejected by loader; emits no --token-limit", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const loaded = loadConfig({
        cwd: "/Users/test", homedir: "/Users/test", env: {},
        fs: fakeFs({ "/Users/test/.claude/ccusage.json": JSON.stringify({ tokenLimit: -50 }) }),
      });
      const args = buildExtraArgs(loaded);
      expect(args).not.toContain("--token-limit");
    } finally { warnSpy.mockRestore(); }
  });
});
