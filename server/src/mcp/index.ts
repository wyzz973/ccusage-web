// R3.4 — Model Context Protocol (MCP) server adapter.
//
// Wraps the existing `SnapshotStore` as 5 read-only tools: `daily`,
// `weekly`, `monthly`, `session`, `blocks`. Each tool returns the
// matching slice of the current snapshot (or 503-shaped error if the
// poller hasn't filled it yet).
//
// Transport: line-delimited JSON-RPC 2.0 over stdio. Each line on
// stdin is one request; each line on stdout is one response. This
// covers the MCP "stdio transport" surface with no external SDK
// dependency (keeps the diff tight; full @modelcontextprotocol/sdk
// integration can land in R4 if needed).
//
// Per PRD v3 §1 R3.4.AC3: tool descriptions inherit from the Snapshot
// type — no schema duplication. The JSON-schema fragments here mirror
// the existing types in `../types.ts`; if those types change, the
// JSON descriptions need to follow.

import type { SnapshotStore } from "../snapshot-store.js";
import type { Snapshot } from "../types.js";

/**
 * The 5 read-only MCP tools exposed by this adapter. Each name maps to
 * the corresponding `Snapshot` slice; descriptions are brief because
 * the type schema is in the source of truth.
 */
export const TOOL_DEFINITIONS = [
  {
    name: "daily",
    description: "Returns the daily usage records from the current snapshot. Each record carries period (YYYY-MM-DD), agent, tokens, cost, and per-model breakdowns. See SnapshotStore.daily.records type.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "weekly",
    description: "Returns the weekly usage records (period = Monday-anchored YYYY-MM-DD, matches ccusage --weekly).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "monthly",
    description: "Returns the monthly usage records (period = YYYY-MM).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "session",
    description: "Returns per-session usage records. Each record's `period` is the session ID; `metadata.lastActivity` is the last-activity ISO timestamp.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "blocks",
    description: "Returns the 5-hour billing-block records, including the active block (`isActive: true`), gap blocks (`isGap: true`), burn-rate projections, and the R3.13 upstream `usageLimitResetTime` field (when present).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]["name"];

const TOOL_NAMES = new Set<string>(TOOL_DEFINITIONS.map((t) => t.name));

/** JSON-RPC 2.0 request envelope. */
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

/** JSON-RPC 2.0 success/error envelope. */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const PARSE_ERROR  = -32700;
const INVALID_REQ  = -32600;
const METHOD_404   = -32601;
const INVALID_ARGS = -32602;
const INTERNAL_ERR = -32603;

/**
 * Pure dispatcher: takes a parsed JSON-RPC request + the snapshot
 * store, returns a JSON-RPC response. Side-effect-free — `runMcpServer`
 * is the only thing that touches stdin/stdout.
 *
 * Supported methods:
 *   - `initialize`     — handshake; returns server capabilities
 *   - `tools/list`     — returns TOOL_DEFINITIONS
 *   - `tools/call`     — invokes a tool by name; returns its slice
 *   - `ping`           — heartbeat; returns {}
 */
export function dispatchMcp(
  req: JsonRpcRequest,
  store: SnapshotStore,
): JsonRpcResponse {
  if (req.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: req.id ?? null, error: { code: INVALID_REQ, message: "jsonrpc must be 2.0" } };
  }
  const id = req.id ?? null;

  switch (req.method) {
    case "initialize":
      return { jsonrpc: "2.0", id, result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ccusage-web-mcp", version: "0.1.0" },
      } };

    case "ping":
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOL_DEFINITIONS } };

    case "tools/call": {
      const p = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      if (!p || typeof p.name !== "string") {
        return { jsonrpc: "2.0", id, error: { code: INVALID_ARGS, message: "tools/call requires { name: string }" } };
      }
      if (!TOOL_NAMES.has(p.name)) {
        return { jsonrpc: "2.0", id, error: { code: METHOD_404, message: `unknown tool: ${p.name}` } };
      }
      const snap = store.get();
      if (!snap) {
        return { jsonrpc: "2.0", id, error: { code: INTERNAL_ERR, message: "snapshot not ready (poller hasn't completed first run)" } };
      }
      const slice = pickSlice(snap, p.name as ToolName);
      return { jsonrpc: "2.0", id, result: {
        // MCP convention: tool results carry a `content` array. We
        // return a single `text` entry with the JSON-serialized slice,
        // plus a structured `_data` field for clients that prefer raw.
        content: [{ type: "text", text: JSON.stringify(slice) }],
        _data: slice,
      } };
    }

    default:
      return { jsonrpc: "2.0", id, error: { code: METHOD_404, message: `method not found: ${req.method}` } };
  }
}

function pickSlice(snap: Snapshot, name: ToolName): unknown {
  switch (name) {
    case "daily":   return snap.daily.records;
    case "weekly":  return snap.weekly.records;
    case "monthly": return snap.monthly.records;
    case "session": return snap.session.records;
    case "blocks":  return snap.blocks.records;
  }
}

/**
 * Streaming runtime. Reads JSON-RPC requests one per line from
 * `stdin`, dispatches them, writes responses one per line to `stdout`.
 *
 * Why line-delimited not Content-Length: the MCP spec allows either;
 * line-delimited is the simpler interop surface for hand-rolled
 * clients (one fewer header-parsing edge case). Most MCP clients
 * support both transports.
 *
 * Returns a `close()` function for graceful shutdown.
 */
export interface RunMcpDeps {
  store: SnapshotStore;
  stdin?:  NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}
export function runMcpServer(deps: RunMcpDeps): { close(): void } {
  const stdin  = deps.stdin  ?? process.stdin;
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;

  let buffer = "";
  const onData = (chunk: Buffer | string): void => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line) as JsonRpcRequest;
      } catch (e) {
        const errResp: JsonRpcResponse = {
          jsonrpc: "2.0", id: null,
          error: { code: PARSE_ERROR, message: `parse error: ${(e as Error).message}` },
        };
        stdout.write(JSON.stringify(errResp) + "\n");
        continue;
      }
      try {
        const resp = dispatchMcp(req, deps.store);
        stdout.write(JSON.stringify(resp) + "\n");
      } catch (e) {
        // Defensive: dispatchMcp shouldn't throw, but be safe.
        const errResp: JsonRpcResponse = {
          jsonrpc: "2.0", id: req.id ?? null,
          error: { code: INTERNAL_ERR, message: `internal error: ${(e as Error).message}` },
        };
        stdout.write(JSON.stringify(errResp) + "\n");
        stderr.write(`[ccusage-web/mcp] internal error: ${(e as Error).stack ?? e}\n`);
      }
    }
  };
  stdin.on("data", onData);
  return {
    close(): void {
      stdin.removeListener("data", onData);
    },
  };
}
