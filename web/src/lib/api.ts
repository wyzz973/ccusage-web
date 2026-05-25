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
