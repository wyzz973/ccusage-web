import { describe, it, expect } from "vitest";
import { extractProject } from "../project";

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
