import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn, formatNumber, formatCost } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  value: number;
  format: "number" | "cost";
  subtitle?: string;
}

export function MetricCard({ title, value, format, subtitle }: MetricCardProps) {
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (v) => (format === "cost" ? formatCost(v) : formatNumber(v)));
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    const controls = animate(motionValue, value, { duration: 0.6, ease: "easeOut" });
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 500);
    prev.current = value;
    return () => { controls.stop(); clearTimeout(t); };
  }, [value, motionValue]);

  return (
    <Card
      data-testid="metric-card"
      className={cn(
        "transition-shadow",
        pulse && "ring-2 ring-sky-400/50 shadow-sky-400/20 shadow-lg",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <motion.div data-testid="metric-value" className="text-3xl font-semibold font-mono tabular-nums">
          {display}
        </motion.div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}
