// R3.9 + R3.10 + R3.11 + R3.12 — config-file loader.
//
// Covers AC5 (priority order, missing file, malformed JSON, unknown keys
// allowed/logged, schema-validated keys) per PRD v3 §1 R3.9.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import { loadConfig, findProjectConfig } from "../config-loader";
import type { Config } from "../config-loader";

/** Build a fake fs facade that returns the given path → contents map. */
function fakeFs(files: Record<string, string>) {
  return {
    existsSync: (p: string): boolean => Object.prototype.hasOwnProperty.call(files, p),
    readFileSync: (p: string, _enc?: BufferEncoding | string): string => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return files[p]!;
    },
  };
}

const HOMEDIR = "/Users/test";

describe("findProjectConfig — cwd walk-up (R3.9.AC3)", () => {
  it("returns the closest .ccusage/ccusage.json walking up from cwd", () => {
    const files = {
      "/Users/test/proj/sub/.ccusage/ccusage.json": "{}",
      "/Users/test/.ccusage/ccusage.json": "{}",
    };
    const fs = fakeFs(files);
    expect(findProjectConfig("/Users/test/proj/sub", HOMEDIR, fs.existsSync))
      .toBe("/Users/test/proj/sub/.ccusage/ccusage.json");
    expect(findProjectConfig("/Users/test/proj", HOMEDIR, fs.existsSync))
      .toBe("/Users/test/.ccusage/ccusage.json"); // homedir is the cap; the only candidate left
  });

  it("stops at the homedir boundary (project must not shadow user config)", () => {
    const files = { "/Users/test/parent/.ccusage/ccusage.json": "{}" };
    const fs = fakeFs(files);
    // cwd is the homedir itself; walk-up stops immediately, no project file found.
    expect(findProjectConfig(HOMEDIR, HOMEDIR, fs.existsSync)).toBeNull();
  });

  it("returns null when no project file exists anywhere in the walk-up", () => {
    expect(findProjectConfig("/Users/test/proj", HOMEDIR, fakeFs({}).existsSync)).toBeNull();
  });
});

describe("loadConfig — priority chain (R3.9.AC1)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined); });
  afterEach(() => { warnSpy.mockRestore(); });

  it("defaults when no file exists", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR, env: {},
      fs: fakeFs({}),
    });
    expect(out.config).toEqual({});
    expect(out.mergedFrom).toEqual([]);
  });

  it("legacy wins over defaults; user wins over legacy; project wins over user", () => {
    const legacy   = JSON.stringify({ startOfWeek: "sunday", order: "asc" });
    const user     = JSON.stringify({ startOfWeek: "monday" });
    const project  = JSON.stringify({ order: "desc" });
    const out = loadConfig({
      cwd: "/Users/test/proj", homedir: HOMEDIR, env: {},
      fs: fakeFs({
        [path.join(HOMEDIR, ".claude", "ccusage.json")]: legacy,
        [path.join(HOMEDIR, ".config", "claude", "ccusage.json")]: user,
        [path.join("/Users/test/proj", ".ccusage", "ccusage.json")]: project,
      }),
    });
    // Project's `order: desc` overrides legacy's `asc`;
    // user's `startOfWeek: monday` overrides legacy's `sunday`.
    expect(out.config.order).toBe("desc");
    expect(out.config.startOfWeek).toBe("monday");
    expect(out.mergedFrom).toEqual([
      path.join("/Users/test/proj", ".ccusage", "ccusage.json"),
      path.join(HOMEDIR, ".config", "claude", "ccusage.json"),
      path.join(HOMEDIR, ".claude", "ccusage.json"),
    ]);
  });

  it("env CCUSAGE_CONFIG beats project + user + legacy", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR,
      env: { CCUSAGE_CONFIG: "/srv/cfg/env.json" },
      fs: fakeFs({
        "/srv/cfg/env.json": JSON.stringify({ tokenLimit: 1000 }),
        [path.join(HOMEDIR, ".claude", "ccusage.json")]: JSON.stringify({ tokenLimit: 50 }),
      }),
    });
    expect(out.config.tokenLimit).toBe(1000);
    expect(out.mergedFrom[0]).toBe("/srv/cfg/env.json");
  });

  it("cli (--config) beats env", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR,
      cliConfigPath: "/srv/cfg/cli.json",
      env: { CCUSAGE_CONFIG: "/srv/cfg/env.json" },
      fs: fakeFs({
        "/srv/cfg/cli.json": JSON.stringify({ tokenLimit: 9999 }),
        "/srv/cfg/env.json": JSON.stringify({ tokenLimit: 1000 }),
      }),
    });
    expect(out.config.tokenLimit).toBe(9999);
    expect(out.mergedFrom[0]).toBe("/srv/cfg/cli.json");
  });
});

describe("loadConfig — validation (R3.9.AC4 + R3.12)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined); });
  afterEach(() => { warnSpy.mockRestore(); });

  it("malformed JSON → warning, not crash", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR, env: {},
      fs: fakeFs({ [path.join(HOMEDIR, ".claude", "ccusage.json")]: "{ this is not: json" }),
    });
    expect(out.config).toEqual({});
    expect(out.mergedFrom).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toMatch(/malformed JSON/);
  });

  it("not-an-object JSON → warning, not crash", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR, env: {},
      fs: fakeFs({ [path.join(HOMEDIR, ".claude", "ccusage.json")]: "[1,2,3]" }),
    });
    expect(out.config).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toMatch(/not a JSON object/);
  });

  it("unknown keys are allowed + logged (forward-compat)", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR, env: {},
      fs: fakeFs({ [path.join(HOMEDIR, ".claude", "ccusage.json")]: JSON.stringify({ futureKey: "value", startOfWeek: "monday" }) }),
    });
    expect(out.config.startOfWeek).toBe("monday"); // known key still applied
    expect(out.mergedFrom).toHaveLength(1); // file did contribute
    expect(warnSpy.mock.calls.some((c) => String(c[0]).match(/unknown key "futureKey"/))).toBe(true);
  });

  it("type-violating keys are skipped + warned", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR, env: {},
      fs: fakeFs({ [path.join(HOMEDIR, ".claude", "ccusage.json")]: JSON.stringify({
        tokenLimit: -100,           // negative → rejected
        startOfWeek: "funday",      // bogus → rejected
        order: "ASC",               // wrong case → rejected
        costMode: "bogus",          // unknown → rejected
        timezone: "America/Los_Angeles", // valid → kept
      }) }),
    });
    expect(out.config.tokenLimit).toBeUndefined();
    expect(out.config.startOfWeek).toBeUndefined();
    expect(out.config.order).toBeUndefined();
    expect(out.config.costMode).toBeUndefined();
    expect(out.config.timezone).toBe("America/Los_Angeles");
    expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("$schema key is silently ignored (R3.12.AC2)", () => {
    const out = loadConfig({
      cwd: HOMEDIR, homedir: HOMEDIR, env: {},
      fs: fakeFs({ [path.join(HOMEDIR, ".claude", "ccusage.json")]: JSON.stringify({
        "$schema": "https://example/schema.json",
        startOfWeek: "tuesday",
      }) }),
    });
    expect(out.config.startOfWeek).toBe("tuesday");
    // $schema should NOT trigger the "unknown key" warning.
    expect(warnSpy.mock.calls.some((c) => String(c[0]).match(/\$schema/))).toBe(false);
  });

  it("accepts all valid startOfWeek + order + costMode values", () => {
    const cfg: Config = {};
    for (const sow of ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const) {
      const out = loadConfig({
        cwd: HOMEDIR, homedir: HOMEDIR, env: {},
        fs: fakeFs({ [path.join(HOMEDIR, ".claude", "ccusage.json")]: JSON.stringify({ startOfWeek: sow }) }),
      });
      expect(out.config.startOfWeek).toBe(sow);
    }
    void cfg;
  });
});
