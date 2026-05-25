// Dashboard mode resolver. Round-1 hard constraint: a config switch lets
// the user toggle between current and new display modes.
//
// Precedence (highest → lowest):
//   1. URL query param  `?mode=v1` (or `?mode=classic`)
//   2. Vite env var     `VITE_DASHBOARD_MODE`
//   3. Default          `classic`
//
// URL wins so a user can preview v1 on a freshly-built deploy without
// rebuilding. The env var is for ops-level rollouts.

export type DashboardMode = "classic" | "v1";

const VALID = new Set<DashboardMode>(["classic", "v1"]);

function isValid(s: string | null | undefined): s is DashboardMode {
  return s != null && (VALID as Set<string>).has(s);
}

/** Parse the mode from a `?mode=…` query-string fragment (or null). */
export function parseModeFromSearch(search: string | null | undefined): DashboardMode | null {
  if (!search) return null;
  // Accept either "?mode=v1" or just "mode=v1".
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const m = params.get("mode");
  return isValid(m) ? m : null;
}

/**
 * Resolve the dashboard mode. `windowSearch` defaults to the live URL when
 * called in the browser; pass an explicit string in tests.
 */
export function resolveDashboardMode(opts: {
  windowSearch?: string | null;
  envMode?: string | null;
} = {}): DashboardMode {
  const fromUrl = parseModeFromSearch(
    opts.windowSearch === undefined
      ? (typeof window !== "undefined" ? window.location.search : null)
      : opts.windowSearch,
  );
  if (fromUrl) return fromUrl;

  const fromEnv = opts.envMode === undefined
    ? (typeof import.meta !== "undefined" ? (import.meta as { env?: Record<string, string> }).env?.VITE_DASHBOARD_MODE : undefined)
    : opts.envMode;
  if (isValid(fromEnv)) return fromEnv;

  return "classic";
}
