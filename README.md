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
| `TZ` | container default | Timezone for date grouping |

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
