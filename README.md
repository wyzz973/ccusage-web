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
| `CCUSAGE_AUTO_UPDATE_INTERVAL_MS` | `86400000` | Auto-update interval (24h). `0` disables. |
| `CCUSAGE_BIN` | `ccusage` | Path to ccusage binary |
| `TZ` | `UTC` | IANA timezone for `today`/`this week`/`this month` bucketing. Honors the standard env. |
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

V1-mode UI state (view toggle, trend window, trend mode, compare flag) persists under the `ccusage.v1.*` localStorage namespace so toggling between modes never corrupts the other side.

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
