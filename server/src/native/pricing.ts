// Pricing map with fuzzy fallback.
//
// Per iter0 R1 §4.4 + pricing.rs:177-187:
//   1. Exact key lookup.
//   2. Substring match in either direction; longest match wins; lex tiebreak.
//   3. Otherwise warn once per process and return null.

import { PRICING_TABLE, type PriceRow } from "./pricing-data.js";

const warned = new Set<string>();

export interface PricingFinder {
  find(model: string): PriceRow | null;
}

export function createPricing(
  table: Record<string, PriceRow> = PRICING_TABLE,
  onWarn: (msg: string) => void = (m) => console.warn(m),
): PricingFinder {
  const keys = Object.keys(table);
  return {
    find(model: string): PriceRow | null {
      if (!model) return null;
      const exact = table[model];
      if (exact) return exact;

      // Fuzzy: any key contained in model OR containing model. Longest wins; lex tiebreak.
      let best: { key: string; row: PriceRow } | null = null;
      for (const k of keys) {
        if (model.includes(k) || k.includes(model)) {
          if (
            best == null ||
            k.length > best.key.length ||
            (k.length === best.key.length && k < best.key)
          ) {
            best = { key: k, row: table[k]! };
          }
        }
      }
      if (best) return best.row;

      if (!warned.has(model)) {
        warned.add(model);
        onWarn(`[ccusage-web/native] No pricing for model "${model}"; cost will be 0.`);
      }
      return null;
    },
  };
}

/** Test helper: reset the warned-once memo. */
export function _resetPricingWarnings(): void {
  warned.clear();
}
