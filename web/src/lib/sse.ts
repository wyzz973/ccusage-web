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
