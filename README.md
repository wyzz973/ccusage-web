# ccusage-web

Self-hosted live dashboard for [`ccusage`](https://github.com/ryoppippi/ccusage) — visualizes token usage and cost across all detected coding-agent CLIs (Claude Code, Codex, Gemini, Copilot, OpenClaw, …) with rolling-number animations driven by Server-Sent Events.

## Quick start

```bash
git clone <this repo>
cd ccusage-web
# Edit docker-compose.yml: comment out mounts for agents you don't use.
docker compose up -d --build
open http://localhost:47821
```

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `47821` | HTTP port |
| `POLL_INTERVAL_MS` | `2000` | How often to re-run ccusage |
| `CCUSAGE_TIMEOUT_MS` | `30000` | Per-ccusage-command timeout |
| `CCUSAGE_AUTO_UPDATE_INTERVAL_MS` | `0` (off — R2/S8) | Auto-update interval in ms. `0` disables. Was `86_400_000` before R2; default flipped because the prior behavior silently mutated global node_modules without consent. |
| `CCUSAGE_BIN` | `ccusage` | Path to ccusage binary |
| `TZ` | `UTC` | IANA timezone for `today`/`this week`/`this month` bucketing. Honors the standard env. |
| `USAGE_SOURCE` | `ccusage` | Where the poller reads usage from. `ccusage` shells out to the binary (default); `native` walks `~/.claude/projects/**/*.jsonl` directly via the in-tree parser (M6 cutover; opt-in until soak validates parity — see [Usage source](#usage-source) below). |
| `VITE_DASHBOARD_MODE` | `classic` | Build-time default dashboard mode: `classic` or `v1` (see below). |

## Dashboard modes

ccusage-web ships two side-by-side dashboard implementations.

| Mode | When to use | How to enable |
|---|---|---|
| `classic` (default) | Stable two-row layout with a single trend chart. | Default; no action required. |
| `v1` | Refreshed information architecture: per-agent stack, driver-of-the-day strip, filter chips, virtualized session table, ISO-week/month-correct KPIs. | `?mode=v1` on the URL, or rebuild with `VITE_DASHBOARD_MODE=v1`. |

The URL query param **wins** over the env var, so you can preview v1 on a freshly-built deploy without rebuilding:

```
http://localhost:47821/?mode=v1
http://localhost:47821/?mode=classic
```

V1-mode UI state (view toggle, range picker, trend mode, compare flag) persists under the `ccusage.v1.*` localStorage namespace so toggling between modes never corrupts the other side. Cross-mode data preferences (cost mode / offline / native parser / timezone — all R2 D10/D11/D12 controls) live under the flat `ccusage.*` namespace because they're not UI state and should apply across modes.

V1 mode adds a `/history` route (`/history?mode=v1`) showing the chronological list of past 5-hour blocks grouped by date with a detail dialog. The calendar heatmap + month-over-month bars from spec-v2 §3.6.3 are R3-stretch and not rendered yet.

## Usage source

| Source | When to use | How to enable |
|---|---|---|
| `ccusage` (default) | The stable, ccusage-binary-backed path. No code changes from prior rounds. | Default; no action. |
| `native` | In-tree JSONL parser; no `ccusage` binary required, no per-poll process spawn. M6 cutover. | `USAGE_SOURCE=native` on the server. |

**Status (M6 Phase 1):** the native parser is committed and gated by the [golden-parity test](server/src/native/__tests__/native-parity.golden.test.ts) (tolerance: ±$0.00005 USD, exact integer tokens). Default stays on `ccusage` until a soak round validates per-bucket parity against the binary on real `~/.claude` data — that's the M6.d flip. Today's caveats with `USAGE_SOURCE=native`:

- Discovery currently covers Claude Code (`~/.claude/projects/**`) only; Codex / Gemini / Copilot / OpenClaw remain ccusage-only until the agent-coverage work lands.
- Block detection uses a simplified 5-hour-window scheme; ccusage's `burnRate`/`projection` may differ.
- `metadata.agents` is per-file-root inferred (typically `["claude"]`).

If you flip to `native`, compare `derived.deltas` numbers against a `ccusage`-mode snapshot before relying on them.

## How it works

A background poller runs `ccusage <cmd> --json` every 2 seconds (for `daily`, `weekly`, `monthly`, `session`, `blocks`), keeps the latest result in memory, and broadcasts changes over SSE to the React dashboard.

ccusage itself is upgraded automatically in the background every 24h (`npm install -g ccusage@latest`). If the upgrade fails (offline, npm down), the previous version stays in use.

## Development

```bash
npm install
# Terminal 1
npm run dev --workspace=server   # http://localhost:47821
# Terminal 2
npm run dev --workspace=web      # http://localhost:5173 (proxies /api → 47821)
```

Tests: `npm test`.

## Notes

- The dashboard is **read-only**. ccusage's local log directories are bind-mounted **read-only**.
- Types are duplicated in `server/src/types.ts` and `web/src/types.ts`; if you change one, change the other.
- See `docs/superpowers/specs/2026-05-24-ccusage-web-design.md` for full design.
