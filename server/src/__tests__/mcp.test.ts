// R3.4.AC4 — MCP server integration test.
//
// Black-box: instantiate the dispatcher + a stub SnapshotStore, fire the
// 5 tool methods through, verify shape. Also exercises the JSON-RPC
// error paths (unknown method, malformed args, store-not-ready) so the
// MCP contract surface is end-to-end covered.

import { describe, it, expect } from "vitest";
import { dispatchMcp, runMcpServer, TOOL_DEFINITIONS } from "../mcp/index";
import { createSnapshotStore } from "../snapshot-store";
import { Readable, Writable } from "node:stream";
import type { Snapshot, UsageRecord } from "../types";

function fakeSnap(): Snapshot {
  const rec = (period: string, agent: string): UsageRecord => ({
    period, agent,
    totalTokens: 100, totalCost: 1,
    inputTokens: 60, outputTokens: 40, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: ["claude-opus-4"], modelBreakdowns: [],
    metadata: { lastActivity: "2026-05-26T10:00:00Z" },
  });
  return {
    generatedAt: "2026-05-26T10:00:00Z",
    ccusageVersion: "1.0.0",
    daily:   { records: [rec("2026-05-26", "claude")] },
    weekly:  { records: [rec("2026-05-25", "all")] },
    monthly: { records: [rec("2026-05", "all")] },
    session: { records: [rec("sess-1", "claude")] },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 100, cost: 1 },
      week:    { tokens: 100, cost: 1 },
      month:   { tokens: 100, cost: 1 },
      allTime: { tokens: 100, cost: 1 },
      activeBlock: null, activeSessionCount: 0,
    },
  };
}

describe("MCP dispatcher (R3.4)", () => {
  it("initialize returns server info + capabilities", () => {
    const store = createSnapshotStore();
    const out = dispatchMcp(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      store,
    );
    expect(out.error).toBeUndefined();
    const r = out.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(r.protocolVersion).toBeTruthy();
    expect(r.serverInfo.name).toBe("ccusage-web-mcp");
  });

  it("ping returns {} for heartbeat", () => {
    const store = createSnapshotStore();
    const out = dispatchMcp({ jsonrpc: "2.0", id: 99, method: "ping" }, store);
    expect(out.result).toEqual({});
    expect(out.id).toBe(99);
  });

  it("tools/list returns the 5 read-only tools", () => {
    const store = createSnapshotStore();
    const out = dispatchMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, store);
    const r = out.result as { tools: { name: string }[] };
    expect(r.tools).toHaveLength(5);
    expect(r.tools.map((t) => t.name).sort())
      .toEqual(["blocks", "daily", "monthly", "session", "weekly"]);
    // Descriptions are non-empty per R3.4.AC3 (no schema duplication, but
    // descriptive labels for each tool).
    for (const t of TOOL_DEFINITIONS) {
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it("tools/call returns snapshot slice as JSON-text content + raw _data", () => {
    const store = createSnapshotStore();
    store.set(fakeSnap());
    const out = dispatchMcp(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "daily" } },
      store,
    );
    expect(out.error).toBeUndefined();
    const r = out.result as { content: Array<{ type: string; text: string }>; _data: UsageRecord[] };
    expect(r.content[0]?.type).toBe("text");
    expect(JSON.parse(r.content[0]!.text)).toEqual(r._data);
    expect(r._data).toHaveLength(1);
    expect(r._data[0]?.period).toBe("2026-05-26");
  });

  it("tools/call works for each of the 5 slices", () => {
    const store = createSnapshotStore();
    store.set(fakeSnap());
    for (const name of ["daily", "weekly", "monthly", "session", "blocks"] as const) {
      const out = dispatchMcp(
        { jsonrpc: "2.0", id: name, method: "tools/call", params: { name } },
        store,
      );
      expect(out.error, `tool ${name} should not error`).toBeUndefined();
      const r = out.result as { _data: unknown[] };
      expect(Array.isArray(r._data), `tool ${name} should return an array`).toBe(true);
    }
  });

  it("tools/call returns -32603 when snapshot isn't ready", () => {
    const store = createSnapshotStore();
    const out = dispatchMcp(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "daily" } },
      store,
    );
    expect(out.error?.code).toBe(-32603);
    expect(out.error?.message).toMatch(/snapshot not ready/);
  });

  it("tools/call returns -32601 on unknown tool name", () => {
    const store = createSnapshotStore();
    store.set(fakeSnap());
    const out = dispatchMcp(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "bogus" } },
      store,
    );
    expect(out.error?.code).toBe(-32601);
    expect(out.error?.message).toMatch(/unknown tool: bogus/);
  });

  it("tools/call returns -32602 on missing name arg", () => {
    const store = createSnapshotStore();
    const out = dispatchMcp(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: {} },
      store,
    );
    expect(out.error?.code).toBe(-32602);
  });

  it("unknown method returns -32601", () => {
    const store = createSnapshotStore();
    const out = dispatchMcp({ jsonrpc: "2.0", id: 7, method: "no/such" }, store);
    expect(out.error?.code).toBe(-32601);
  });

  it("non-2.0 jsonrpc field returns -32600", () => {
    const store = createSnapshotStore();
    const out = dispatchMcp(
      { jsonrpc: "1.0" as never, id: 8, method: "ping" },
      store,
    );
    expect(out.error?.code).toBe(-32600);
  });
});

describe("MCP stdio runtime (R3.4)", () => {
  it("reads JSON-RPC requests from stdin, writes responses to stdout (line-delimited)", async () => {
    const store = createSnapshotStore();
    store.set(fakeSnap());

    // Build paired streams: a Readable that emits the canned requests,
    // a Writable that captures the responses.
    const stdin = new Readable({ read() { /* push manually */ } });
    let out = "";
    const stdout = new Writable({
      write(chunk, _enc, cb): void { out += chunk.toString("utf8"); cb(); },
    });
    const stderr = new Writable({ write(_c, _e, cb): void { cb(); } });

    const server = runMcpServer({ store, stdin, stdout, stderr });
    stdin.push(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) + "\n");
    stdin.push(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    stdin.push(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "session" } }) + "\n");
    // Allow the on-data handler microtasks to drain.
    await new Promise((r) => setTimeout(r, 10));
    server.close();

    const lines = out.split("\n").filter((s) => s.length > 0);
    expect(lines).toHaveLength(3);
    const resp1 = JSON.parse(lines[0]!) as { id: number; result: unknown };
    const resp2 = JSON.parse(lines[1]!) as { id: number; result: { tools: unknown[] } };
    const resp3 = JSON.parse(lines[2]!) as { id: number; result: { _data: UsageRecord[] } };
    expect(resp1.id).toBe(1);
    expect(resp2.result.tools).toHaveLength(5);
    expect(resp3.result._data[0]?.period).toBe("sess-1");
  });

  it("malformed JSON on a line returns a parse-error response (id: null)", async () => {
    const store = createSnapshotStore();
    const stdin = new Readable({ read() { /* */ } });
    let out = "";
    const stdout = new Writable({ write(c, _e, cb): void { out += c.toString("utf8"); cb(); } });
    const stderr = new Writable({ write(_c, _e, cb): void { cb(); } });

    const server = runMcpServer({ store, stdin, stdout, stderr });
    stdin.push("not-json\n");
    await new Promise((r) => setTimeout(r, 10));
    server.close();

    const resp = JSON.parse(out.trim()) as { id: null; error: { code: number } };
    expect(resp.id).toBeNull();
    expect(resp.error.code).toBe(-32700);
  });

  it("handles requests split across multiple stdin chunks", async () => {
    const store = createSnapshotStore();
    const stdin = new Readable({ read() { /* */ } });
    let out = "";
    const stdout = new Writable({ write(c, _e, cb): void { out += c.toString("utf8"); cb(); } });
    const stderr = new Writable({ write(_c, _e, cb): void { cb(); } });
    const server = runMcpServer({ store, stdin, stdout, stderr });
    const req = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) + "\n";
    // Split in 3 chunks.
    stdin.push(req.slice(0, 8));
    stdin.push(req.slice(8, 20));
    stdin.push(req.slice(20));
    await new Promise((r) => setTimeout(r, 10));
    server.close();

    const resp = JSON.parse(out.trim()) as { id: number; result: unknown };
    expect(resp.id).toBe(1);
    expect(resp.result).toEqual({});
  });
});
