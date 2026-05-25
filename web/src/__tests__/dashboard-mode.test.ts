import { describe, it, expect } from "vitest";
import { parseModeFromSearch, resolveDashboardMode } from "@/lib/dashboard-mode";

describe("parseModeFromSearch", () => {
  it("returns null for empty/missing input", () => {
    expect(parseModeFromSearch(null)).toBeNull();
    expect(parseModeFromSearch("")).toBeNull();
    expect(parseModeFromSearch(undefined)).toBeNull();
  });

  it("returns 'v1' for ?mode=v1", () => {
    expect(parseModeFromSearch("?mode=v1")).toBe("v1");
    expect(parseModeFromSearch("mode=v1")).toBe("v1");
  });

  it("returns 'classic' for ?mode=classic", () => {
    expect(parseModeFromSearch("?mode=classic")).toBe("classic");
  });

  it("returns null for invalid mode strings", () => {
    expect(parseModeFromSearch("?mode=bogus")).toBeNull();
    expect(parseModeFromSearch("?other=v1")).toBeNull();
  });
});

describe("resolveDashboardMode precedence", () => {
  it("URL beats env beats default", () => {
    expect(resolveDashboardMode({ windowSearch: "?mode=v1", envMode: "classic" })).toBe("v1");
    expect(resolveDashboardMode({ windowSearch: "", envMode: "v1" })).toBe("v1");
    expect(resolveDashboardMode({ windowSearch: null, envMode: null })).toBe("classic");
  });

  it("treats unknown env as default", () => {
    expect(resolveDashboardMode({ windowSearch: null, envMode: "bogus" })).toBe("classic");
  });
});
