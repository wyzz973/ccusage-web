import { describe, it, expect } from "vitest";
import { extractProject, decodeProject } from "../project";

describe("extractProject", () => {
  it("returns 'unknown' for null/undefined/empty input", () => {
    expect(extractProject(null)).toBe("unknown");
    expect(extractProject(undefined)).toBe("unknown");
    expect(extractProject("")).toBe("unknown");
    expect(extractProject("   ")).toBe("unknown");
    expect(extractProject({ encoded: null })).toBe("unknown");
    expect(extractProject({ encoded: "" })).toBe("unknown");
  });

  it("decodes the trailing segment of an encoded Claude project name", () => {
    expect(extractProject("-Users-sd3-code-ccusage-web")).toBe("web");
    expect(extractProject({ encoded: "-tmp" })).toBe("tmp");
  });

  it("preserves trailing segment exactly (spaces, dots, capitals)", () => {
    expect(extractProject("-Users-sd3-My Project")).toBe("My Project");
    expect(extractProject("-home-alice-dotfiles.git")).toBe("dotfiles.git");
  });

  it("tolerates missing leading dash", () => {
    expect(extractProject("Users-sd3-foo")).toBe("foo");
  });

  it("collapses runs of dashes (no empty trailing segment)", () => {
    expect(extractProject("---foo---bar")).toBe("bar");
  });

  it("extracts from fullPath when given", () => {
    expect(
      extractProject({ fullPath: "/home/x/.claude/projects/-Users-sd3-code-ccusage-web/9f3a.jsonl" }),
    ).toBe("web");
  });

  it("falls back to path basename for non-Claude fullPath", () => {
    expect(extractProject({ fullPath: "/var/log/my-app" })).toBe("my-app");
    expect(extractProject({ fullPath: "/" })).toBe("unknown");
  });

  it("never throws on weird input", () => {
    expect(() => extractProject({ encoded: "-" })).not.toThrow();
    expect(extractProject({ encoded: "-" })).toBe("unknown");
    expect(extractProject({ encoded: "--" })).toBe("unknown");
  });
});

// R2 S3 fix — decodeProject returns both the canonical (stable for chips)
// and the display (short for labels). The R1 `extractProject` shortcoming
// was that `ccusage-web` → `web` collapsed two different projects into one
// chip value when their basenames happened to match.
describe("decodeProject (R2 S3 fix)", () => {
  it("returns canonical = full encoded body when given encoded form", () => {
    const out = decodeProject("-Users-sd3-code-ccusage-web");
    expect(out.canonical).toBe("-Users-sd3-code-ccusage-web");
    expect(out.displayName).toBe("web");
  });

  it("returns canonical = encoded body when fullPath has the Claude shape", () => {
    const out = decodeProject({
      fullPath: "/home/x/.claude/projects/-Users-sd3-code-ccusage-web/9f.jsonl",
    });
    expect(out.canonical).toBe("-Users-sd3-code-ccusage-web");
    expect(out.displayName).toBe("web");
  });

  it("falls back to fullPath as canonical for non-Claude paths", () => {
    const out = decodeProject({ fullPath: "/var/log/my-app" });
    expect(out.canonical).toBe("/var/log/my-app");
    expect(out.displayName).toBe("my-app");
  });

  it("returns unknown/unknown for null/empty", () => {
    expect(decodeProject(null)).toEqual({ canonical: "unknown", displayName: "unknown" });
    expect(decodeProject("")).toEqual({ canonical: "unknown", displayName: "unknown" });
    expect(decodeProject({ encoded: "" })).toEqual({ canonical: "unknown", displayName: "unknown" });
  });

  it("two projects with the same basename get distinct canonical forms (M-vs-R1 win)", () => {
    const a = decodeProject("-Users-alice-code-ccusage-web");
    const b = decodeProject("-Users-bob-foo-ccusage-web");
    expect(a.displayName).toBe(b.displayName);   // both "web"
    expect(a.canonical).not.toBe(b.canonical);   // but distinct chips
  });
});
