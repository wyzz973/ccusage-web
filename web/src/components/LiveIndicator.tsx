import { useEffect, useState } from "react";
import { useUsageStore } from "@/store/usage-store";
import { cn } from "@/lib/utils";

function relativeAgo(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const diffMs = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const s = Math.round(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function LiveIndicator() {
  const status = useUsageStore((s) => s.connectionStatus);
  const lastSuccessAt = useUsageStore((s) => s.lastSuccessAt);
  const lastError = useUsageStore((s) => s.lastError);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const color =
    status !== "connected" ? "bg-red-500" :
    lastError ? "bg-amber-500" : "bg-emerald-500";
  const label =
    status !== "connected" ? "Reconnecting…" :
    lastError ? `Error · ${lastError.slice(0, 60)}` :
    `Live · ${relativeAgo(lastSuccessAt, new Date())}`;
  // tick read to force re-render
  void tick;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative inline-flex h-2.5 w-2.5">
        <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", color)} />
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
      </span>
      <span>{label}</span>
    </div>
  );
}
