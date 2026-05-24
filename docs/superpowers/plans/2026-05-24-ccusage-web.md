# ccusage-web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Docker container that exposes a live, cool-looking React dashboard of `ccusage` token-usage data, with rolling-number animations driven by Server-Sent Events.

**Architecture:** Single container holding (a) a Node + Express server that runs `ccusage <cmd> --json` every 2s and broadcasts the result via SSE, and (b) a React + Vite + Tailwind + shadcn SPA served statically by the same Express. ccusage is auto-updated in the background every 24h.

**Tech Stack:** TypeScript, Node 20, Express 4, vitest, child_process, React 18, Vite 5, Tailwind 3, shadcn/ui, framer-motion, Recharts, Zustand. npm workspaces monorepo. Docker (alpine).

**Source spec:** `docs/superpowers/specs/2026-05-24-ccusage-web-design.md`

**Port:** `47821` (high port, avoids common defaults).

---

## File Inventory

**Project root:**
- `package.json` — npm workspaces config
- `package-lock.json` — auto-generated
- `.gitignore`
- `.dockerignore`
- `Dockerfile`
- `docker-compose.yml`
- `README.md`
- `tsconfig.base.json` — shared TS config

**`server/`:**
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `src/types.ts` — shared TypeScript types
- `src/ccusage-runner.ts` — spawn wrapper
- `src/ccusage-updater.ts` — periodic npm install
- `src/snapshot-store.ts` — in-memory store
- `src/poller.ts` — periodic ccusage runs
- `src/sse-hub.ts` — SSE client management
- `src/routes.ts` — Express routes
- `src/app.ts` — Express app builder
- `src/index.ts` — entry
- `src/__fixtures__/daily.json`
- `src/__fixtures__/weekly.json`
- `src/__fixtures__/monthly.json`
- `src/__fixtures__/session.json`
- `src/__fixtures__/blocks.json`
- `src/__tests__/ccusage-runner.test.ts`
- `src/__tests__/snapshot-store.test.ts`
- `src/__tests__/poller.test.ts`
- `src/__tests__/sse-hub.test.ts`
- `src/__tests__/ccusage-updater.test.ts`
- `src/__tests__/routes.test.ts`

**`web/`:**
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`
- `tailwind.config.ts`
- `postcss.config.js`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/types.ts` — copy of server types
- `src/lib/utils.ts` — shadcn `cn()`
- `src/lib/api.ts`
- `src/lib/sse.ts`
- `src/store/usage-store.ts`
- `src/components/ui/card.tsx` — shadcn primitive
- `src/components/ui/table.tsx` — shadcn primitive
- `src/components/ui/tabs.tsx` — shadcn primitive
- `src/components/ui/input.tsx` — shadcn primitive
- `src/components/MetricCard.tsx`
- `src/components/TrendChart.tsx`
- `src/components/ModelBreakdown.tsx`
- `src/components/SessionTable.tsx`
- `src/components/BlocksPanel.tsx`
- `src/components/LiveIndicator.tsx`
- `src/pages/Dashboard.tsx`
- `src/__tests__/MetricCard.test.tsx`
- `src/__tests__/usage-store.test.ts`
- `src/__tests__/setup.ts`

---

## Conventions

- **Commit style:** Conventional commits (`feat:`, `test:`, `chore:`, `docs:`, `build:`).
- **Test runner:** `vitest` everywhere.
- **TypeScript:** strict mode on, `moduleResolution: "Bundler"` for web, `"NodeNext"` for server.
- **Run tests from project root:** `npm test --workspace=server -- <args>` or `npm test --workspace=web -- <args>`.
- **Commits per task:** one commit per task at minimum; multiple commits inside a task are fine when steps explicitly request them.

---

## Task 1: Initialize git + root workspace

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/package.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/.gitignore`
- Create: `/Users/sd3/Desktop/project/ccusage-web/.dockerignore`
- Create: `/Users/sd3/Desktop/project/ccusage-web/tsconfig.base.json`

- [ ] **Step 1: Init git repo**

```bash
cd /Users/sd3/Desktop/project/ccusage-web
git init
git branch -M main
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
.DS_Store
*.log
.env
.env.*
coverage/
.vite/
```

- [ ] **Step 3: Write `.dockerignore`**

```
node_modules
dist
.git
.DS_Store
*.log
.env
.env.*
coverage
.vite
docs
```

- [ ] **Step 4: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

- [ ] **Step 5: Write root `package.json`**

```json
{
  "name": "ccusage-web",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["server", "web"],
  "scripts": {
    "build": "npm run build --workspace=web && npm run build --workspace=server",
    "test": "npm test --workspaces --if-present",
    "dev": "echo 'Use npm run dev --workspace=server and npm run dev --workspace=web in two terminals'"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .dockerignore tsconfig.base.json package.json docs/
git commit -m "chore: bootstrap monorepo with npm workspaces"
```

---

## Task 2: Bootstrap server workspace

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/package.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/tsconfig.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/vitest.config.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/index.ts` (stub)

- [ ] **Step 1: Write `server/package.json`**

```json
{
  "name": "@ccusage-web/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "p-limit": "^5.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.7",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.7.2",
    "typescript": "^5.4.5",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Write `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**", "src/**/*.test.ts"]
}
```

- [ ] **Step 3: Write `server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write `server/src/index.ts` stub**

```ts
console.log("ccusage-web server starting (stub)");
```

- [ ] **Step 5: Install dependencies**

Run: `cd /Users/sd3/Desktop/project/ccusage-web && npm install`
Expected: install succeeds, `node_modules/` and `package-lock.json` created.

- [ ] **Step 6: Verify build works**

Run: `npm run build --workspace=server`
Expected: `server/dist/index.js` exists.

- [ ] **Step 7: Commit**

```bash
git add server/ package-lock.json
git commit -m "build: scaffold server workspace with vitest and tsc"
```

---

## Task 3: Bootstrap web workspace (Vite + React + TS)

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/package.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/tsconfig.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/tsconfig.node.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/vite.config.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/index.html`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/main.tsx` (stub)
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/App.tsx` (stub)

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "@ccusage-web/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b && vite build",
    "dev": "vite",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.2",
    "framer-motion": "^11.1.7",
    "recharts": "^2.12.6",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.3.0",
    "class-variance-authority": "^0.7.0",
    "lucide-react": "^0.378.0",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-slot": "^1.0.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.2.10",
    "typescript": "^5.4.5",
    "tailwindcss": "^3.4.3",
    "postcss": "^8.4.38",
    "autoprefixer": "^10.4.19",
    "vitest": "^1.5.0",
    "jsdom": "^24.0.0",
    "@testing-library/react": "^15.0.5",
    "@testing-library/jest-dom": "^6.4.5",
    "@types/jsdom": "^21.1.6"
  }
}
```

- [ ] **Step 2: Write `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "useDefineForClassFields": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "types": ["vite/client", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Write `web/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Write `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:47821", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
```

- [ ] **Step 5: Write `web/index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ccusage</title>
  </head>
  <body class="bg-background text-foreground">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write stub `web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Write stub `web/src/App.tsx`**

```tsx
export default function App() {
  return <div>ccusage-web (stub)</div>;
}
```

- [ ] **Step 8: Install + verify build**

Run: `npm install`
Run: `npm run build --workspace=web`
Expected: `web/dist/index.html` exists.

- [ ] **Step 9: Commit**

```bash
git add web/ package-lock.json
git commit -m "build: scaffold web workspace with vite + react"
```

---

## Task 4: Configure Tailwind + shadcn primitives

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/tailwind.config.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/postcss.config.js`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/index.css`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/lib/utils.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/ui/card.tsx`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/ui/table.tsx`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/ui/tabs.tsx`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/ui/input.tsx`
- Modify: `/Users/sd3/Desktop/project/ccusage-web/web/src/main.tsx` (import index.css)

- [ ] **Step 1: Write `web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontFeatureSettings: { tabular: '"tnum"' },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Write `web/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 3: Write `web/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --border: 214 32% 91%;
  --accent: 210 40% 96%;
  --accent-foreground: 222 47% 11%;
}

.dark {
  --background: 222 47% 7%;
  --foreground: 210 40% 98%;
  --card: 222 47% 9%;
  --card-foreground: 210 40% 98%;
  --muted: 217 33% 17%;
  --muted-foreground: 215 20% 65%;
  --border: 217 33% 17%;
  --accent: 217 33% 17%;
  --accent-foreground: 210 40% 98%;
}

body { font-feature-settings: "tnum"; }
```

- [ ] **Step 4: Write `web/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatCost(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
```

- [ ] **Step 5: Write `web/src/components/ui/card.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...props} />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-sm font-medium text-muted-foreground", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";
```

- [ ] **Step 6: Write `web/src/components/ui/table.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

export const THead = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
  ),
);
THead.displayName = "THead";

export const TBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TBody.displayName = "TBody";

export const TR = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("border-b transition-colors hover:bg-muted/40", className)} {...props} />
  ),
);
TR.displayName = "TR";

export const TH = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn("h-10 px-3 text-left align-middle text-xs font-medium text-muted-foreground", className)} {...props} />
  ),
);
TH.displayName = "TH";

export const TD = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("p-3 align-middle", className)} {...props} />
  ),
);
TD.displayName = "TD";
```

- [ ] **Step 7: Write `web/src/components/ui/tabs.tsx`**

```tsx
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = TabsPrimitive.Content;
```

- [ ] **Step 8: Write `web/src/components/ui/input.tsx`**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
```

- [ ] **Step 9: Update `web/src/main.tsx` to import CSS**

Replace existing file with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 10: Verify build still works**

Run: `npm run build --workspace=web`
Expected: build succeeds; `web/dist/assets/*.css` exists.

- [ ] **Step 11: Commit**

```bash
git add web/
git commit -m "feat(web): tailwind + shadcn ui primitives"
```

---

## Task 5: Define shared types

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/types.ts`

- [ ] **Step 1: Write `server/src/types.ts`**

```ts
export type UsageRecord = {
  period: string;
  agent: string;
  totalTokens: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  metadata: { agents?: string[]; lastActivity?: string };
};

export type ModelBreakdown = {
  modelName: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
};

export type Block = {
  id: string;
  startTime: string;
  endTime: string;
  actualEndTime: string | null;
  isActive: boolean;
  isGap: boolean;
  costUSD: number;
  totalTokens: number;
  entries: number;
  models: string[];
  burnRate: number | null;
  projection: unknown | null;
  tokenCounts: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
};

export type Derived = {
  today:   { tokens: number; cost: number };
  week:    { tokens: number; cost: number };
  month:   { tokens: number; cost: number };
  allTime: { tokens: number; cost: number };
  activeBlock: Block | null;
  activeSessionCount: number;
};

export type Snapshot = {
  generatedAt: string;
  ccusageVersion: string;
  daily:   { records: UsageRecord[] };
  weekly:  { records: UsageRecord[] };
  monthly: { records: UsageRecord[] };
  session: { records: UsageRecord[] };
  blocks:  { records: Block[] };
  derived: Derived;
};

export type HealthInfo = {
  status: "ok" | "degraded";
  lastPollAt: string | null;
  lastError: string | null;
};
```

- [ ] **Step 2: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(server): shared snapshot/usage type definitions"
```

---

## Task 6: Capture ccusage fixtures

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__fixtures__/daily.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__fixtures__/weekly.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__fixtures__/monthly.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__fixtures__/session.json`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__fixtures__/blocks.json`

- [ ] **Step 1: Generate fixtures from local ccusage output**

Run each command and pipe output to the matching file. If a command fails or returns empty for the developer's machine, use the minimal stand-in below (the test suite must not depend on the developer's actual agent history).

```bash
cd /Users/sd3/Desktop/project/ccusage-web
npx ccusage@latest daily   --json > server/src/__fixtures__/daily.json   2>/dev/null || true
npx ccusage@latest weekly  --json > server/src/__fixtures__/weekly.json  2>/dev/null || true
npx ccusage@latest monthly --json > server/src/__fixtures__/monthly.json 2>/dev/null || true
npx ccusage@latest session --json > server/src/__fixtures__/session.json 2>/dev/null || true
npx ccusage@latest blocks  --json > server/src/__fixtures__/blocks.json  2>/dev/null || true
```

- [ ] **Step 2: For any empty file, replace with minimal stand-in**

If `daily.json` is empty or missing, write:

```json
{
  "daily": [
    {
      "agent": "all",
      "period": "2026-05-23",
      "totalTokens": 1000,
      "totalCost": 0.05,
      "inputTokens": 600,
      "outputTokens": 400,
      "cacheCreationTokens": 0,
      "cacheReadTokens": 0,
      "modelsUsed": ["claude-opus-4-7"],
      "modelBreakdowns": [
        { "modelName": "claude-opus-4-7", "cost": 0.05, "inputTokens": 600, "outputTokens": 400, "cacheCreationTokens": 0, "cacheReadTokens": 0 }
      ],
      "metadata": { "agents": ["claude"] }
    },
    {
      "agent": "all",
      "period": "2026-05-24",
      "totalTokens": 2000,
      "totalCost": 0.10,
      "inputTokens": 1200,
      "outputTokens": 800,
      "cacheCreationTokens": 0,
      "cacheReadTokens": 0,
      "modelsUsed": ["claude-opus-4-7"],
      "modelBreakdowns": [
        { "modelName": "claude-opus-4-7", "cost": 0.10, "inputTokens": 1200, "outputTokens": 800, "cacheCreationTokens": 0, "cacheReadTokens": 0 }
      ],
      "metadata": { "agents": ["claude"] }
    }
  ]
}
```

Use analogous structure for `weekly`, `monthly`, `session` (top-level key matches the command name). For `blocks.json` use:

```json
{
  "blocks": [
    {
      "id": "2026-05-24T07:00:00.000Z",
      "startTime": "2026-05-24T07:00:00.000Z",
      "endTime": "2026-05-24T12:00:00.000Z",
      "actualEndTime": "2026-05-24T11:30:00.000Z",
      "isActive": false,
      "isGap": false,
      "costUSD": 1.20,
      "totalTokens": 50000,
      "entries": 30,
      "models": ["claude-opus-4-7"],
      "burnRate": null,
      "projection": null,
      "tokenCounts": { "inputTokens": 1000, "outputTokens": 500, "cacheCreationInputTokens": 0, "cacheReadInputTokens": 48500 }
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/__fixtures__/
git commit -m "test(server): add ccusage JSON fixtures"
```

---

## Task 7: Implement ccusage-runner with TDD

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__tests__/ccusage-runner.test.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/ccusage-runner.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { runCcusage, getCcusageVersion } from "../ccusage-runner";

function fakeChild(opts: { stdout?: string; stderr?: string; code?: number; signal?: NodeJS.Signals | null; emitClose?: boolean } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable; stderr: Readable; kill: (sig: NodeJS.Signals) => boolean;
  };
  child.stdout = Readable.from([opts.stdout ?? ""]);
  child.stderr = Readable.from([opts.stderr ?? ""]);
  child.kill = vi.fn(() => true);
  queueMicrotask(() => {
    if (opts.emitClose !== false) child.emit("close", opts.code ?? 0, opts.signal ?? null);
  });
  return child;
}

beforeEach(() => { spawnMock.mockReset(); });

describe("runCcusage", () => {
  it("spawns ccusage with command and --json", async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: '{"daily":[]}', code: 0 }));
    const result = await runCcusage("daily", { bin: "ccusage", timeoutMs: 5000 });
    expect(spawnMock).toHaveBeenCalledWith("ccusage", ["daily", "--json"], expect.any(Object));
    expect(result).toEqual({ daily: [] });
  });

  it("rejects on non-zero exit code with stderr in message", async () => {
    spawnMock.mockReturnValue(fakeChild({ stderr: "boom", code: 2 }));
    await expect(runCcusage("daily", { bin: "ccusage", timeoutMs: 5000 })).rejects.toThrow(/exit 2.*boom/);
  });

  it("rejects on JSON parse failure", async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: "not json", code: 0 }));
    await expect(runCcusage("daily", { bin: "ccusage", timeoutMs: 5000 })).rejects.toThrow(/parse/i);
  });

  it("kills the subprocess on timeout", async () => {
    const child = fakeChild({ emitClose: false });
    spawnMock.mockReturnValue(child);
    const p = runCcusage("daily", { bin: "ccusage", timeoutMs: 5 });
    await expect(p).rejects.toThrow(/timeout/i);
    expect(child.kill).toHaveBeenCalled();
  });
});

describe("getCcusageVersion", () => {
  it("returns trimmed stdout", async () => {
    spawnMock.mockReturnValue(fakeChild({ stdout: "1.2.3\n", code: 0 }));
    const v = await getCcusageVersion({ bin: "ccusage", timeoutMs: 5000 });
    expect(v).toBe("1.2.3");
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm test --workspace=server`
Expected: failures because `ccusage-runner.ts` does not export `runCcusage` / `getCcusageVersion`.

- [ ] **Step 3: Implement `ccusage-runner.ts`**

```ts
import { spawn } from "node:child_process";

export interface RunnerOptions {
  bin: string;
  timeoutMs: number;
  extraArgs?: string[];
}

export async function runCcusage<T = unknown>(command: string, opts: RunnerOptions): Promise<T> {
  const args = [command, "--json", ...(opts.extraArgs ?? [])];
  return execAndParse(opts.bin, args, opts.timeoutMs);
}

export async function getCcusageVersion(opts: { bin: string; timeoutMs: number }): Promise<string> {
  const text = await execAndCollect(opts.bin, ["--version"], opts.timeoutMs);
  return text.trim();
}

async function execAndCollect(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }, timeoutMs);
    child.stdout.on("data", (c) => { stdout += String(c); });
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`ccusage ${args.join(" ")} timeout after ${timeoutMs}ms`));
      if (code !== 0) return reject(new Error(`ccusage ${args.join(" ")} exit ${code}: ${stderr.slice(0, 500)}`));
      resolve(stdout);
    });
  });
}

async function execAndParse<T>(bin: string, args: string[], timeoutMs: number): Promise<T> {
  const stdout = await execAndCollect(bin, args, timeoutMs);
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(`ccusage ${args.join(" ")} JSON parse failed: ${(err as Error).message}; output preview: ${stdout.slice(0, 200)}`);
  }
}
```

- [ ] **Step 4: Re-run tests, expect pass**

Run: `npm test --workspace=server`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/ccusage-runner.ts server/src/__tests__/ccusage-runner.test.ts
git commit -m "feat(server): ccusage runner with spawn, timeout, JSON parse"
```

---

## Task 8: Implement snapshot-store with TDD

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__tests__/snapshot-store.test.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/snapshot-store.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from "vitest";
import { createSnapshotStore } from "../snapshot-store";
import type { Snapshot } from "../types";

function emptySnapshot(generatedAt: string): Snapshot {
  return {
    generatedAt,
    ccusageVersion: "0.0.0",
    daily:   { records: [] },
    weekly:  { records: [] },
    monthly: { records: [] },
    session: { records: [] },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 0, cost: 0 },
      week:    { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 },
      allTime: { tokens: 0, cost: 0 },
      activeBlock: null,
      activeSessionCount: 0,
    },
  };
}

describe("snapshot-store", () => {
  it("starts empty", () => {
    const store = createSnapshotStore();
    expect(store.get()).toBeNull();
    expect(store.getHealth().lastPollAt).toBeNull();
  });

  it("set() updates value and notifies subscribers", () => {
    const store = createSnapshotStore();
    const cb = vi.fn();
    store.subscribe(cb);
    const snap = emptySnapshot("2026-05-24T10:00:00Z");
    store.set(snap);
    expect(store.get()).toEqual(snap);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(snap);
  });

  it("set() with identical generatedAt does not notify", () => {
    const store = createSnapshotStore();
    const cb = vi.fn();
    store.subscribe(cb);
    const snap = emptySnapshot("2026-05-24T10:00:00Z");
    store.set(snap);
    store.set(snap);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("subscribe returns unsubscribe", () => {
    const store = createSnapshotStore();
    const cb = vi.fn();
    const off = store.subscribe(cb);
    off();
    store.set(emptySnapshot("2026-05-24T10:00:00Z"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("recordError stores message and getHealth reflects it", () => {
    const store = createSnapshotStore();
    store.recordError("boom");
    expect(store.getHealth()).toEqual({ status: "degraded", lastPollAt: null, lastError: "boom" });
  });

  it("set() clears lastError and sets lastPollAt", () => {
    const store = createSnapshotStore();
    store.recordError("boom");
    const snap = emptySnapshot("2026-05-24T10:00:00Z");
    store.set(snap);
    expect(store.getHealth()).toEqual({ status: "ok", lastPollAt: "2026-05-24T10:00:00Z", lastError: null });
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm test --workspace=server -- snapshot-store`
Expected: missing module.

- [ ] **Step 3: Implement `snapshot-store.ts`**

```ts
import type { Snapshot, HealthInfo } from "./types";

export type Listener = (snap: Snapshot) => void;

export interface SnapshotStore {
  get(): Snapshot | null;
  set(snap: Snapshot): void;
  recordError(message: string): void;
  getHealth(): HealthInfo;
  subscribe(fn: Listener): () => void;
}

export function createSnapshotStore(): SnapshotStore {
  let current: Snapshot | null = null;
  let lastError: string | null = null;
  const listeners = new Set<Listener>();

  return {
    get() { return current; },
    set(snap) {
      if (current && current.generatedAt === snap.generatedAt) return;
      current = snap;
      lastError = null;
      for (const l of listeners) l(snap);
    },
    recordError(message) {
      lastError = message;
    },
    getHealth() {
      return {
        status: lastError ? "degraded" : "ok",
        lastPollAt: current?.generatedAt ?? null,
        lastError,
      };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test --workspace=server -- snapshot-store`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/snapshot-store.ts server/src/__tests__/snapshot-store.test.ts
git commit -m "feat(server): in-memory snapshot store with subscribers and health"
```

---

## Task 9: Implement poller with TDD (incl. derived calc)

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__tests__/poller.test.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/poller.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSnapshotStore } from "../snapshot-store";
import { createPoller, computeDerived } from "../poller";
import type { UsageRecord, Block } from "../types";

const TODAY = "2026-05-24";

function rec(period: string, tokens: number, cost: number): UsageRecord {
  return {
    period, agent: "all", totalTokens: tokens, totalCost: cost,
    inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    modelsUsed: [], modelBreakdowns: [], metadata: {},
  };
}

describe("computeDerived", () => {
  const now = new Date(`${TODAY}T12:00:00Z`);

  it("sums today/week/month/all-time correctly", () => {
    const daily   = [rec("2026-05-23", 100, 1), rec("2026-05-24", 200, 2)];
    const weekly  = [rec("2026-W21", 1000, 10)];
    const monthly = [rec("2026-05", 5000, 50)];
    const d = computeDerived({ daily, weekly, monthly, session: [], blocks: [] }, now);
    expect(d.today).toEqual({ tokens: 200, cost: 2 });
    expect(d.week).toEqual({ tokens: 1000, cost: 10 });
    expect(d.month).toEqual({ tokens: 5000, cost: 50 });
    expect(d.allTime).toEqual({ tokens: 300, cost: 3 });
  });

  it("picks active block", () => {
    const active: Block = {
      id: "x", startTime: "", endTime: "", actualEndTime: null,
      isActive: true, isGap: false, costUSD: 0, totalTokens: 0, entries: 0,
      models: [], burnRate: null, projection: null,
      tokenCounts: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    };
    const d = computeDerived({ daily: [], weekly: [], monthly: [], session: [], blocks: [active] }, now);
    expect(d.activeBlock).toBe(active);
  });

  it("counts active sessions (lastActivity within 30min)", () => {
    const recent = { ...rec("s1", 0, 0), metadata: { lastActivity: new Date(now.getTime() - 5 * 60_000).toISOString() } };
    const stale  = { ...rec("s2", 0, 0), metadata: { lastActivity: new Date(now.getTime() - 60 * 60_000).toISOString() } };
    const d = computeDerived({ daily: [], weekly: [], monthly: [], session: [recent, stale], blocks: [] }, now);
    expect(d.activeSessionCount).toBe(1);
  });
});

describe("poller", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(`${TODAY}T12:00:00Z`) }));
  afterEach(() => vi.useRealTimers());

  it("runs all five commands and populates store", async () => {
    const store = createSnapshotStore();
    const runMock = vi.fn(async (cmd: string) => {
      const key = cmd === "blocks" ? "blocks" : cmd;
      return { [key]: [] };
    });
    const poller = createPoller({
      store,
      runCcusage: runMock as never,
      getVersion: async () => "1.2.3",
      intervalMs: 10_000,
      now: () => new Date(`${TODAY}T12:00:00Z`),
    });
    await poller.runOnce();
    expect(runMock).toHaveBeenCalledTimes(5);
    const snap = store.get();
    expect(snap?.ccusageVersion).toBe("1.2.3");
    expect(snap?.daily.records).toEqual([]);
  });

  it("records error when a command throws and keeps last snapshot", async () => {
    const store = createSnapshotStore();
    const runMock = vi.fn(async () => { throw new Error("bad"); });
    const poller = createPoller({
      store,
      runCcusage: runMock as never,
      getVersion: async () => "1.0.0",
      intervalMs: 10_000,
      now: () => new Date(`${TODAY}T12:00:00Z`),
    });
    await poller.runOnce();
    expect(store.getHealth().lastError).toMatch(/bad/);
    expect(store.get()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm test --workspace=server -- poller`
Expected: missing module.

- [ ] **Step 3: Implement `poller.ts`**

```ts
import pLimit from "p-limit";
import type { Snapshot, UsageRecord, Block, Derived } from "./types";
import type { SnapshotStore } from "./snapshot-store";

export interface PollerDeps {
  store: SnapshotStore;
  runCcusage: <T>(cmd: string) => Promise<T>;
  getVersion: () => Promise<string>;
  intervalMs: number;
  now?: () => Date;
}

export interface Poller {
  runOnce(): Promise<void>;
  start(): void;
  stop(): void;
}

const ACTIVE_SESSION_WINDOW_MS = 30 * 60 * 1000;

export function computeDerived(
  buckets: { daily: UsageRecord[]; weekly: UsageRecord[]; monthly: UsageRecord[]; session: UsageRecord[]; blocks: Block[] },
  now: Date,
): Derived {
  const todayKey = now.toISOString().slice(0, 10);
  const sum = (rs: UsageRecord[]) => rs.reduce(
    (acc, r) => ({ tokens: acc.tokens + r.totalTokens, cost: acc.cost + r.totalCost }),
    { tokens: 0, cost: 0 },
  );
  const today = sum(buckets.daily.filter((r) => r.period === todayKey));
  const week = sum(buckets.weekly);
  const month = sum(buckets.monthly);
  const allTime = sum(buckets.daily);
  const activeBlock = buckets.blocks.find((b) => b.isActive) ?? null;
  const activeSessionCount = buckets.session.filter((s) => {
    const t = s.metadata.lastActivity;
    if (!t) return false;
    const ts = Date.parse(t);
    return Number.isFinite(ts) && (now.getTime() - ts) <= ACTIVE_SESSION_WINDOW_MS;
  }).length;
  return { today, week, month, allTime, activeBlock, activeSessionCount };
}

const RESPONSE_KEY: Record<string, string> = {
  daily: "daily", weekly: "weekly", monthly: "monthly", session: "session", blocks: "blocks",
};

export function createPoller(deps: PollerDeps): Poller {
  const now = deps.now ?? (() => new Date());
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function runOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const limit = pLimit(2);
      const cmds = ["daily", "weekly", "monthly", "session", "blocks"] as const;
      const results = await Promise.all(
        cmds.map((cmd) => limit(() => deps.runCcusage<Record<string, unknown[]>>(cmd))),
      );
      const buckets = {
        daily:   (results[0] as any)[RESPONSE_KEY.daily]   as UsageRecord[],
        weekly:  (results[1] as any)[RESPONSE_KEY.weekly]  as UsageRecord[],
        monthly: (results[2] as any)[RESPONSE_KEY.monthly] as UsageRecord[],
        session: (results[3] as any)[RESPONSE_KEY.session] as UsageRecord[],
        blocks:  (results[4] as any)[RESPONSE_KEY.blocks]  as Block[],
      };
      const version = await deps.getVersion().catch(() => "unknown");
      const generatedAt = now().toISOString();
      const snap: Snapshot = {
        generatedAt,
        ccusageVersion: version,
        daily:   { records: buckets.daily ?? [] },
        weekly:  { records: buckets.weekly ?? [] },
        monthly: { records: buckets.monthly ?? [] },
        session: { records: buckets.session ?? [] },
        blocks:  { records: buckets.blocks ?? [] },
        derived: computeDerived(buckets, now()),
      };
      deps.store.set(snap);
    } catch (err) {
      deps.store.recordError((err as Error).message);
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (timer) return;
    const tick = async () => {
      await runOnce();
      timer = setTimeout(tick, deps.intervalMs);
    };
    timer = setTimeout(tick, deps.intervalMs);
  }

  return {
    runOnce,
    start() { schedule(); },
    stop() { if (timer) { clearTimeout(timer); timer = null; } },
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test --workspace=server -- poller`
Expected: 5 passing tests (3 derived + 2 poller).

- [ ] **Step 5: Commit**

```bash
git add server/src/poller.ts server/src/__tests__/poller.test.ts
git commit -m "feat(server): poller running 5 ccusage commands + derived totals"
```

---

## Task 10: Implement ccusage-updater with TDD

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__tests__/ccusage-updater.test.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/ccusage-updater.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCcusageUpdater } from "../ccusage-updater";

describe("ccusage-updater", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once at start", async () => {
    const install = vi.fn(async () => "1.2.3");
    const onVersion = vi.fn();
    const updater = createCcusageUpdater({ intervalMs: 60_000, install, onVersion });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(install).toHaveBeenCalledTimes(1);
    expect(onVersion).toHaveBeenCalledWith("1.2.3");
  });

  it("schedules subsequent runs", async () => {
    const install = vi.fn(async () => "1.2.3");
    const updater = createCcusageUpdater({ intervalMs: 1_000, install, onVersion: () => {} });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(install).toHaveBeenCalledTimes(3);
  });

  it("install failures do not stop the schedule", async () => {
    let n = 0;
    const install = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error("network");
      return "1.2.4";
    });
    const onVersion = vi.fn();
    const updater = createCcusageUpdater({ intervalMs: 1_000, install, onVersion });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onVersion).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onVersion).toHaveBeenCalledWith("1.2.4");
  });

  it("intervalMs=0 disables auto-update", async () => {
    const install = vi.fn();
    const updater = createCcusageUpdater({ intervalMs: 0, install, onVersion: () => {} });
    updater.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(install).not.toHaveBeenCalled();
  });

  it("stop() halts further runs", async () => {
    const install = vi.fn(async () => "x");
    const updater = createCcusageUpdater({ intervalMs: 1_000, install, onVersion: () => {} });
    updater.start();
    await vi.advanceTimersByTimeAsync(0);
    updater.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(install).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm test --workspace=server -- ccusage-updater`
Expected: missing module.

- [ ] **Step 3: Implement `ccusage-updater.ts`**

```ts
import { spawn } from "node:child_process";

export interface UpdaterDeps {
  intervalMs: number;
  install: () => Promise<string>;
  onVersion: (v: string) => void;
}

export interface Updater {
  start(): void;
  stop(): void;
}

export async function runNpmInstall(timeoutMs = 180_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("npm", ["install", "-g", "ccusage@latest", "--silent"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.on("error", (e) => { clearTimeout(t); reject(e); });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0) return reject(new Error(`npm install failed (${code}): ${stderr.slice(0, 500)}`));
      resolve("ok");
    });
  });
}

export function createCcusageUpdater(deps: UpdaterDeps): Updater {
  if (deps.intervalMs === 0) return { start() {}, stop() {} };
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const version = await deps.install();
      deps.onVersion(version);
    } catch (err) {
      console.warn(`[ccusage-updater] update failed, keeping previous install: ${(err as Error).message}`);
    } finally {
      if (!stopped) timer = setTimeout(tick, deps.intervalMs);
    }
  }

  return {
    start() { timer = setTimeout(tick, 0); },
    stop()  { stopped = true; if (timer) { clearTimeout(timer); timer = null; } },
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test --workspace=server -- ccusage-updater`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/ccusage-updater.ts server/src/__tests__/ccusage-updater.test.ts
git commit -m "feat(server): periodic ccusage auto-updater with failure tolerance"
```

---

## Task 11: Implement sse-hub with TDD

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__tests__/sse-hub.test.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/sse-hub.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createSseHub } from "../sse-hub";

class FakeRes extends EventEmitter {
  setHeader = vi.fn();
  flushHeaders = vi.fn();
  write = vi.fn();
  end = vi.fn();
}

describe("sse-hub", () => {
  it("attach writes SSE headers and sends initial snapshot if provided", () => {
    const hub = createSseHub();
    const res = new FakeRes();
    hub.attach(res as never, { foo: "bar" });
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("event: snapshot"));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"foo":"bar"'));
  });

  it("broadcast writes update to all attached clients", () => {
    const hub = createSseHub();
    const a = new FakeRes(); const b = new FakeRes();
    hub.attach(a as never, null);
    hub.attach(b as never, null);
    a.write.mockClear(); b.write.mockClear();
    hub.broadcast({ n: 1 });
    expect(a.write).toHaveBeenCalledWith(expect.stringContaining("event: update"));
    expect(b.write).toHaveBeenCalledWith(expect.stringContaining('"n":1'));
  });

  it("removes a client when it closes", () => {
    const hub = createSseHub();
    const a = new FakeRes();
    hub.attach(a as never, null);
    a.emit("close");
    a.write.mockClear();
    hub.broadcast({ n: 2 });
    expect(a.write).not.toHaveBeenCalled();
  });

  it("startHeartbeat writes :hb periodically", () => {
    vi.useFakeTimers();
    const hub = createSseHub();
    const a = new FakeRes();
    hub.attach(a as never, null);
    a.write.mockClear();
    const stop = hub.startHeartbeat(1_000);
    vi.advanceTimersByTime(3_500);
    expect(a.write).toHaveBeenCalledWith(":hb\n\n");
    expect(a.write).toHaveBeenCalledTimes(3);
    stop();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm test --workspace=server -- sse-hub`
Expected: missing module.

- [ ] **Step 3: Implement `sse-hub.ts`**

```ts
import type { Response } from "express";

export interface SseHub {
  attach(res: Response, initialSnapshot: unknown): void;
  broadcast(snapshot: unknown): void;
  emitError(message: string, lastSuccessAt: string | null): void;
  startHeartbeat(intervalMs: number): () => void;
  size(): number;
}

export function createSseHub(): SseHub {
  const clients = new Set<Response>();

  function writeEvent(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  return {
    attach(res, initialSnapshot) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      clients.add(res);
      res.on("close", () => clients.delete(res));
      if (initialSnapshot != null) writeEvent(res, "snapshot", initialSnapshot);
    },
    broadcast(snapshot) {
      for (const c of clients) writeEvent(c, "update", snapshot);
    },
    emitError(message, lastSuccessAt) {
      for (const c of clients) writeEvent(c, "error", { message, lastSuccessAt });
    },
    startHeartbeat(intervalMs) {
      const t = setInterval(() => {
        for (const c of clients) c.write(":hb\n\n");
      }, intervalMs);
      return () => clearInterval(t);
    },
    size() { return clients.size; },
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test --workspace=server -- sse-hub`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/sse-hub.ts server/src/__tests__/sse-hub.test.ts
git commit -m "feat(server): SSE hub with broadcast, error, and heartbeat"
```

---

## Task 12: Implement routes with TDD

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/__tests__/routes.test.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/routes.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createSnapshotStore } from "../snapshot-store";
import { createSseHub } from "../sse-hub";
import { createRoutes } from "../routes";
import type { Snapshot } from "../types";

function snap(at: string): Snapshot {
  return {
    generatedAt: at, ccusageVersion: "1.0.0",
    daily:   { records: [] }, weekly:  { records: [] },
    monthly: { records: [] }, session: { records: [] },
    blocks:  { records: [] },
    derived: {
      today:   { tokens: 0, cost: 0 }, week:    { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 }, allTime: { tokens: 0, cost: 0 },
      activeBlock: null, activeSessionCount: 0,
    },
  };
}

function makeApp(opts: { runOnce?: () => Promise<void>; populated?: boolean }) {
  const store = createSnapshotStore();
  if (opts.populated) store.set(snap("2026-05-24T10:00:00Z"));
  const hub = createSseHub();
  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes({ store, hub, refresh: opts.runOnce ?? (async () => {}) }));
  return { app, store, hub };
}

describe("routes", () => {
  it("GET /api/snapshot returns 503 when empty", async () => {
    const { app } = makeApp({});
    const res = await request(app).get("/api/snapshot");
    expect(res.status).toBe(503);
  });

  it("GET /api/snapshot returns snapshot when populated", async () => {
    const { app } = makeApp({ populated: true });
    const res = await request(app).get("/api/snapshot");
    expect(res.status).toBe(200);
    expect(res.body.generatedAt).toBe("2026-05-24T10:00:00Z");
  });

  it("POST /api/refresh calls refresh fn and returns ok", async () => {
    const refresh = vi.fn(async () => {});
    const { app } = makeApp({ runOnce: refresh, populated: true });
    const res = await request(app).post("/api/refresh");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(refresh).toHaveBeenCalled();
  });

  it("GET /api/health returns store health", async () => {
    const { app } = makeApp({ populated: true });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.lastPollAt).toBe("2026-05-24T10:00:00Z");
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm test --workspace=server -- routes`
Expected: missing module.

- [ ] **Step 3: Implement `routes.ts`**

```ts
import { Router, type Response } from "express";
import type { SnapshotStore } from "./snapshot-store";
import type { SseHub } from "./sse-hub";

export interface RoutesDeps {
  store: SnapshotStore;
  hub: SseHub;
  refresh: () => Promise<void>;
}

export function createRoutes(deps: RoutesDeps): Router {
  const r = Router();

  r.get("/snapshot", (_req, res: Response) => {
    const snap = deps.store.get();
    if (!snap) return res.status(503).json({ error: "snapshot not ready" });
    res.json(snap);
  });

  r.get("/events", (_req, res) => {
    deps.hub.attach(res, deps.store.get());
  });

  r.post("/refresh", async (_req, res) => {
    await deps.refresh();
    res.json({ ok: true, generatedAt: deps.store.get()?.generatedAt ?? null });
  });

  r.get("/health", (_req, res) => {
    res.json(deps.store.getHealth());
  });

  return r;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test --workspace=server -- routes`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes.ts server/src/__tests__/routes.test.ts
git commit -m "feat(server): REST + SSE routes"
```

---

## Task 13: Wire app + index

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/server/src/app.ts`
- Modify: `/Users/sd3/Desktop/project/ccusage-web/server/src/index.ts`

- [ ] **Step 1: Write `app.ts`**

```ts
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSnapshotStore } from "./snapshot-store";
import { createSseHub } from "./sse-hub";
import { createRoutes } from "./routes";
import { createPoller } from "./poller";
import { createCcusageUpdater, runNpmInstall } from "./ccusage-updater";
import { runCcusage, getCcusageVersion } from "./ccusage-runner";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppConfig {
  port: number;
  pollIntervalMs: number;
  ccusageTimeoutMs: number;
  ccusageBin: string;
  autoUpdateIntervalMs: number;
  staticDir: string;
}

export function buildApp(cfg: AppConfig) {
  const store = createSnapshotStore();
  const hub = createSseHub();
  const poller = createPoller({
    store,
    runCcusage: (cmd) => runCcusage(cmd, { bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs }),
    getVersion: () => getCcusageVersion({ bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs }),
    intervalMs: cfg.pollIntervalMs,
  });
  store.subscribe((snap) => hub.broadcast(snap));

  const updater = createCcusageUpdater({
    intervalMs: cfg.autoUpdateIntervalMs,
    install: async () => {
      await runNpmInstall();
      return getCcusageVersion({ bin: cfg.ccusageBin, timeoutMs: cfg.ccusageTimeoutMs });
    },
    onVersion: (v) => console.log(`[updater] ccusage now ${v}`),
  });

  const app = express();
  app.use(express.json());
  app.use("/api", createRoutes({ store, hub, refresh: () => poller.runOnce() }));
  app.use(express.static(cfg.staticDir));
  // SPA fallback
  app.get("*", (_req, res) => res.sendFile(path.join(cfg.staticDir, "index.html")));

  return { app, store, hub, poller, updater };
}
```

- [ ] **Step 2: Write `index.ts`**

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cfg = {
  port: Number(process.env.PORT ?? 47821),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 2000),
  ccusageTimeoutMs: Number(process.env.CCUSAGE_TIMEOUT_MS ?? 30000),
  ccusageBin: process.env.CCUSAGE_BIN ?? "ccusage",
  autoUpdateIntervalMs: Number(process.env.CCUSAGE_AUTO_UPDATE_INTERVAL_MS ?? 86_400_000),
  staticDir: path.resolve(__dirname, "public"),
};

const { app, poller, updater, hub } = buildApp(cfg);

await poller.runOnce().catch((e) => console.error("[startup poll]", e));
poller.start();
updater.start();
hub.startHeartbeat(15_000);

app.listen(cfg.port, () => {
  console.log(`ccusage-web listening on :${cfg.port}`);
});
```

- [ ] **Step 3: Build server**

Run: `npm run build --workspace=server`
Expected: succeeds. `server/dist/app.js` and `server/dist/index.js` exist.

- [ ] **Step 4: Commit**

```bash
git add server/src/app.ts server/src/index.ts
git commit -m "feat(server): wire app and entry point"
```

---

## Task 14: Web types + API + SSE client

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/types.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/lib/api.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/lib/sse.ts`

- [ ] **Step 1: Copy types to `web/src/types.ts`**

Copy the entire content of `server/src/types.ts` verbatim. (Future changes must be applied in both places — documented in README.)

- [ ] **Step 2: Write `web/src/lib/api.ts`**

```ts
import type { Snapshot } from "@/types";

export async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch("/api/snapshot");
  if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
  return res.json();
}

export async function triggerRefresh(): Promise<{ ok: boolean; generatedAt: string | null }> {
  const res = await fetch("/api/refresh", { method: "POST" });
  if (!res.ok) throw new Error(`refresh HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Write `web/src/lib/sse.ts`**

```ts
import type { Snapshot } from "@/types";

export type ConnectionStatus = "connecting" | "connected" | "error";

export interface SseClientCallbacks {
  onSnapshot: (s: Snapshot) => void;
  onUpdate:   (s: Snapshot) => void;
  onError:    (msg: string, lastSuccessAt: string | null) => void;
  onStatus:   (s: ConnectionStatus) => void;
}

export function connectSse(cbs: SseClientCallbacks): () => void {
  cbs.onStatus("connecting");
  const es = new EventSource("/api/events");
  es.addEventListener("open", () => cbs.onStatus("connected"));
  es.addEventListener("snapshot", (e) => cbs.onSnapshot(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("update",   (e) => cbs.onUpdate(JSON.parse((e as MessageEvent).data)));
  es.addEventListener("error", (e) => {
    const evt = e as MessageEvent;
    if (evt.data) {
      const payload = JSON.parse(evt.data);
      cbs.onError(payload.message, payload.lastSuccessAt);
    } else {
      cbs.onStatus("error");
    }
  });
  return () => es.close();
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/types.ts web/src/lib/
git commit -m "feat(web): types, REST api wrapper, SSE client"
```

---

## Task 15: Web store (Zustand) with TDD

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/__tests__/setup.ts`
- Modify: `/Users/sd3/Desktop/project/ccusage-web/web/vitest.config.ts` (create)
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/__tests__/usage-store.test.ts`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/store/usage-store.ts`

- [ ] **Step 1: Write `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 2: Write `web/src/__tests__/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write failing test `usage-store.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { useUsageStore } from "@/store/usage-store";
import type { Snapshot } from "@/types";

function snap(at: string, tokens: number): Snapshot {
  return {
    generatedAt: at, ccusageVersion: "1.0.0",
    daily: { records: [] }, weekly: { records: [] }, monthly: { records: [] },
    session: { records: [] }, blocks: { records: [] },
    derived: {
      today:   { tokens, cost: 0 }, week: { tokens: 0, cost: 0 },
      month:   { tokens: 0, cost: 0 }, allTime: { tokens: 0, cost: 0 },
      activeBlock: null, activeSessionCount: 0,
    },
  };
}

describe("useUsageStore", () => {
  it("default state", () => {
    const s = useUsageStore.getState();
    expect(s.snapshot).toBeNull();
    expect(s.connectionStatus).toBe("connecting");
    expect(s.lastError).toBeNull();
  });

  it("setSnapshot replaces snapshot atomically", () => {
    useUsageStore.getState().setSnapshot(snap("2026-05-24T10:00:00Z", 100));
    expect(useUsageStore.getState().snapshot?.derived.today.tokens).toBe(100);
    useUsageStore.getState().setSnapshot(snap("2026-05-24T10:00:02Z", 200));
    expect(useUsageStore.getState().snapshot?.derived.today.tokens).toBe(200);
  });

  it("setStatus updates connection status", () => {
    useUsageStore.getState().setStatus("connected");
    expect(useUsageStore.getState().connectionStatus).toBe("connected");
  });

  it("setError stores message", () => {
    useUsageStore.getState().setError("oops", "2026-05-24T10:00:00Z");
    expect(useUsageStore.getState().lastError).toBe("oops");
  });
});
```

- [ ] **Step 4: Run tests, confirm failure**

Run: `npm test --workspace=web`
Expected: missing module.

- [ ] **Step 5: Implement `usage-store.ts`**

```ts
import { create } from "zustand";
import type { Snapshot } from "@/types";
import type { ConnectionStatus } from "@/lib/sse";

interface UsageState {
  snapshot: Snapshot | null;
  connectionStatus: ConnectionStatus;
  lastError: string | null;
  lastSuccessAt: string | null;
  setSnapshot: (s: Snapshot) => void;
  setStatus: (s: ConnectionStatus) => void;
  setError: (msg: string | null, lastSuccessAt: string | null) => void;
}

export const useUsageStore = create<UsageState>((set) => ({
  snapshot: null,
  connectionStatus: "connecting",
  lastError: null,
  lastSuccessAt: null,
  setSnapshot: (s) => set({ snapshot: s, lastSuccessAt: s.generatedAt, lastError: null }),
  setStatus: (s) => set({ connectionStatus: s }),
  setError: (msg, lastSuccessAt) => set({ lastError: msg, lastSuccessAt }),
}));
```

- [ ] **Step 6: Run tests, expect pass**

Run: `npm test --workspace=web`
Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add web/vitest.config.ts web/src/__tests__/ web/src/store/
git commit -m "feat(web): zustand usage store + tests"
```

---

## Task 16: MetricCard component with TDD

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/__tests__/MetricCard.test.tsx`
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/MetricCard.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MetricCard } from "@/components/MetricCard";

describe("MetricCard", () => {
  it("renders initial value formatted", () => {
    render(<MetricCard title="Today" value={1234} format="number" />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByTestId("metric-value").textContent).toMatch(/1,234/);
  });

  it("renders cost format with $", () => {
    render(<MetricCard title="Cost" value={12.5} format="cost" />);
    expect(screen.getByTestId("metric-value").textContent).toMatch(/\$12\.50/);
  });

  it("toggles the pulse class when value changes", async () => {
    const { rerender } = render(<MetricCard title="x" value={1} format="number" />);
    const card = screen.getByTestId("metric-card");
    expect(card.className).not.toMatch(/ring-sky/);
    await act(async () => { rerender(<MetricCard title="x" value={2} format="number" />); });
    expect(card.className).toMatch(/ring-sky/);
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npm test --workspace=web -- MetricCard`
Expected: missing module.

- [ ] **Step 3: Implement `MetricCard.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn, formatNumber, formatCost } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  value: number;
  format: "number" | "cost";
  subtitle?: string;
}

export function MetricCard({ title, value, format, subtitle }: MetricCardProps) {
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (v) => (format === "cost" ? formatCost(v) : formatNumber(v)));
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    const controls = animate(motionValue, value, { duration: 0.6, ease: "easeOut" });
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 500);
    prev.current = value;
    return () => { controls.stop(); clearTimeout(t); };
  }, [value, motionValue]);

  return (
    <Card
      data-testid="metric-card"
      className={cn(
        "transition-shadow",
        pulse && "ring-2 ring-sky-400/50 shadow-sky-400/20 shadow-lg",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <motion.div data-testid="metric-value" className="text-3xl font-semibold font-mono tabular-nums">
          {display}
        </motion.div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test --workspace=web -- MetricCard`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/MetricCard.tsx web/src/__tests__/MetricCard.test.tsx
git commit -m "feat(web): rolling-number MetricCard with pulse on change"
```

---

## Task 17: LiveIndicator component

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/LiveIndicator.tsx`

- [ ] **Step 1: Write `LiveIndicator.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useUsageStore } from "@/store/usage-store";
import { cn } from "@/lib/utils";

function relativeAgo(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const diffMs = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const s = Math.round(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function LiveIndicator() {
  const status = useUsageStore((s) => s.connectionStatus);
  const lastSuccessAt = useUsageStore((s) => s.lastSuccessAt);
  const lastError = useUsageStore((s) => s.lastError);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const color =
    status !== "connected" ? "bg-red-500" :
    lastError ? "bg-amber-500" : "bg-emerald-500";
  const label =
    status !== "connected" ? "Reconnecting…" :
    lastError ? `Error · ${lastError.slice(0, 60)}` :
    `Live · ${relativeAgo(lastSuccessAt, new Date())}`;
  // tick read to force re-render
  void tick;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative inline-flex h-2.5 w-2.5">
        <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", color)} />
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
      </span>
      <span>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/LiveIndicator.tsx
git commit -m "feat(web): live indicator with status + relative age"
```

---

## Task 18: TrendChart component

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/TrendChart.tsx`

- [ ] **Step 1: Write `TrendChart.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber } from "@/lib/utils";

type Window = "30" | "60" | "90";

export function TrendChart() {
  const records = useUsageStore((s) => s.snapshot?.daily.records ?? []);
  const [win, setWin] = useState<Window>("30");

  const data = useMemo(() => {
    const sorted = [...records].sort((a, b) => a.period.localeCompare(b.period));
    return sorted.slice(-Number(win)).map((r) => ({
      period: r.period,
      tokens: r.totalTokens,
      cost: Number(r.totalCost.toFixed(2)),
    }));
  }, [records, win]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base text-foreground">Daily trend</CardTitle>
        <Tabs value={win} onValueChange={(v) => setWin(v as Window)}>
          <TabsList>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="60">60d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(199 89% 48%)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="hsl(199 89% 48%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="period" tickFormatter={(v) => v.slice(5)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis tickFormatter={(v) => formatNumber(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} width={68} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              formatter={(value: number, name) => name === "cost" ? formatCost(value) : formatNumber(value)}
            />
            <Area type="monotone" dataKey="tokens" stroke="hsl(199 89% 48%)" fill="url(#tokGrad)" animationDuration={400} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/TrendChart.tsx
git commit -m "feat(web): daily TrendChart with 30/60/90d toggle"
```

---

## Task 19: ModelBreakdown component

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/ModelBreakdown.tsx`

- [ ] **Step 1: Write `ModelBreakdown.tsx`**

```tsx
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber } from "@/lib/utils";

const COLORS = [
  "hsl(199 89% 48%)", "hsl(160 84% 39%)", "hsl(38 92% 50%)",
  "hsl(280 65% 60%)", "hsl(348 83% 60%)", "hsl(217 91% 60%)",
];

export function ModelBreakdown() {
  const daily = useUsageStore((s) => s.snapshot?.daily.records ?? []);

  const slices = useMemo(() => {
    const acc = new Map<string, { tokens: number; cost: number }>();
    for (const r of daily) {
      for (const mb of r.modelBreakdowns) {
        const cur = acc.get(mb.modelName) ?? { tokens: 0, cost: 0 };
        const tokens = mb.inputTokens + mb.outputTokens + mb.cacheCreationTokens + mb.cacheReadTokens;
        acc.set(mb.modelName, { tokens: cur.tokens + tokens, cost: cur.cost + mb.cost });
      }
    }
    return Array.from(acc.entries())
      .map(([name, v]) => ({ name, tokens: v.tokens, cost: v.cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [daily]);

  const totalCost = slices.reduce((s, x) => s + x.cost, 0);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base text-foreground">Models</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="cost" nameKey="name" innerRadius={42} outerRadius={78} paddingAngle={2}>
                {slices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(value: number) => formatCost(value)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2 text-sm">
          {slices.map((s, i) => (
            <li key={s.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 truncate">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="truncate" title={s.name}>{s.name}</span>
              </span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">
                {formatCost(s.cost)} · {formatNumber(s.tokens)}
              </span>
            </li>
          ))}
          {slices.length === 0 && <li className="text-muted-foreground text-sm">No data</li>}
          {totalCost > 0 && (
            <li className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>Total</span><span className="font-mono">{formatCost(totalCost)}</span>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ModelBreakdown.tsx
git commit -m "feat(web): per-model donut + table"
```

---

## Task 20: BlocksPanel component

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/BlocksPanel.tsx`

- [ ] **Step 1: Write `BlocksPanel.tsx`**

```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber } from "@/lib/utils";

function pct(start: string, end: string, now: Date): number {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.max(0, Math.min(100, ((now.getTime() - s) / (e - s)) * 100));
}

export function BlocksPanel() {
  const blocks = useUsageStore((s) => s.snapshot?.blocks.records ?? []);
  const active = useUsageStore((s) => s.snapshot?.derived.activeBlock ?? null);
  const recent = blocks.filter((b) => !b.isGap).slice(-8).reverse();
  const now = new Date();

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base text-foreground">Billing block (5h)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {active ? (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Started {new Date(active.startTime).toLocaleTimeString()}</span>
              <span>Ends {new Date(active.endTime).toLocaleTimeString()}</span>
            </div>
            <div className="h-2 w-full rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: `${pct(active.startTime, active.endTime, now)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm pt-1">
              <span className="font-mono tabular-nums">{formatCost(active.costUSD)}</span>
              <span className="font-mono tabular-nums text-muted-foreground">{formatNumber(active.totalTokens)} tok</span>
            </div>
            {active.burnRate !== null && (
              <div className="text-xs text-muted-foreground">Burn rate: {formatNumber(active.burnRate)} tok/min</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No active block</div>
        )}

        <div className="pt-2 border-t">
          <div className="text-xs text-muted-foreground mb-2">Recent blocks</div>
          <ul className="space-y-1.5 text-xs">
            {recent.map((b) => (
              <li key={b.id} className="flex justify-between font-mono tabular-nums">
                <span className="text-muted-foreground">{new Date(b.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                <span>{formatCost(b.costUSD)} · {formatNumber(b.totalTokens)}</span>
              </li>
            ))}
            {recent.length === 0 && <li className="text-muted-foreground">No history</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/BlocksPanel.tsx
git commit -m "feat(web): BlocksPanel showing active 5h window and history"
```

---

## Task 21: SessionTable component

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/components/SessionTable.tsx`

- [ ] **Step 1: Write `SessionTable.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber, cn } from "@/lib/utils";

type SortKey = "period" | "agent" | "totalTokens" | "totalCost" | "lastActivity";

export function SessionTable() {
  const sessions = useUsageStore((s) => s.snapshot?.session.records ?? []);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [desc, setDesc] = useState(true);

  const agents = useMemo(() => Array.from(new Set(sessions.map((s) => s.agent))).sort(), [sessions]);

  const rows = useMemo(() => {
    let r = sessions;
    if (agent) r = r.filter((s) => s.agent === agent);
    if (q.trim()) {
      const lq = q.toLowerCase();
      r = r.filter((s) => s.period.toLowerCase().includes(lq) || s.modelsUsed.some((m) => m.toLowerCase().includes(lq)));
    }
    const get = (x: typeof r[number]) => {
      if (sortKey === "lastActivity") return x.metadata.lastActivity ?? "";
      const v = (x as any)[sortKey];
      return typeof v === "number" ? v : String(v ?? "");
    };
    return [...r].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }, [sessions, agent, q, sortKey, desc]);

  function header(label: string, key: SortKey) {
    return (
      <TH>
        <button
          className={cn("inline-flex items-center gap-1 hover:text-foreground", sortKey === key && "text-foreground")}
          onClick={() => { if (sortKey === key) setDesc(!desc); else { setSortKey(key); setDesc(true); } }}
        >
          {label}{sortKey === key && <span className="text-[10px]">{desc ? "▼" : "▲"}</span>}
        </button>
      </TH>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base text-foreground">Sessions</CardTitle>
        <div className="flex items-center gap-2">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-44" />
          <select
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="">all agents</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              {header("Session", "period")}
              {header("Agent", "agent")}
              {header("Tokens", "totalTokens")}
              {header("Cost", "totalCost")}
              {header("Last activity", "lastActivity")}
              <TH>Models</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={`${s.agent}:${s.period}`}>
                <TD className="font-mono text-xs truncate max-w-[180px]" title={s.period}>{s.period}</TD>
                <TD>{s.agent}</TD>
                <TD className="font-mono tabular-nums">{formatNumber(s.totalTokens)}</TD>
                <TD className="font-mono tabular-nums">{formatCost(s.totalCost)}</TD>
                <TD className="text-xs text-muted-foreground">{s.metadata.lastActivity ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground truncate max-w-[200px]" title={s.modelsUsed.join(", ")}>{s.modelsUsed.join(", ")}</TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR><TD colSpan={6} className="text-center text-sm text-muted-foreground">No sessions match</TD></TR>
            )}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/SessionTable.tsx
git commit -m "feat(web): SessionTable with search, agent filter, sort"
```

---

## Task 22: Dashboard composition + App wiring

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/web/src/pages/Dashboard.tsx`
- Modify: `/Users/sd3/Desktop/project/ccusage-web/web/src/App.tsx`

- [ ] **Step 1: Write `pages/Dashboard.tsx`**

```tsx
import { useEffect } from "react";
import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { ModelBreakdown } from "@/components/ModelBreakdown";
import { BlocksPanel } from "@/components/BlocksPanel";
import { SessionTable } from "@/components/SessionTable";
import { LiveIndicator } from "@/components/LiveIndicator";
import { useUsageStore } from "@/store/usage-store";
import { fetchSnapshot, triggerRefresh } from "@/lib/api";
import { connectSse } from "@/lib/sse";
import { RefreshCw } from "lucide-react";

export function Dashboard() {
  const snap = useUsageStore((s) => s.snapshot);

  useEffect(() => {
    fetchSnapshot().then((s) => useUsageStore.getState().setSnapshot(s)).catch(() => {});
    return connectSse({
      onSnapshot: (s) => useUsageStore.getState().setSnapshot(s),
      onUpdate:   (s) => useUsageStore.getState().setSnapshot(s),
      onError:    (msg, lastSuccessAt) => useUsageStore.getState().setError(msg, lastSuccessAt),
      onStatus:   (st) => useUsageStore.getState().setStatus(st),
    });
  }, []);

  const d = snap?.derived;

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">ccusage</h1>
        <div className="flex items-center gap-3">
          <LiveIndicator />
          <button
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40"
            onClick={() => triggerRefresh().catch(() => {})}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Today"     value={d?.today.tokens   ?? 0} format="number" subtitle={d ? `${d.today.cost.toFixed(2)} USD`   : "—"} />
        <MetricCard title="This week" value={d?.week.tokens    ?? 0} format="number" subtitle={d ? `${d.week.cost.toFixed(2)} USD`    : "—"} />
        <MetricCard title="This month" value={d?.month.tokens  ?? 0} format="number" subtitle={d ? `${d.month.cost.toFixed(2)} USD`   : "—"} />
        <MetricCard title="All-time"  value={d?.allTime.tokens ?? 0} format="number" subtitle={d ? `${d.allTime.cost.toFixed(2)} USD` : "—"} />
      </section>

      <TrendChart />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModelBreakdown />
        <BlocksPanel />
      </section>

      <SessionTable />

      {snap && (
        <footer className="text-[10px] text-muted-foreground text-right">
          ccusage v{snap.ccusageVersion} · snapshot {snap.generatedAt}
        </footer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `web/src/App.tsx`**

```tsx
import { Dashboard } from "@/pages/Dashboard";

export default function App() {
  return <Dashboard />;
}
```

- [ ] **Step 3: Build web**

Run: `npm run build --workspace=web`
Expected: succeeds; `web/dist/index.html` exists.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/ web/src/App.tsx
git commit -m "feat(web): Dashboard layout wiring all components"
```

---

## Task 23: Dockerfile

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/Dockerfile`

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build --workspace=web
RUN npm run build --workspace=server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/web/dist ./server/dist/public
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
# Image ships a known-good ccusage; runtime updater refreshes it on a schedule.
RUN npm install -g ccusage@latest
ENV PORT=47821
EXPOSE 47821
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:47821/api/health > /dev/null || exit 1
CMD ["node", "server/dist/index.js"]
```

- [ ] **Step 2: Build the image locally**

Run: `cd /Users/sd3/Desktop/project/ccusage-web && docker build -t ccusage-web:dev .`
Expected: image builds; final size around 250–400 MB.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "build: multi-stage Dockerfile with global ccusage"
```

---

## Task 24: docker-compose.yml

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/docker-compose.yml`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  ccusage-web:
    build: .
    image: ccusage-web:latest
    container_name: ccusage-web
    restart: unless-stopped
    ports:
      - "47821:47821"
    environment:
      - PORT=47821
      - POLL_INTERVAL_MS=2000
      - CCUSAGE_TIMEOUT_MS=30000
      - CCUSAGE_AUTO_UPDATE_INTERVAL_MS=86400000
      - TZ=Asia/Shanghai
      - LOG_LEVEL=info
    volumes:
      # Mount whichever agent log dirs you actually use; comment the rest.
      - ${HOME}/.claude:/root/.claude:ro
      - ${HOME}/.codex:/root/.codex:ro
      - ${HOME}/.gemini:/root/.gemini:ro
      - ${HOME}/.config/copilot:/root/.config/copilot:ro
```

- [ ] **Step 2: Smoke test the running container**

Run: `docker compose up -d --build`
Run: `curl -s http://localhost:47821/api/health`
Expected: `{"status":"ok",...}` or `{"status":"degraded",...}` if the first poll hasn't finished. Wait 5s and try again — should be `ok`.

Run: `curl -s http://localhost:47821/api/snapshot | head -c 200`
Expected: JSON beginning with `{"generatedAt":...`.

Open: `http://localhost:47821` in a browser. Expect the dashboard to render with rolling numbers.

Stop: `docker compose down`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "build: docker compose with default env and bind mounts"
```

---

## Task 25: README

**Files:**
- Create: `/Users/sd3/Desktop/project/ccusage-web/README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quickstart, env vars, dev setup"
```

---

## Task 26: Final verification

- [ ] **Step 1: All tests pass**

Run: `npm test`
Expected: every server and web test passes.

- [ ] **Step 2: Production build of both workspaces**

Run: `npm run build`
Expected: `server/dist/index.js` and `web/dist/index.html` exist.

- [ ] **Step 3: Docker build + smoke**

Run: `docker compose up -d --build`
Run: `curl -s http://localhost:47821/api/health`
Expected: status `ok` after first poll completes.

Open `http://localhost:47821` in a browser; verify:
- four metric cards render with rolling numbers
- TrendChart shows daily history
- ModelBreakdown donut populated
- BlocksPanel shows current 5h window
- SessionTable lists sessions
- LiveIndicator pulses green
- clicking Refresh causes numbers to re-animate within ~2s

Stop: `docker compose down`.

- [ ] **Step 4: Final commit (only if there are changes)**

```bash
git status
# only if dirty:
git add -A
git commit -m "chore: verified production build"
```
