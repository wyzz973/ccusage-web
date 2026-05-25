// V1-specific formatting helpers. Delta formatting follows locked
// iter1-R2 §2.5: |Δ%| < 2 % → "≈", 2 % ≤ |Δ%| < 1000 % → "▲ 23 %",
// |Δ%| ≥ 1000 % → "▲ $11.20" absolute fallback.

export type DeltaTone = "good" | "bad" | "neutral" | "info";

export interface FormattedDelta {
  tone: DeltaTone;
  text: string;
  /** sr-only verb so screen readers don't speak the arrow glyph. */
  sr: string;
}

/**
 * Format a delta percentage (as a fraction; e.g. 0.23 = +23 %).
 *
 * `inverted` flips the good/bad valence — used for activity cards where
 * "more sessions" is the desirable direction.
 *
 * `absoluteFallback` (USD) is used when |Δ| ≥ 1000 % to avoid noise on
 * very-low-base periods.
 */
export function formatDelta(
  pct: number | null,
  opts: { inverted?: boolean; absoluteFallback?: number; absoluteFormat?: "cost" | "number" } = {},
): FormattedDelta {
  if (pct == null || !Number.isFinite(pct)) {
    return { tone: "info", text: "no prior data", sr: "no prior data" };
  }
  const abs = Math.abs(pct);
  if (abs < 0.02) {
    return { tone: "neutral", text: "≈", sr: "approximately the same" };
  }
  if (abs >= 10) {
    const v = opts.absoluteFallback ?? 0;
    const sign = pct > 0 ? "▲" : "▼";
    const formatted = opts.absoluteFormat === "number"
      ? new Intl.NumberFormat("en-US").format(Math.round(Math.abs(v)))
      : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(v));
    return makeTone(pct, opts.inverted, `${sign} ${formatted}`);
  }
  const arrow = pct > 0 ? "▲" : "▼";
  return makeTone(pct, opts.inverted, `${arrow} ${(abs * 100).toFixed(0)}%`);
}

function makeTone(pct: number, inverted: boolean | undefined, text: string): FormattedDelta {
  const raw: "good" | "bad" = pct > 0 ? "bad" : "good"; // default valence: ↑ cost = bad
  const tone: DeltaTone = inverted ? (raw === "bad" ? "good" : "bad") : raw;
  return {
    tone,
    text,
    sr: pct > 0
      ? (inverted ? "increased; this is the good direction" : "increased; this is the bad direction")
      : (inverted ? "decreased; this is the bad direction" : "decreased; this is the good direction"),
  };
}

export function formatPct(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}
