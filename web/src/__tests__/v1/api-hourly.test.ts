// Web-side coverage for the M-A2 hourly fetch helper.
//
// The route itself is exercised in server's routes.test.ts; here we just
// pin the request shape (URL + encoding) and the response unwrapping so
// the v1 dashboard's data-layer contract stays stable.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchHourly } from "@/lib/api";

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchHourly (M-A2 contract)", () => {
  it("builds the URL with URL-encoded date and tz query params", async () => {
    const captured = { url: "" };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      captured.url = typeof input === "string" ? input : input.toString();
      return new Response(
        JSON.stringify({
          date: "2026-05-25",
          tz: "Asia/Shanghai",
          buckets: Array.from({ length: 24 }, (_, h) => ({ hour: h, cost: 0 })),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const out = await fetchHourly("2026-05-25", "Asia/Shanghai");
    expect(captured.url).toBe("/api/usage/hourly?date=2026-05-25&tz=Asia%2FShanghai");
    expect(out.buckets).toHaveLength(24);
    expect(out.buckets[0]).toEqual({ hour: 0, cost: 0 });
  });

  it("throws on non-2xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 503 }),
    ) as typeof fetch;
    await expect(fetchHourly("2026-05-25", "UTC")).rejects.toThrow(/hourly HTTP 503/);
  });
});
