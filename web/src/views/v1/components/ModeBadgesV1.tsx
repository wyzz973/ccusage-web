// spec-v2 §2.1 / spec-v3 §2.3 (M6.d) — mode-status palette.
//
// Lightest possible visual weight: plain text labels with a leading `·`
// separator, no chip / border / fill.
//
// native   → sky-300 (13.4:1 vs #0a0a0a, AAA)
// offline  → zinc-400 (7.83:1, AAA)
// fallback → amber-300 (warn tone — surfaces drift when the user asked
//            for native but the server is on the ccusage shellout)
//
// R3 M6.d: the native badge now reads from `derived.mode.parser` (server
// truth) instead of `mode.nativeParser` (client preference). This is the
// fix for the "badge says native but data came from ccusage" mismatch
// that R2 left open. The user-preference toggle still exists in
// SettingsPopover; it tells the server what to do — this badge tells the
// user what the server actually did.
import { useV1Store } from "../data/v1-store";
import type { Derived } from "@/types";

export interface ModeBadgesV1Props {
  parserMode?: Derived["mode"];
}

export function ModeBadgesV1({ parserMode }: ModeBadgesV1Props = {}): JSX.Element | null {
  const userPref = useV1Store((s) => s.mode);
  const showOffline = userPref.offline;
  // R3 M6.d truth source — `undefined` means pre-snapshot or legacy server;
  // fall through to the user pref so old behavior is preserved.
  const parser = parserMode?.parser;
  const showNative = parser === "native" || (parser == null && userPref.nativeParser);
  // Drift warning: user asked for native but server fell back. Cheap signal.
  const showFallback = parser === "fallback" && userPref.nativeParser;

  if (!showNative && !showOffline && !showFallback) return null;

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
      {showFallback && (
        <>
          <span className="text-xs text-muted-foreground/50" aria-hidden="true">·</span>
          <span
            data-testid="mode-badge-fallback"
            className="text-xs text-amber-300"
            aria-label="Server fell back to ccusage shellout despite native preference"
            title="You asked for native parser, but the server is currently on the ccusage shellout (drift or soak-detection)."
          >
            fallback
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
