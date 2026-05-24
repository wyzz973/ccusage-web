import { useEffect } from "react";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { ModelBreakdown } from "@/components/ModelBreakdown";
import { BlocksPanel } from "@/components/BlocksPanel";
import { SessionTable } from "@/components/SessionTable";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useUsageStore } from "@/store/usage-store";
import { fetchSnapshot, triggerRefresh } from "@/lib/api";
import { connectSse } from "@/lib/sse";
import { RefreshCw } from "lucide-react";

export function Dashboard() {
  const snap = useUsageStore((s) => s.snapshot);

  useEffect(() => {
    fetchSnapshot().then((s) => useUsageStore.getState().setSnapshot(s)).catch(() => {});
    return connectSse({
      onSnapshot: (s) => useUsageStore.getState().setSnapshot(s),
      onUpdate:   (s) => useUsageStore.getState().setSnapshot(s),
      onError:    (msg, lastSuccessAt) => useUsageStore.getState().setError(msg, lastSuccessAt),
      onStatus:   (st) => useUsageStore.getState().setStatus(st),
    });
  }, []);

  const d = snap?.derived;

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">ccusage</h1>
        <div className="flex items-center gap-3">
          <LiveIndicator />
          <button
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
            onClick={() => triggerRefresh().catch(() => {})}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Today"     value={d?.today.tokens   ?? 0} format="number" subtitle={d ? `${d.today.cost.toFixed(2)} USD`   : "—"} />
        <MetricCard title="This week" value={d?.week.tokens    ?? 0} format="number" subtitle={d ? `${d.week.cost.toFixed(2)} USD`    : "—"} />
        <MetricCard title="This month" value={d?.month.tokens  ?? 0} format="number" subtitle={d ? `${d.month.cost.toFixed(2)} USD`   : "—"} />
        <MetricCard title="All-time"  value={d?.allTime.tokens ?? 0} format="number" subtitle={d ? `${d.allTime.cost.toFixed(2)} USD` : "—"} />
      </section>

      <TrendChart />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModelBreakdown />
        <BlocksPanel />
      </section>

      <SessionTable />

      {snap && (
        <footer className="text-[10px] text-muted-foreground text-right">
          ccusage v{snap.ccusageVersion} · snapshot {snap.generatedAt}
        </footer>
      )}
    </div>
  );
}
