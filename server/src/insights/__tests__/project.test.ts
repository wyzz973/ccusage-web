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

  it("returns unknown for null/empty (canonical+displayName, source=absent)", () => {
    expect(decodeProject(null)).toEqual({ canonical: "unknown", displayName: "unknown", displayNameSource: "absent" });
    expect(decodeProject("")).toEqual({ canonical: "unknown", displayName: "unknown", displayNameSource: "absent" });
    expect(decodeProject({ encoded: "" })).toEqual({ canonical: "unknown", displayName: "unknown", displayNameSource: "absent" });
  });

  it("two projects with the same basename get distinct canonical forms (M-vs-R1 win)", () => {
    const a = decodeProject("-Users-alice-code-ccusage-web");
    const b = decodeProject("-Users-bob-foo-ccusage-web");
    expect(a.displayName).toBe(b.displayName);   // both "web" (heuristic)
    expect(a.canonical).not.toBe(b.canonical);   // but distinct chips
    expect(a.displayNameSource).toBe("encoded-heuristic");
  });
});

// R3 §C test matrix — exactly the 10 rows pinned in researcher v3 §C.4.
// Closes R1 S3 / R2 S-R2-7 by demonstrating cwd-sniff resolves the
// previously-lossy `ccusage-web` → `web` collapse to the correct `ccusage-web`.
describe("decodeProject (R3 §C — cwd-sniff)", () => {
  it("row 1: encoded + cwd → cwd-derived displayName ('ccusage-web', not 'web')", () => {
    const out = decodeProject({
      encoded: "-Users-sd3-code-ccusage-web",
      cwd: "/Users/sd3/code/ccusage-web",
    });
    expect(out.canonical).toBe("-Users-sd3-code-ccusage-web");
    expect(out.displayName).toBe("ccusage-web");
    expect(out.displayNameSource).toBe("cwd");
  });

  it("row 2: encoded with no cwd → heuristic fallback (lossy, source flagged)", () => {
    const out = decodeProject({ encoded: "-Users-sd3-code-ccusage-web" });
    expect(out.canonical).toBe("-Users-sd3-code-ccusage-web");
    expect(out.displayName).toBe("web");
    expect(out.displayNameSource).toBe("encoded-heuristic");
  });

  it("row 3: encoded + cwd with spaces preserves the space", () => {
    const out = decodeProject({
      encoded: "-Users-sd3-My Project",
      cwd: "/Users/sd3/My Project",
    });
    expect(out.canonical).toBe("-Users-sd3-My Project");
    expect(out.displayName).toBe("My Project");
    expect(out.displayNameSource).toBe("cwd");
  });

  it("row 4: weird cwd with multiple consecutive slashes uses basename", () => {
    const out = decodeProject({
      encoded: "-Users-sd3-Desktop------1",
      cwd: "/Users/sd3/Desktop///1",
    });
    expect(out.displayName).toBe("1");
    expect(out.displayNameSource).toBe("cwd");
  });

  it("row 5: fullPath + cwd → cwd wins for displayName, canonical from path", () => {
    const out = decodeProject({
      fullPath: "/Users/sd3/.claude/projects/-Users-sd3-code-ccusage-web/abc.jsonl",
      cwd: "/Users/sd3/code/ccusage-web",
    });
    expect(out.canonical).toBe("-Users-sd3-code-ccusage-web");
    expect(out.displayName).toBe("ccusage-web");
    expect(out.displayNameSource).toBe("cwd");
  });

  it("row 6: non-Claude fullPath + cwd → both work, source=cwd", () => {
    const out = decodeProject({ fullPath: "/tmp/foo.jsonl", cwd: "/tmp/foo" });
    expect(out.canonical).toBe("/tmp/foo.jsonl");
    expect(out.displayName).toBe("foo");
    expect(out.displayNameSource).toBe("cwd");
  });

  it("row 7: both encoded and cwd empty → unknown/unknown/absent", () => {
    expect(decodeProject({ encoded: "", cwd: "" })).toEqual({
      canonical: "unknown", displayName: "unknown", displayNameSource: "absent",
    });
  });

  it("row 8: null input → unknown/unknown/absent", () => {
    expect(decodeProject(null)).toEqual({
      canonical: "unknown", displayName: "unknown", displayNameSource: "absent",
    });
  });

  it("row 9: short encoded + matching cwd", () => {
    const out = decodeProject({ encoded: "-tmp", cwd: "/tmp" });
    expect(out.canonical).toBe("-tmp");
    expect(out.displayName).toBe("tmp");
    expect(out.displayNameSource).toBe("cwd");
  });

  it("row 10: non-ASCII Unicode in both encoded and cwd", () => {
    const out = decodeProject({
      encoded: "-Users-sd3-中文-项目",
      cwd: "/Users/sd3/中文/项目",
    });
    expect(out.canonical).toBe("-Users-sd3-中文-项目");
    expect(out.displayName).toBe("项目");
    expect(out.displayNameSource).toBe("cwd");
  });

  it("S-R2-7 closure: same encoded that R2 mis-displayed as 'web' is now 'ccusage-web' with cwd", () => {
    // R2 evidence: docs/review/round-2.md §10.2 screenshot showed
    //   -Users-sd3-Desktop-project-ccusage-web → "web"
    // R3 §C cwd-sniff fix:
    const out = decodeProject({
      encoded: "-Users-sd3-Desktop-project-ccusage-web",
      cwd: "/Users/sd3/Desktop/project/ccusage-web",
    });
    expect(out.displayName).toBe("ccusage-web"); // NOT "web"
  });
});

// Back-compat — extractProject (R1 entry point) must keep returning the
// short label without source. New code uses decodeProject directly.
describe("extractProject back-compat with R3 §C inputs", () => {
  it("returns the cwd-derived displayName when cwd is provided", () => {
    expect(extractProject({
      encoded: "-Users-sd3-code-ccusage-web",
      cwd: "/Users/sd3/code/ccusage-web",
    })).toBe("ccusage-web");
  });

  it("returns the heuristic displayName when no cwd", () => {
    expect(extractProject({ encoded: "-Users-sd3-code-ccusage-web" })).toBe("web");
  });
});
