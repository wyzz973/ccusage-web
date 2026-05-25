import { Dashboard } from "@/pages/Dashboard";
import { DashboardV1 } from "@/views/v1/DashboardV1";
import { resolveDashboardMode, type DashboardMode } from "@/lib/dashboard-mode";

export interface AppProps {
  /** Override the resolved mode (used by integration tests). */
  modeOverride?: DashboardMode;
}

export default function App({ modeOverride }: AppProps = {}): JSX.Element {
  const mode: DashboardMode = modeOverride ?? resolveDashboardMode();
  return mode === "v1" ? <DashboardV1 /> : <Dashboard />;
}
