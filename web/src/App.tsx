import { Suspense, lazy } from "react";
import { resolveDashboardMode, type DashboardMode } from "@/lib/dashboard-mode";

// R2.1 — lazy-load both dashboards so each mode only pays for what it
// renders. Eliminates the cross-mode bundle penalty noted in spec-v2
// §1.3 (Radix Tabs was getting pulled by classic's TrendChart even when
// the user lands on `?mode=v1` and never touches classic, and vice versa).
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const DashboardV1 = lazy(() => import("@/views/v1/DashboardV1").then((m) => ({ default: m.DashboardV1 })));

export interface AppProps {
  /** Override the resolved mode (used by integration tests). */
  modeOverride?: DashboardMode;
}

export default function App({ modeOverride }: AppProps = {}): JSX.Element {
  const mode: DashboardMode = modeOverride ?? resolveDashboardMode();
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      {mode === "v1" ? <DashboardV1 /> : <Dashboard />}
    </Suspense>
  );
}

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="mx-auto max-w-7xl p-6 space-y-4" aria-hidden="true">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted/30" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[148px] animate-pulse rounded-xl border border-border bg-muted/20" />
        ))}
      </div>
    </div>
  );
}
