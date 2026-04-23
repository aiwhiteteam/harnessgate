import { describe, it, expect } from "vitest";
import { StreamManager } from "./stream-manager.js";
import type { Provider, ProviderEvent } from "./provider.js";

function makeMockProvider(events: ProviderEvent[]): Provider {
  return {
    id: "mock",
    capabilities: {
      interrupt: false,
      toolConfirmation: false,
      customTools: false,
      thinking: false,
    },
    async createSession() {
      return { id: "s1", status: "idle" as const, createdAt: Date.now() };
    },
    async sendMessage() {},
    async *stream(_sessionId: string, signal: AbortSignal) {
      for (const event of events) {
        if (signal.aborted) break;
        yield event;
      }
    },
    async destroySession() {},
  };
}

describe("StreamManager", () => {
  it("starts a stream and delivers events", async () => {
    const manager = new StreamManager();
    const provider = makeMockProvider([
      { type: "message", text: "hello" },
      { type: "status", status: "idle" },
    ]);

    const received: ProviderEvent[] = [];
    manager.ensureStream("s1", provider, (event) => received.push(event));

    // Wait for stream to process
    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]).toEqual({ type: "message", text: "hello" });
    manager.stopAll();
  });

  it("ensureStream is idempotent", () => {
    const manager = new StreamManager();
    const provider = makeMockProvider([]);

    manager.ensureStream("s1", provider, () => {});
    manager.ensureStream("s1", provider, () => {}); // should not create second stream

    expect(manager.activeCount).toBe(1);
    manager.stopAll();
  });

  it("stopStream removes a specific stream", () => {
    const manager = new StreamManager();
    const provider = makeMockProvider([]);

    manager.ensureStream("s1", provider, () => {});
    expect(manager.isActive("s1")).toBe(true);

    manager.stopStream("s1");
    expect(manager.isActive("s1")).toBe(false);
  });

  it("stopAll clears all streams", () => {
    const manager = new StreamManager();
    const provider = makeMockProvider([]);

    manager.ensureStream("s1", provider, () => {});
    manager.ensureStream("s2", provider, () => {});
    expect(manager.activeCount).toBe(2);

    manager.stopAll();
    expect(manager.activeCount).toBe(0);
  });
});
