import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom doesn't ship ResizeObserver; recharts ResponsiveContainer and our
// virtualized SessionTableV1 both rely on it.
class ResizeObserverPolyfill {
  observe(): void { /* no-op */ }
  unobserve(): void { /* no-op */ }
  disconnect(): void { /* no-op */ }
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver = ResizeObserverPolyfill;
}

// jsdom doesn't ship EventSource either; both Dashboard variants instantiate
// one on mount via lib/sse.ts. A no-op constructor lets tests render the
// dashboards without touching network or scheduling fake events.
class EventSourcePolyfill {
  url: string;
  readyState = 0;
  withCredentials = false;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(url: string) { this.url = url; }
  addEventListener(): void { /* no-op */ }
  removeEventListener(): void { /* no-op */ }
  close(): void { /* no-op */ }
}
if (typeof (globalThis as { EventSource?: unknown }).EventSource === "undefined") {
  (globalThis as unknown as { EventSource: typeof EventSourcePolyfill }).EventSource = EventSourcePolyfill;
}

// jsdom's fetch is also absent — both dashboards call fetchSnapshot() on
// mount. Stub to a never-resolving promise so the .then handler doesn't
// fire during the test render cycle.
if (typeof (globalThis as { fetch?: unknown }).fetch === "undefined") {
  (globalThis as unknown as { fetch: () => Promise<Response> }).fetch =
    () => new Promise<Response>(() => { /* never resolves */ });
}

// Defensive localStorage shim — jsdom *does* ship Storage, but some test
// orderings can leave it in a partial state when modules mutate
// window/global. Install a memory-backed fallback when missing.
type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  clear(): void;
  readonly length: number;
  key(i: number): string | null;
};

function makeMemoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    get length(): number { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
  };
}

function ensureStorage(): void {
  if (typeof window === "undefined") return;
  const ls = (window as unknown as { localStorage?: StorageLike }).localStorage;
  if (!ls || typeof ls.getItem !== "function") {
    Object.defineProperty(window, "localStorage", { value: makeMemoryStorage(), configurable: true });
  }
}
ensureStorage();

afterEach(() => {
  cleanup();
  // Reset between tests so localStorage state doesn't leak.
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
