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
