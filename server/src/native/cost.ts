// Cost calculation, "Calculate" mode (always recompute, never trust costUSD).
// Per iter0 R1 §4.3 / cost.rs:21-83.

import type { PriceRow } from "./pricing-data.js";
import type { PricingFinder } from "./pricing.js";

export interface UsageTokens {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  speed?: string;
}

/** Per-line cost. Returns 0 if model unknown. Pass the *unsuffixed* model name. */
export function calculateCost(
  model: string | undefined,
  usage: UsageTokens,
  pricing: PricingFinder,
): number {
  if (!model) return 0;
  const p = pricing.find(model);
  if (!p) return 0;

  const multiplier = usage.speed === "fast" ? p.fast_multiplier : 1.0;

  const cost =
    tiered(usage.input_tokens || 0, p.input, p.input_above_200k) +
    tiered(usage.output_tokens || 0, p.output, p.output_above_200k) +
    tiered(usage.cache_creation_input_tokens || 0, p.cache_create, p.cache_create_above_200k) +
    tiered(usage.cache_read_input_tokens || 0, p.cache_read, p.cache_read_above_200k);

  return cost * multiplier;
}

/** Tiered pricing: above-200k rate kicks in for tokens over the threshold (per-line, per-field). */
export function tiered(tokens: number, base: number, above: number | null | undefined): number {
  if (tokens <= 0) return 0;
  if (above != null && tokens > 200_000) {
    return 200_000 * base + (tokens - 200_000) * above;
  }
  return tokens * base;
}

export type { PriceRow };
