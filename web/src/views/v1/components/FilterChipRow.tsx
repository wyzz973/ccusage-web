import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_COLORS, AGENT_LABEL, toAgentKey, type AgentKey } from "../lib/agent-colors";
import { useV1Store } from "../data/v1-store";
import type { FilterChip } from "../data/selectors";

// B1 · Filter chip row — hidden when empty (spec §1.1).

function chipDescriptor(c: FilterChip): { label: string; tint?: string } {
  if (c.kind === "agent") {
    const k = toAgentKey(c.value) as AgentKey;
    return { label: AGENT_LABEL[k], tint: AGENT_COLORS[k] };
  }
  if (c.kind === "project") {
    // S3 (R2): prefer the human-facing displayName; fall back to canonical.
    const label = c.displayName ? `project: ${c.displayName}` : `project: ${c.value}`;
    return { label };
  }
  if (c.kind === "model") return { label: `model: ${c.value}` };
  if (c.kind === "range") return { label: c.displayName ?? c.value, tint: "hsl(199 89% 60%)" };
  if (c.kind === "date") return { label: c.value };
  return { label: `session: ${c.value}` };
}

export function FilterChipRow(): JSX.Element | null {
  const filters = useV1Store((s) => s.filters);
  const removeFilter = useV1Store((s) => s.removeFilter);
  const clearFilters = useV1Store((s) => s.clearFilters);

  if (filters.length === 0) return null;

  return (
    <section
      aria-label="Active filters"
      data-testid="filter-chip-row"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2"
    >
      <span className="text-xs uppercase tracking-wider text-muted-foreground">Filtered by</span>
      <ul className="flex flex-wrap items-center gap-1.5" role="list">
        {filters.map((c) => {
          const { label, tint } = chipDescriptor(c);
          return (
            <li key={`${c.kind}:${c.value}`}>
              <button
                type="button"
                onClick={() => removeFilter(c)}
                className={cn(
                  "group inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  "border-border bg-zinc-900/60 text-zinc-100 hover:bg-zinc-800",
                )}
                style={tint ? { borderColor: tint, color: tint } : undefined}
                aria-label={`Remove filter ${label}`}
              >
                <span>{label}</span>
                <X className="h-3 w-3 opacity-70 group-hover:opacity-100" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={clearFilters}
        className="ml-auto rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-zinc-100 hover:underline"
      >
        Clear all
      </button>
    </section>
  );
}
