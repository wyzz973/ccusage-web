import { Area, AreaChart, ResponsiveContainer } from "recharts";

// Locked iter1-R2 §2.6: no axes, no grid, no tooltip, min/max dots only.
export function Sparkline({ data, color, gradientId }: { data: number[]; color: string; gradientId: string }) {
  const points = data.map((v, i) => ({ i, v }));
  let minIdx = 0, maxIdx = 0;
  data.forEach((v, i) => {
    const minV = data[minIdx];
    const maxV = data[maxIdx];
    if (minV != null && v < minV) minIdx = i;
    if (maxV != null && v > maxV) maxIdx = i;
  });

  if (data.length === 0) {
    return <div className="h-10 -mx-1" aria-hidden="true" data-testid="sparkline-empty" />;
  }

  return (
    <div className="h-10 -mx-1" aria-hidden="true" data-testid="sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={(props: { cx?: number; cy?: number; index?: number }) => {
              const { cx, cy, index } = props;
              if (cx == null || cy == null || index == null) return <g />;
              if (index !== minIdx && index !== maxIdx) return <g />;
              if (data.length < 3) return <g />;
              return <circle cx={cx} cy={cy} r={2.5} fill={color} stroke="none" />;
            }}
            isAnimationActive={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
