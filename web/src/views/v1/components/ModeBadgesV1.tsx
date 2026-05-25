// spec-v2 §2.1 — mode-status palette. Lightest possible visual weight:
// plain text labels with a leading `·` separator, no chip / border / fill.
//
// native  → sky-300 (13.4:1 vs #0a0a0a, AAA)
// offline → zinc-400 (7.83:1, AAA)
//
// Carries the §8.6 caveat about opt-IN → opt-OUT semantic flip at M6.d.
// Until then, badge shows when nativeParser === true.
import { useV1Store } from "../data/v1-store";

export function ModeBadgesV1(): JSX.Element | null {
  const mode = useV1Store((s) => s.mode);
  const showNative = mode.nativeParser;
  const showOffline = mode.offline;
  if (!showNative && !showOffline) return null;

  return (
    <span className="contents">
      {showNative && (
        <>
          <span className="text-xs text-muted-foreground/50" aria-hidden="true">·</span>
          <span
            data-testid="mode-badge-native"
            className="text-xs text-sky-300"
            aria-label="Native parser active"
          >
            native
          </span>
        </>
      )}
      {showOffline && (
        <>
          <span className="text-xs text-muted-foreground/50" aria-hidden="true">·</span>
          <span
            data-testid="mode-badge-offline"
            className="text-xs text-muted-foreground"
            aria-label="Offline mode active"
          >
            offline
          </span>
        </>
      )}
    </span>
  );
}
