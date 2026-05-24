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
