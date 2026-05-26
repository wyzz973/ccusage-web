import { Circle, Diamond, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_COLORS, AGENT_LABEL, toAgentKey } from "../lib/agent-colors";
import { useV1Store } from "../data/v1-store";
import type { DriverSegment } from "@/types";

// B2½ · Driver of the day — closes M7 + Q3 of the 3-second-insight path.
//
// Spec v1.1 §1.3: three distinct silhouettes so the dimension reads even
// with color stripped. Each segment is a button that dispatches the same
// addFilter event as a B1 chip-row click (spec v1.1 §1.6).

export interface DriverStripProps {
  agent?: DriverSegment;
  model?: DriverSegment;
  project?: DriverSegment;
  totalCostUSD: number;
}

export function DriverStrip(props: DriverStripProps): JSX.Element {
  const { agent, model, project, totalCostUSD } = props;
  const addFilter = useV1Store((s) => s.addFilter);

  if (totalCostUSD <= 0) {
    return (
      <section
        aria-label="Driver of the day"
        className="rounded-lg border border-border bg-card/40 px-3 py-2 text-xs"
        data-testid="driver-strip-empty"
      >
        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Driver of the day</span>
        <span className="text-muted-foreground">No activity yet today — open Claude Code to start the meter.</span>
      </section>
    );
  }

  const segments: { kind: "agent" | "model" | "project"; seg: DriverSegment; tint: string; Icon: typeof Circle; fillIcon: boolean }[] = [];
  if (agent) {
    const k = toAgentKey(agent.name);
    segments.push({ kind: "agent", seg: agent, tint: AGENT_COLORS[k], Icon: Circle, fillIcon: true });
  }
  if (model) {
    // Best-effort: tint the model diamond with the matching agent hue if we recognize the model name; otherwise muted.
    const guess = guessAgentForModel(model.name);
    segments.push({ kind: "model", seg: model, tint: AGENT_COLORS[guess], Icon: Diamond, fillIcon: false });
  }
  if (project) {
    segments.push({ kind: "project", seg: project, tint: "hsl(240 5% 65%)", Icon: Square, fillIcon: false });
  }

  return (
    <section
      aria-label="Driver of the day"
      className="rounded-lg border border-border bg-card/40 px-3 py-2"
      data-testid="driver-strip"
    >
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Driver of the day</span>
      <ul className="flex flex-row flex-wrap items-center gap-y-2 text-sm" role="list">
        {segments.map((s, i) => {
          // S-R3-1: project segment renders the cwd-sniffed displayName
          // when available (e.g. "ccusage-web"), falling back to the
          // canonical (encoded `-Users-…` form) only if absent.
          const label = s.kind === "agent"
            ? agentLabel(s.seg.name)
            : (s.seg.displayName ?? s.seg.name);
          return (
            <li key={s.kind} className="contents">
              {i > 0 && <span className="mx-3 text-muted-foreground/50" aria-hidden="true">·</span>}
              <button
                type="button"
                onClick={() => addFilter({ kind: s.kind, value: s.kind === "agent" ? toAgentKey(s.seg.name) : s.seg.name })}
                className="inline-flex items-center gap-2 rounded-md hover:bg-muted/40 -mx-1.5 px-1.5 py-0.5"
                aria-label={`Filter by ${s.kind}: ${label}`}
                data-testid={`driver-segment-${s.kind}`}
              >
                <s.Icon
                  className={cn("h-3 w-3 shrink-0", s.fillIcon && "fill-current")}
                  style={{ color: s.tint }}
                  aria-hidden="true"
                />
                <span className="font-medium text-foreground max-w-[14ch] truncate" title={label}>{label}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono tabular-nums text-foreground">{s.seg.pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * M-A3 (R1.5): defense-in-depth label. The server-side fix in
 * `computeTodayDrivers` should already surface real agent names ("claude",
 * "codex", …), but if anything slips through ("all", "unknown", or any
 * label not in our token map), we never want the bare word "Unknown" on
 * the page — that's the literal opposite of "tells the user the driver".
 */
function agentLabel(name: string): string {
  if (!name || name === "all") return "All agents";
  const k = toAgentKey(name);
  if (k !== "unknown") return AGENT_LABEL[k];
  // Unrecognized real-looking name → render the raw label (some users have
  // niche adapters; better to show the raw string than "Unknown").
  return name;
}

// Heuristic: map a model name to its agent so the diamond tints correctly.
function guessAgentForModel(name: string): "claude" | "codex" | "gemini" | "copilot" | "openclaw" | "unknown" {
  const n = name.toLowerCase();
  if (n.includes("claude") || n.includes("sonnet") || n.includes("opus") || n.includes("haiku")) return "claude";
  if (n.includes("gpt") || n.includes("codex")) return "codex";
  if (n.includes("gemini")) return "gemini";
  if (n.includes("copilot")) return "copilot";
  if (n.includes("openclaw") || n.includes("grok")) return "openclaw";
  return "unknown";
}
