import type { Snapshot } from "@/types";

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/api/snapshot");
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  return res.json();
}

export async function triggerRefresh(): Promise<{ ok: boolean; generatedAt: string | null }> {
  const res = await fetch("/api/refresh", { method: "POST" });
  if (!res.ok) throw new Error(`refresh HTTP ${res.status}`);
  return res.json();
}

/**
 * M-A2 (R1.5): fetch hourly cost buckets for a given date / TZ.
 *
 * Response is always 24 zero-filled entries. The server is the source of
 * truth for the bucketing logic so v1 / classic / any future surface can
 * call this without re-deriving from session records client-side.
 */
export interface HourlyBucket { hour: number; cost: number }
export interface HourlyResponse { date: string; tz: string; buckets: HourlyBucket[] }

export async function fetchHourly(date: string, tz: string): Promise<HourlyResponse> {
  const url = `/api/usage/hourly?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(tz)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hourly HTTP ${res.status}`);
  return res.json();
}

/**
 * R3.6 — fan-out per-agent rollup. Returns the `PerAgentSummary<…>` envelope
 * verbatim from the server so the UI store can transition through the
 * §3.2 state machine ("ok" | "partial" | "timeout") with no shaping in
 * between.
 */
export interface PerAgentAgentData {
  totalCostUSD: number;
  totalTokens: number;
  sessionCount: number;
}
export interface PerAgentResponse {
  date: string;
  tz: string;
  status: "ok" | "partial" | "timeout";
  succeeded: Array<{ agent: string; data: PerAgentAgentData }>;
  failed:    Array<{ agent: string; err: Error }>;
  timedOut:  Array<{ agent: string }>;
  elapsedMs: number;
  budgetMs: number;
}

export async function fetchPerAgent(date: string, tz: string): Promise<PerAgentResponse> {
  const url = `/api/per-agent?date=${encodeURIComponent(date)}&tz=${encodeURIComponent(tz)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`per-agent HTTP ${res.status}`);
  return res.json();
}
