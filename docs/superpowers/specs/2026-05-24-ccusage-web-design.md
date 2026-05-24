# ccusage-web — Design Spec

**Date:** 2026-05-24
**Status:** Approved (pending user review of written spec)
**Author:** brainstorming session with user

## 1. Problem & Goal

`ccusage` is a CLI that reports token usage and cost across multiple coding-agent CLIs
(Claude Code, Codex, Gemini CLI, Copilot CLI, OpenClaw, etc.). Today the user runs
`npx ccusage@latest` in a terminal whenever they want to check usage — clunky and
unsuited for at-a-glance monitoring.

**Goal:** ship a self-hosted web dashboard, packaged as a single Docker container,
that exposes ccusage data in a live-updating, "cool-looking" UI. The user keeps a
browser tab open and watches token counts and cost roll upward in real time.

**Non-goals:**

- Multi-tenant / multi-user accounts. This is one user on one machine.
- Historical persistence beyond what ccusage already computes from local logs.
- Editing or sending data anywhere. Read-only visualization.
- Authentication. The container binds to localhost in practice.

## 2. Approach

Single Docker container holding:

1. A background **poller** that spawns `ccusage <cmd> --json` every 2 seconds (configurable).
2. An in-memory **snapshot store** holding the latest result for `daily / weekly / monthly / session / blocks`.
3. An **Express HTTP server** exposing a REST endpoint for first-paint and a
   **Server-Sent Events** channel for live updates.
4. A **React SPA** (Vite + Tailwind + shadcn/ui + Recharts) served as static
   assets by the same Express process. Rolling-number animations driven by
   `framer-motion` on every SSE update.

The container bind-mounts the user's home-directory agent log folders
(`~/.claude`, `~/.codex`, …) read-only at `/root/.claude` etc., so ccusage inside
the container reads exactly what the user has on the host.

```
┌──────────── Docker container ────────────┐
│                                          │
│   ┌─────────────────┐    ┌────────────┐  │
│   │ ccusage poller  │───▶│ in-memory  │  │
│   │ (every 2s)      │    │ snapshot   │  │
│   └─────────────────┘    └─────┬──────┘  │
│                                │         │
│                          ┌─────▼──────┐  │
│                          │ Express    │  │
│                          │ REST + SSE │  │
│                          └─────┬──────┘  │
│                                │         │
│                          ┌─────▼──────┐  │
│                          │ React SPA  │  │
│                          │ (static)   │  │
│                          └────────────┘  │
└──────────────────────────────────────────┘
        ▲
        │ bind-mount (read-only)
   host ~/.claude, ~/.codex, ~/.gemini …
```

### Why not …

- **Next.js full-stack** — adds bundler weight without solving anything; SSE still
  needed; bigger image.
- **Short polling from the client** — multiple open tabs each trigger redundant
  ccusage runs; less "live" feel.
- **WebSockets** — bidirectional, but data flow is one-way. SSE is simpler,
  has automatic browser reconnect, works through proxies.
- **Static HTML dumped by a cron** — no interactivity, no live feel.

## 3. Architecture

### 3.1 Project layout

npm workspaces monorepo.

```
ccusage-web/
  server/                # Node + Express + TypeScript
    src/
      ccusage-runner.ts
      ccusage-updater.ts
      snapshot-store.ts
      poller.ts
      sse-hub.ts
      routes.ts
      app.ts
      index.ts           # entry: starts updater + poller + http server
      __fixtures__/      # captured ccusage JSON outputs
    package.json
    tsconfig.json
  web/                   # React + Vite + TS + Tailwind + shadcn/ui
    src/
      lib/
        sse.ts
        api.ts
      store/
        usage-store.ts   # zustand
      components/
        MetricCard.tsx
        TrendChart.tsx
        ModelBreakdown.tsx
        SessionTable.tsx
        BlocksPanel.tsx
        LiveIndicator.tsx
      pages/
        Dashboard.tsx
      App.tsx
      main.tsx
    index.html
    package.json
    vite.config.ts
    tailwind.config.ts
  Dockerfile
  docker-compose.yml
  package.json           # workspaces: ["server", "web"]
  README.md
  docs/
    superpowers/specs/2026-05-24-ccusage-web-design.md   # this file
```

### 3.2 Backend modules

| Module | Responsibility | Depends on |
|---|---|---|
| `ccusage-runner.ts` | Wraps `child_process.spawn('ccusage', [cmd, '--json', ...args])`. Handles 30s timeout, stderr capture, JSON parse, returns typed result. Also exposes `getVersion()` which runs `ccusage --version`. | `child_process` |
| `ccusage-updater.ts` | Runs `npm install -g ccusage@latest` on a schedule (default every 24h, also once at startup). On success captures the new version into the snapshot store. On failure logs the error and keeps the current install — never blocks polling. | `child_process` |
| `snapshot-store.ts` | Holds the latest full `Snapshot` in memory. Exposes `get()`, `set(snapshot)`, `subscribe(listener)`. Performs cheap shallow-equality `diff()` to decide whether `set()` is actually a change. | none |
| `poller.ts` | On an interval (default 2000ms): runs all five ccusage commands in parallel through a `p-limit(2)` concurrency gate, assembles a `Snapshot`, computes `derived` totals, calls `store.set()`. Catches errors and records `lastError`. | runner, store |
| `sse-hub.ts` | Maintains a `Set<Response>` of active SSE clients. On new connect: writes `event: snapshot\ndata: …`. On store change: writes `event: update\ndata: …` to all. Heartbeat `:hb\n\n` every 15s. | store events |
| `routes.ts` | Defines `GET /api/snapshot`, `GET /api/events`, `POST /api/refresh`, `GET /api/health`. | store, sse-hub, poller |
| `app.ts` | Builds the Express app: JSON middleware, routes, static asset serving from `./public`. | routes |
| `index.ts` | Reads env, starts poller, starts ccusage-updater, starts http server on `PORT` (default **47821**). | app, poller, updater |

### 3.3 Frontend modules

| Module | Responsibility |
|---|---|
| `lib/sse.ts` | Thin wrapper around `EventSource`. Exposes `onSnapshot`, `onUpdate`, `onError`, plus a connection-status observable (`connected / reconnecting / error`). |
| `lib/api.ts` | `fetchSnapshot()` for first-paint fallback. `triggerRefresh()` for the manual button. |
| `store/usage-store.ts` | Zustand store. Holds `snapshot`, `lastUpdated`, `connectionStatus`, `lastError`. On `update` event, replaces snapshot wholesale. |
| `components/MetricCard.tsx` | Renders a big rolling number (framer-motion `useTransform` interpolating between previous and new value, 600ms ease-out) + label + subtitle. When the underlying value changes, briefly pulses a pale-blue ring around the card. |
| `components/TrendChart.tsx` | Recharts area or bar chart. Tabs for 30 / 60 / 90 day windows. `animationDuration={400}` so new points slide in. |
| `components/ModelBreakdown.tsx` | Donut chart (Recharts `PieChart`) + table of per-model cost & tokens, summed across all `modelBreakdowns` in the current view (today / week / month / all). |
| `components/SessionTable.tsx` | shadcn `<Table>` with sortable columns, free-text search, agent filter. Source: `snapshot.session.records`. |
| `components/BlocksPanel.tsx` | Top: current 5h window progress bar with projected end cost & burn rate. Below: list of recent blocks (filtering out `isGap`). |
| `components/LiveIndicator.tsx` | Top-right corner. Green pulsing dot + "Live · 2s ago". Orange when `lastError` set; red when SSE disconnected. |
| `pages/Dashboard.tsx` | Composition: row 1 = four MetricCards (today / week / month / all-time, each showing tokens + cost). Row 2 = TrendChart. Row 3 = ModelBreakdown (left) + BlocksPanel (right). Row 4 = SessionTable. |

### 3.4 Data flow

1. Container starts → `index.ts` starts ccusage-updater (kicks off a non-blocking `npm install -g ccusage@latest` in the background) → starts poller → poller runs once immediately against whatever ccusage version is currently installed and populates store → http server starts listening.
2. Browser loads `/` → SPA fetches `/api/snapshot` for first paint (so the page is never blank), then opens `EventSource('/api/events')`.
3. SSE connect fires `snapshot` event with the current store value (covers race where store updated between fetch and EventSource connect).
4. Every poll tick, if `diff(prev, next)` is truthy, store emits change → sse-hub broadcasts `update` with full snapshot → all clients' zustand stores replace state → React re-renders → framer-motion animates numbers from old to new values.
5. Every `CCUSAGE_AUTO_UPDATE_INTERVAL_MS` (default 24h), ccusage-updater re-runs the global install. On success, `ccusageVersion` in the store is refreshed and broadcast via the next `update` event. On failure, the previous install keeps working — error is logged but not surfaced to the UI to avoid noise (manual update path documented in README).
6. User clicks "Refresh" → `POST /api/refresh` → poller skips current sleep and runs immediately → normal update flow follows.

## 4. Data contracts

Types live in `server/src/types.ts` and are duplicated in `web/src/types.ts`
(no shared package for now; the shapes are small and stable enough that
duplication is cheaper than wiring a third workspace).

```ts
// Shared shape for daily / weekly / monthly / session
type UsageRecord = {
  period: string;              // "2026-05-10" or session UUID
  agent: string;               // "claude" | "codex" | "openclaw" | "all" | ...
  totalTokens: number;
  totalCost: number;           // USD
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
  modelBreakdowns: Array<{
    modelName: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  }>;
  metadata: { agents?: string[]; lastActivity?: string };
};

type Block = {
  id: string;
  startTime: string;            // ISO
  endTime: string;              // ISO (theoretical 5h window end)
  actualEndTime: string | null;
  isActive: boolean;
  isGap: boolean;
  costUSD: number;
  totalTokens: number;
  entries: number;
  models: string[];
  burnRate: number | null;      // tokens per minute
  projection: unknown | null;   // ccusage's projected end-of-window totals
  tokenCounts: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
};

type Snapshot = {
  generatedAt: string;          // ISO, when this poll finished
  ccusageVersion: string;       // refreshed after every successful auto-update
  daily:   { records: UsageRecord[] };
  weekly:  { records: UsageRecord[] };
  monthly: { records: UsageRecord[] };
  session: { records: UsageRecord[] };
  blocks:  { records: Block[] };
  derived: {
    today:   { tokens: number; cost: number };
    week:    { tokens: number; cost: number };
    month:   { tokens: number; cost: number };
    allTime: { tokens: number; cost: number };
    activeBlock: Block | null;
    activeSessionCount: number; // session.lastActivity within last 30 minutes
  };
};
```

**Field naming policy:** Pass ccusage fields through verbatim (including the
mixed `cacheCreationTokens` vs `cacheCreationInputTokens` naming). No renaming.
This minimizes upgrade pain if ccusage adds new fields.

**HTTP endpoints**

| Endpoint | Method | Purpose | Response |
|---|---|---|---|
| `/api/snapshot` | GET | First-paint fetch | `Snapshot` (JSON) |
| `/api/events` | GET | SSE stream | `text/event-stream` |
| `/api/refresh` | POST | Force immediate poll | `{ ok: true, generatedAt }` |
| `/api/health` | GET | Container health probe | `{ status, lastPollAt, lastError? }` |

**SSE event types** (the `event:` field)

- `snapshot` — sent once on connect, body is full `Snapshot`.
- `update` — sent on every store change, body is full `Snapshot`. (No diff
  protocol; payloads are well under 100KB and clients are LAN-local.)
- `error` — `{ message: string, lastSuccessAt: string }` when a poll fails.
- Heartbeat — every 15s, emitted as a bare SSE comment `:hb` (no `event:` field)
  to keep proxies and load balancers from idling the connection.

## 5. UI behavior detail

The user explicitly asked for a "real-time rolling, cool-looking" effect. The
design layers three signals to convey "this is live" without crossing into
gimmicky:

1. **Rolling numbers.** Every metric value goes through framer-motion's
   `motion.span` with `useMotionValue` + `useTransform`, interpolating between
   the previous and new value over ~600ms with an ease-out curve. Integers are
   formatted with thousands separators during interpolation.
2. **Card micro-feedback.** When a `MetricCard`'s value changes, its border
   briefly pulses a pale-blue ring (Tailwind `ring-2 ring-sky-400/40` toggled
   on for 400ms). Subtle, not distracting.
3. **Global live indicator.** Top-right shows a green pulsing dot + relative
   timestamp ("Live · 2s ago"). State machine:
   - `green pulsing` — SSE connected, recent successful poll
   - `orange steady` — SSE connected, last poll errored (tooltip shows error)
   - `red` — SSE disconnected, attempting to reconnect

Layout (desktop-first, no mobile target):

```
┌───────────────────────────────────────────────────────────────┐
│  ccusage                                  ● Live · 2s ago   ↻ │
├───────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│ │ Today    │ │ This wk  │ │ This mo  │ │ All-time │           │
│ │ 1.2M tok │ │ 8.4M tok │ │ 31M tok  │ │ 142M tok │           │
│ │ $4.31    │ │ $29.50   │ │ $112.20  │ │ $487.65  │           │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
├───────────────────────────────────────────────────────────────┤
│ Daily trend                                    [30d|60d|90d]  │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │             ▁▂▃▅▇█▆▄▂▃▅▇█...                              │  │
│ └──────────────────────────────────────────────────────────┘  │
├──────────────────────────────────┬────────────────────────────┤
│ Models                           │ Current billing block      │
│   ⬤ opus-4-7    62%              │ [████████░░░░] 67% used    │
│   ⬤ haiku-4-5   24%              │ Burn rate: 18k tok/min     │
│   ⬤ codex-gpt5  14%              │ Projected: $12.40          │
├──────────────────────────────────┴────────────────────────────┤
│ Sessions                                    [search] [agent▼] │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ id... | claude | 13.6M | $29.55 | 2026-05-10 | ...        │  │
│ └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Theme:** Light by default with a dark-mode toggle (shadcn `ThemeProvider`).
Tailwind palette: neutral grays, sky-blue accents for live cues, emerald for
positive deltas, amber for errors.

## 6. Error handling

| Condition | Behavior |
|---|---|
| `ccusage` not on PATH or spawn fails | Poller records `lastError`; sse-hub emits `error` event; UI LiveIndicator turns orange with tooltip; previous successful snapshot stays on screen. |
| ccusage returns non-JSON or invalid JSON | Same as above. `lastError` includes first 500 chars of stderr for debugging. |
| ccusage exceeds 30s timeout | Subprocess killed (`SIGKILL` after `SIGTERM`+1s grace). `lastError = "timeout"`. Next poll cycle retries. |
| Mounted log directories empty (user forgot mount) | ccusage returns empty arrays. UI shows a dedicated empty-state card: "No usage data found. Make sure you've mounted your agent log directories — see README." |
| SSE client disconnects | sse-hub removes from its set; client's `EventSource` reconnects automatically with browser-default backoff. |
| Server crashes | Docker `restart: unless-stopped` brings it back. State is rebuilt from logs on next poll. |
| Concurrent poll triggered (`/api/refresh` while a poll is in flight) | The refresh request is debounced — if a poll is currently running, it returns `{ ok: true, generatedAt: <pending> }` and lets the in-flight one finish. |
| Auto-update fails (offline, npm down, registry error) | Updater logs the error; existing ccusage install keeps working; poller is never blocked; next scheduled tick will try again. UI is not notified to avoid alarming the user about a non-fatal condition. |
| Auto-update succeeds mid-poll | Updater never interrupts an in-flight poll — it spawns a separate npm process. The next poll tick picks up the new binary automatically (PATH unchanged). |

## 7. Configuration

All via environment variables, read at startup:

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `47821` | HTTP listen port |
| `POLL_INTERVAL_MS` | `2000` | Sleep between polls |
| `CCUSAGE_TIMEOUT_MS` | `30000` | Per-command timeout |
| `CCUSAGE_BIN` | `ccusage` | Allows pinning a specific install path |
| `CCUSAGE_AUTO_UPDATE_INTERVAL_MS` | `86400000` (24h) | How often the updater runs `npm install -g ccusage@latest`. Set to `0` to disable auto-update entirely. |
| `TZ` | container default | Standard `TZ` for date grouping in ccusage |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

## 8. Docker packaging

**Dockerfile** (multi-stage):

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build --workspace=web
RUN npm run build --workspace=server

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/web/dist ./server/dist/public
COPY --from=build /app/node_modules ./node_modules
RUN npm install -g ccusage@latest
# Image ships with a known-good ccusage; runtime updater (see §3.2) refreshes it on a schedule.
ENV PORT=47821
EXPOSE 47821
CMD ["node", "server/dist/index.js"]
```

**docker-compose.yml**:

```yaml
services:
  ccusage-web:
    build: .
    container_name: ccusage-web
    restart: unless-stopped
    ports:
      - "47821:47821"
    environment:
      - POLL_INTERVAL_MS=2000
      - CCUSAGE_TIMEOUT_MS=30000
      - CCUSAGE_AUTO_UPDATE_INTERVAL_MS=86400000
      - TZ=Asia/Shanghai
    volumes:
      - ${HOME}/.claude:/root/.claude:ro
      - ${HOME}/.codex:/root/.codex:ro
      - ${HOME}/.gemini:/root/.gemini:ro
      - ${HOME}/.config/copilot:/root/.config/copilot:ro
      # Comment in / out per the agents you actually use.
```

**ccusage installed globally into the image** at build time, not run via `npx`.
This avoids per-invocation network calls and lets the container work offline.

## 9. Testing strategy

**Backend (vitest):**

- `ccusage-runner.test.ts` — mock `child_process.spawn`; verify arg array, timeout SIGKILL path, stderr capture, JSON parse failure path.
- `snapshot-store.test.ts` — `set` only notifies subscribers when shallow-different; subscriber cleanup.
- `poller.test.ts` — with a fake runner, verify all five commands run per tick, `derived` totals computed correctly, error in one command doesn't kill the whole tick.
- `sse-hub.test.ts` — multiple subscribers all receive `update`; disconnect cleanup; heartbeat scheduling.
- `ccusage-updater.test.ts` — schedules respect interval; failure does not block subsequent ticks; `0` disables; successful run updates the store's `ccusageVersion`.
- `routes.test.ts` — supertest for each endpoint, including SSE handshake.
- `__fixtures__/` holds real ccusage JSON captures (`daily.json`, `weekly.json`, `monthly.json`, `session.json`, `blocks.json`) — keeps tests independent of the developer's local agent history.

**Frontend (vitest + @testing-library/react):**

- `MetricCard.test.tsx` — given prev=100, next=200, asserts framer-motion's motion value transitions and the ring class is applied then removed.
- `usage-store.test.ts` — `update` event replaces snapshot atomically; connection status transitions.

**No e2e.** A single-page personal dashboard doesn't justify Playwright maintenance.

## 10. Open decisions deferred to implementation

- Exact font for rolling numbers (likely a tabular-figures monospace from Inter or JetBrains Mono so digit widths don't jitter during animation).
- Whether to persist user UI preferences (theme, trend window) in `localStorage` — small enough to add later, not in scope for first cut.
- Whether to add a "cost per agent" view as an additional tab — possible follow-up, not required for v1.

## 11. Out of scope (explicit no's)

- Authentication / multi-user.
- Storing or exporting data beyond what ccusage already produces.
- Mobile-responsive layout (desktop only).
- Notifications / alerts on cost thresholds.
- Comparing usage against billing-cycle limits.
