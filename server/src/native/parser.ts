// Line parser + validator + deduplicator.
//
// Per iter0 R1 §3, §7 and claude/mod.rs:218-432.
//
// Acceptance pipeline:
//   1. Cheap-reject lines that don't contain `"usage":{`.
//   2. Reject if any `:null` appears for a "no-null-allowed" field name.
//   3. JSON.parse strict against the schema.
//   4. timestamp must be RFC3339-parseable.
//   5. Strict validity:
//      - version (if present) must look like `\d+\.\d+\.\d+.*`
//      - sessionId/requestId/message.id/message.model present-but-empty → reject.
//   6. <synthetic> model gets dropped from display but tokens still counted.
//   7. usage.speed === 'fast' → display name suffixed `-fast`, raw kept for pricing.
//   8. Dedup by (message.id, requestId): higher total tokens wins; tie → fast wins.

import { calculateCost, type UsageTokens } from "./cost.js";
import type { PricingFinder } from "./pricing.js";

/** Fields that are NOT allowed to be JSON null on a line. */
const NULL_FORBIDDEN_FIELDS = [
  "id",
  "cwd",
  "model",
  "speed",
  // costUSD intentionally NOT here: `"costUSD":null` is allowed (iter0 R1 §7.3).
  "version",
  "sessionId",
  "requestId",
  "isApiErrorMessage",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
] as const;

const NULL_FORBIDDEN_PATTERNS = NULL_FORBIDDEN_FIELDS.map(
  (f) => new RegExp(`"${f}"\\s*:\\s*null`),
);

const SEMVER_PREFIX = /^\d+\.\d+\.\d+/;
const TS_RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

export interface RawUsageEntry {
  sessionId?: string;
  requestId?: string;
  version?: string;
  timestamp: string;
  costUSD?: number | null;
  isApiErrorMessage?: boolean;
  /**
   * R3 §C: absolute on-disk working directory for the Claude Code
   * session. Always present + non-null on real CC log lines (per
   * iter0-R1 §3 — `cwd` is in `NULL_FORBIDDEN_FIELDS`). Used as the
   * unambiguous source for `displayName` in `decodeProject` —
   * disambiguates `ccusage-web` from path-segment-boundary `ccusage/web`
   * that the encoded `-`-joined form can't tell apart.
   */
  cwd?: string;
  message: {
    id?: string;
    model?: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      speed?: "standard" | "fast";
    };
  };
  /**
   * R3.13 — upstream `usage_limit_reset_time` (snake_case mirrors
   * ccusage upstream's naming convention). Absent in current
   * production lines; appears once ccusage 20.x ships the field. Watch
   * CI workflow at `.github/workflows/upstream-limit-reset-watch.yml`
   * opens an auto-PR when the field surfaces — the wire-through here
   * makes the auto-PR a single regression-test change.
   */
  usage_limit_reset_time?: string | null;
}

/** Cooked entry, after validation, dedup, cost calc. */
export interface CookedEntry {
  timestamp: string;
  timestampMs: number;
  sessionId?: string;
  requestId?: string;
  messageId?: string;
  /** Raw (unsuffixed) model name. May be undefined for <synthetic> drops. */
  rawModel?: string;
  /** Display model name. `<synthetic>` is dropped (becomes undefined). `-fast` suffix added when speed==='fast'. */
  displayModel?: string;
  isApiErrorMessage: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  speed?: string;
  /**
   * The cost the consumer should use, post-mode-resolution by the
   * loader. Parser always sets the recomputed "calculate" value here;
   * the loader's `applyCostMode` (R3 S-R2-2 fix) may overwrite to the
   * `rawCostUSD` value when `mode` is `auto` or `display`. See
   * Researcher v3 §D.2 for the structural drift this closes.
   */
  costUSD: number;
  /**
   * R3 (S-R2-2 fix): raw `costUSD` from the JSONL line. `undefined` =
   * the field was absent; `null` = the line carried `"costUSD": null`
   * explicitly (allowed per `NULL_FORBIDDEN_FIELDS` — iter0-R1 §7.3).
   * The loader's mode resolver picks among this and the recomputed
   * value depending on `LoadOptions.mode`.
   */
  rawCostUSD?: number | null;
  /**
   * R3 §C: working directory from the JSONL line. Used by the runner to
   * compute a high-quality `displayName` for the project chip — closes
   * the R1 S3 / R2 S-R2-7 ambiguity where `ccusage-web` and `web`
   * couldn't be told apart from the encoded form alone.
   */
  cwd?: string;
  /**
   * R2.2 (M-R2-1): source file path, used by the runner to stamp
   * `UsageRecord.project` via `decodeProject(filePath)`. Only set when
   * the parser is fed a path (i.e. `loadJsonlFiles`); pure-content
   * callers (`loadJsonlContent`) can pass `filePath` explicitly via the
   * options if they want project attribution.
   */
  filePath?: string;
  /**
   * R3.13 — RFC3339 UTC reset timestamp from upstream's
   * `usage_limit_reset_time`. `undefined` = field absent on the line;
   * `null` = present-but-malformed (drops with `console.warn`).
   * Propagated by `buildBlocks` onto `Block.usageLimitResetTime`.
   */
  usageLimitResetTime?: string | null;
}

/** Returns true if line contains `:null` for any forbidden field name. */
export function hasUnsupportedNullField(line: string): boolean {
  for (const re of NULL_FORBIDDEN_PATTERNS) {
    if (re.test(line)) return true;
  }
  return false;
}

/** Cheap pre-filter: line must contain `"usage":{`. */
export function hasUsageBlock(line: string): boolean {
  return line.indexOf('"usage":{') !== -1 || line.indexOf('"usage": {') !== -1;
}

export interface ParseLineOptions {
  /** Optional source file path; stamped on the returned entry. */
  filePath?: string;
}

/** Parse + validate one JSONL line. Returns the cooked entry, or null to skip. */
export function parseLine(line: string, pricing: PricingFinder, opts: ParseLineOptions = {}): CookedEntry | null {
  if (!hasUsageBlock(line)) return null;
  if (hasUnsupportedNullField(line)) return null;

  let raw: RawUsageEntry;
  try {
    raw = JSON.parse(line) as RawUsageEntry;
  } catch {
    return null;
  }

  // Basic shape check.
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.timestamp !== "string" || !TS_RFC3339.test(raw.timestamp)) return null;
  const tsMs = Date.parse(raw.timestamp);
  if (!Number.isFinite(tsMs)) return null;

  if (raw.message == null || typeof raw.message !== "object") return null;
  const u = raw.message.usage;
  if (u == null || typeof u !== "object") return null;
  if (typeof u.input_tokens !== "number" || typeof u.output_tokens !== "number") return null;

  // Validity (claude/mod.rs:349-388).
  if (raw.version !== undefined) {
    if (typeof raw.version !== "string" || !SEMVER_PREFIX.test(raw.version)) return null;
  }
  if (raw.sessionId !== undefined && (typeof raw.sessionId !== "string" || raw.sessionId === "")) return null;
  if (raw.requestId !== undefined && (typeof raw.requestId !== "string" || raw.requestId === "")) return null;
  if (raw.message.id !== undefined && (typeof raw.message.id !== "string" || raw.message.id === "")) return null;
  if (raw.message.model !== undefined && (typeof raw.message.model !== "string" || raw.message.model === "")) return null;

  // <synthetic> handling: model is dropped from display but tokens still counted.
  const rawModel = raw.message.model;
  let displayModel: string | undefined = rawModel;
  if (displayModel === "<synthetic>") {
    displayModel = undefined;
  } else if (displayModel && u.speed === "fast") {
    displayModel = `${displayModel}-fast`;
  }

  // Pricing uses *unsuffixed* model. Also: synthetic gets cost=0.
  const usageForCost: UsageTokens = {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    speed: u.speed,
  };
  const costModel = rawModel === "<synthetic>" ? undefined : rawModel;
  const costUSD = calculateCost(costModel, usageForCost, pricing);

  const input = u.input_tokens || 0;
  const output = u.output_tokens || 0;
  const cc = u.cache_creation_input_tokens ?? 0;
  const cr = u.cache_read_input_tokens ?? 0;

  // R3.13 — upstream limit-reset wire-through. Defensive: accept the
  // field only if it parses to a finite RFC3339 timestamp; null/absent
  // both surface as `undefined` so the heuristic carries.
  let usageLimitResetTime: string | null | undefined;
  if (raw.usage_limit_reset_time === null) {
    usageLimitResetTime = null;
  } else if (typeof raw.usage_limit_reset_time === "string" && raw.usage_limit_reset_time !== "") {
    const ms = Date.parse(raw.usage_limit_reset_time);
    if (Number.isFinite(ms)) {
      // Normalize to ISO-UTC so consumers don't have to re-parse.
      usageLimitResetTime = new Date(ms).toISOString();
    } else {
      console.warn(`[ccusage-web/native] malformed usage_limit_reset_time ${JSON.stringify(raw.usage_limit_reset_time)}; treating as absent`);
      usageLimitResetTime = null;
    }
  }

  return {
    timestamp: raw.timestamp,
    timestampMs: tsMs,
    sessionId: raw.sessionId,
    requestId: raw.requestId,
    messageId: raw.message.id,
    rawModel: rawModel === "<synthetic>" ? undefined : rawModel,
    displayModel,
    isApiErrorMessage: raw.isApiErrorMessage === true,
    inputTokens: input,
    outputTokens: output,
    cacheCreationInputTokens: cc,
    cacheReadInputTokens: cr,
    totalTokens: input + output + cc + cr,
    speed: u.speed,
    costUSD,
    rawCostUSD: raw.costUSD,
    cwd: typeof raw.cwd === "string" && raw.cwd.trim() !== "" ? raw.cwd : undefined,
    filePath: opts.filePath,
    usageLimitResetTime,
  };
}

/**
 * Dedup by (messageId, requestId).
 *  - If either key is missing, the entry is not deduped.
 *  - Collision: higher total tokens wins; tie → entry with speed defined wins.
 */
export function dedupEntries(entries: CookedEntry[]): CookedEntry[] {
  const keyed = new Map<string, CookedEntry>();
  const unkeyed: CookedEntry[] = [];
  for (const e of entries) {
    if (!e.messageId || !e.requestId) {
      unkeyed.push(e);
      continue;
    }
    const k = `${e.messageId}${e.requestId}`;
    const prev = keyed.get(k);
    if (!prev) {
      keyed.set(k, e);
    } else if (winner(e, prev) === e) {
      keyed.set(k, e);
    }
  }
  return [...keyed.values(), ...unkeyed];
}

function winner(a: CookedEntry, b: CookedEntry): CookedEntry {
  if (a.totalTokens !== b.totalTokens) return a.totalTokens > b.totalTokens ? a : b;
  const aFast = a.speed !== undefined;
  const bFast = b.speed !== undefined;
  if (aFast !== bFast) return aFast ? a : b;
  return a; // arbitrary stable
}
