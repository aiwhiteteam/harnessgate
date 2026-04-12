import type { Provider, ProviderEvent } from "./provider.js";
import { createLogger } from "./logger.js";

const log = createLogger("stream-manager");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class StreamManager {
  private activeStreams = new Map<string, AbortController>();
  private maxRetries: number;

  constructor(opts?: { maxRetries?: number }) {
    this.maxRetries = opts?.maxRetries ?? 10;
  }

  /** Ensure a stream is running for a session. Idempotent. */
  ensureStream(
    sessionId: string,
    provider: Provider,
    onEvent: (event: ProviderEvent) => void,
  ): void {
    if (this.activeStreams.has(sessionId)) return;

    const controller = new AbortController();
    this.activeStreams.set(sessionId, controller);

    this.runStream(sessionId, provider, controller.signal, onEvent).catch(
      (err) => {
        log.error(`Stream loop exited unexpectedly: ${sessionId}`, err);
        this.activeStreams.delete(sessionId);
      },
    );
  }

  private async runStream(
    sessionId: string,
    provider: Provider,
    signal: AbortSignal,
    onEvent: (event: ProviderEvent) => void,
  ): Promise<void> {
    const seenEvents = new Set<string>();
    let retryCount = 0;

    while (!signal.aborted && retryCount < this.maxRetries) {
      try {
        log.debug(`Opening stream for session ${sessionId}`);
        for await (const event of provider.stream(sessionId, signal)) {
          retryCount = 0;

          // Deduplicate by eventId if present
          const eventId = (event as { eventId?: string }).eventId;
          if (eventId) {
            if (seenEvents.has(eventId)) continue;
            seenEvents.add(eventId);
            // Prevent unbounded growth
            if (seenEvents.size > 10000) {
              const iter = seenEvents.values();
              for (let i = 0; i < 5000; i++) {
                const v = iter.next();
                if (v.done) break;
                seenEvents.delete(v.value);
              }
            }
          }

          onEvent(event);
        }
        // Stream ended cleanly
        break;
      } catch (err) {
        if (signal.aborted) break;
        retryCount++;
        const delay = Math.min(1000 * 2 ** retryCount, 30_000);
        log.warn(
          `Stream error for ${sessionId}, retry ${retryCount}/${this.maxRetries} in ${delay}ms`,
          err,
        );
        await sleep(delay);
      }
    }

    this.activeStreams.delete(sessionId);
    log.debug(`Stream ended for session ${sessionId}`);
  }

  /** Stop stream for a session. */
  stopStream(sessionId: string): void {
    const controller = this.activeStreams.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(sessionId);
    }
  }

  /** Stop all streams. */
  stopAll(): void {
    for (const controller of this.activeStreams.values()) {
      controller.abort();
    }
    this.activeStreams.clear();
    log.info("All streams stopped");
  }

  /** Check if a stream is active. */
  isActive(sessionId: string): boolean {
    return this.activeStreams.has(sessionId);
  }

  get activeCount(): number {
    return this.activeStreams.size;
  }
}
