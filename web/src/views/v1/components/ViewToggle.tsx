import { cn } from "@/lib/utils";
import { useV1Store, type ViewMode } from "../data/v1-store";

// Spec v1.1 §2 — `[Aggregate] [By agent]` segmented tabs in B0.
// Persistence: `ccusage.v1.view` (per Designer-ack'd namespace).

export function ViewToggle(): JSX.Element {
  const view = useV1Store((s) => s.view);
  const setView = useV1Store((s) => s.setView);

  return (
    <div
      role="radiogroup"
      aria-label="KPI card scope"
      data-testid="view-toggle"
      className="inline-flex h-8 items-center rounded-md bg-muted/50 p-0.5 text-xs"
    >
      {(["aggregate", "by-agent"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={view === m}
          onClick={() => setView(m as ViewMode)}
          className={cn(
            "inline-flex h-7 items-center rounded px-3 font-medium transition-colors",
            view === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m === "aggregate" ? "Aggregate" : "By agent"}
        </button>
      ))}
    </div>
  );
}
