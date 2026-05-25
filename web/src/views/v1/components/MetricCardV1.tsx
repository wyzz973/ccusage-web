import { useEffect, useId, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatNumber, formatCost } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { formatDelta, type DeltaTone } from "../lib/format";
import { SEMANTIC } from "../lib/agent-colors";

// V1 MetricCard — locked iter1-R2 §2 layout.
//
// Three additions vs classic MetricCard:
//   1. Delta chip (right-side row 1).
//   2. Sparkline (row 2; spec §2.6).
//   3. Bucket sub-label on row 3.
export interface MetricCardV1Props {
  title: string;
  value: number;
  format: "cost" | "count";
  /** Delta as a fraction (e.g. +0.23 = ▲23 %). `null` → "no prior data". */
  deltaPct: number | null;
  /** Direction-of-good flips for activity-type cards (more is better). */
  inverted?: boolean;
  /** Absolute fallback value when |Δ| ≥ 1000 % (USD or count). */
  deltaAbsolute?: number;
  vsLabel: string;
  spark: number[];
  /** Stroke / gradient color for sparkline. */
  sparkColor?: string;
  subtitle?: string;
  /** Optional agent-color override for the value tint (used in by-agent view). */
  valueAccent?: string;
  /** Per-card testid override (e.g. "metric-card-today") for e2e selectors. */
  testId?: string;
}

const TONE: Record<DeltaTone, { bg: string; text: string; Icon: typeof ArrowUpRight }> = {
  good:    { bg: "bg-emerald-400/10", text: "text-emerald-300", Icon: ArrowDownRight },
  bad:     { bg: "bg-rose-400/10",    text: "text-rose-300",    Icon: ArrowUpRight },
  neutral: { bg: "bg-zinc-500/10",    text: "text-zinc-300",    Icon: Minus },
  info:    { bg: "bg-sky-400/10",     text: "text-sky-300",     Icon: Minus },
};

export function MetricCardV1({
  title, value, format, deltaPct, inverted, deltaAbsolute, vsLabel,
  spark, sparkColor, subtitle, valueAccent, testId,
}: MetricCardV1Props): JSX.Element {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v: number) => (format === "cost" ? formatCost(v) : formatNumber(v)));
  const [pulse, setPulse] = useState(false);
  const prev = useRef<number>(value);
  const gradId = useId();

  useEffect(() => {
    if (prev.current === value) return;
    const controls = animate(mv, value, { duration: 0.6, ease: "easeOut" });
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 560);
    prev.current = value;
    return () => { controls.stop(); clearTimeout(t); };
  }, [value, mv]);

  const d = formatDelta(deltaPct, {
    inverted,
    absoluteFallback: deltaAbsolute,
    absoluteFormat: format === "cost" ? "cost" : "number",
  });
  const T = TONE[d.tone];

  return (
    <Card
      data-testid={testId ?? "metric-card-v1"}
      role="figure"
      aria-label={`${title}: ${format === "cost" ? formatCost(value) : formatNumber(value)}, ${d.text} ${vsLabel}`}
      className={cn(
        "min-h-[148px] overflow-hidden transition-shadow",
        pulse && "ring-2 ring-sky-400/50 shadow-sky-400/20 shadow-lg",
      )}
    >
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <motion.div
            data-testid="metric-value"
            className="text-3xl font-semibold font-mono tabular-nums leading-none"
            style={valueAccent ? { color: valueAccent } : undefined}
          >
            {display}
          </motion.div>
          <span
            data-testid="delta-chip"
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
              T.bg, T.text,
            )}
          >
            <T.Icon className="h-3 w-3" aria-hidden="true" />
            <span><span className="sr-only">{d.sr}: </span>{d.text}</span>
          </span>
        </div>

        <Sparkline data={spark} color={sparkColor ?? SEMANTIC.info} gradientId={gradId} />

        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>{subtitle ?? ""}</span>
          <span>{vsLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}
