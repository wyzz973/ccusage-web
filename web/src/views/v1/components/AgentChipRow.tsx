import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_COLORS, AGENT_LABEL, toAgentKey, type AgentKey } from "../lib/agent-colors";
import { useV1Store } from "../data/v1-store";

// R3.5 — Agent chip-row promotion (spec-v3 §3.1).
//
// Always-visible row of chips for `derived.detectedAgents`. Each chip:
//   - inactive: opacity-60, hollow background.
//   - active:   full color + dismiss `×`, transparent → tinted background.
// flex-wrap on narrow viewports; no chevron-overflow.
// Empty detected set hides the whole row (the empty UX is "no row" rather
// than "row with placeholder chips" — see §3.1.3).
//
// The row reads `derived.detectedAgents` straight off the snapshot — it
// does NOT re-derive from session records. The server's `computeDetectedAgents`
// already filters out the "all" sentinel and "unknown" sink.
export interface AgentChipRowProps {
  detectedAgents: string[] | undefined;
}

export function AgentChipRow({ detectedAgents }: AgentChipRowProps): JSX.Element | null {
  const filters = useV1Store((s) => s.filters);
  const addFilter = useV1Store((s) => s.addFilter);
  const removeFilter = useV1Store((s) => s.removeFilter);

  // Note: an empty `detectedAgents` array is exactly the "hide me" signal;
  // see spec-v3 §3.1.4. `undefined` (e.g. pre-snapshot or server didn't
  // populate the field) is treated the same way.
  if (!detectedAgents || detectedAgents.length === 0) return null;

  const activeSet = new Set(
    filters.filter((f) => f.kind === "agent").map((f) => toAgentKey(f.value)),
  );

  return (
    <section
      aria-label="Agent filters"
      data-testid="agent-chip-row"
      className="flex flex-row flex-wrap items-center gap-1.5"
    >
      {detectedAgents.map((rawAgent) => {
        const a: AgentKey = toAgentKey(rawAgent);
        const active = activeSet.has(a);
        const tint = AGENT_COLORS[a];
        const label = AGENT_LABEL[a];
        return (
          <button
            key={rawAgent}
            type="button"
            onClick={() => {
              if (active) removeFilter({ kind: "agent", value: a });
              else addFilter({ kind: "agent", value: a });
            }}
            aria-pressed={active}
            aria-label={(active ? "Clear filter " : "Filter to ") + label}
            data-testid={`agent-chip-${a}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              "transition-opacity",
              active ? "opacity-100" : "opacity-60 hover:opacity-80",
            )}
            style={{
              borderColor: tint,
              color: tint,
              backgroundColor: active
                ? tint.replace("hsl(", "hsla(").replace(")", " / 0.15)")
                : "transparent",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: tint }}
              aria-hidden="true"
            />
            <span>{label}</span>
            {active && <X className="h-3 w-3 opacity-70" aria-hidden="true" />}
          </button>
        );
      })}
    </section>
  );
}
