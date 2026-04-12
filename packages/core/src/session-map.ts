import { createLogger } from "./logger.js";

const log = createLogger("session-map");

export type SessionMapKey = string;

export function buildSessionKey(
  channel: string,
  chatType: string,
  channelId: string,
  userId?: string,
): SessionMapKey {
  const base = `${channel}:${chatType}:${channelId}`;
  return userId ? `${base}:${userId}` : base;
}

export interface SessionEntry {
  key: SessionMapKey;
  providerSessionId: string;
  channel: string;
  channelId: string;
  threadId?: string;
  userId?: string;
  createdAt: number;
  lastActiveAt: number;
}

export class SessionMap {
  private sessions = new Map<SessionMapKey, SessionEntry>();

  get(key: SessionMapKey): SessionEntry | undefined {
    return this.sessions.get(key);
  }

  set(key: SessionMapKey, entry: SessionEntry): void {
    this.sessions.set(key, entry);
    log.debug(`Session mapped: ${key} → ${entry.providerSessionId}`);
  }

  delete(key: SessionMapKey): boolean {
    return this.sessions.delete(key);
  }

  findByProviderSession(providerSessionId: string): SessionEntry | undefined {
    for (const entry of this.sessions.values()) {
      if (entry.providerSessionId === providerSessionId) return entry;
    }
    return undefined;
  }

  touch(key: SessionMapKey): void {
    const entry = this.sessions.get(key);
    if (entry) {
      entry.lastActiveAt = Date.now();
    }
  }

  list(): SessionEntry[] {
    return Array.from(this.sessions.values());
  }

  /** Remove sessions idle longer than maxIdleMs. Returns pruned entries. */
  prune(maxIdleMs: number): SessionEntry[] {
    const now = Date.now();
    const pruned: SessionEntry[] = [];
    for (const [key, entry] of this.sessions) {
      if (now - entry.lastActiveAt > maxIdleMs) {
        this.sessions.delete(key);
        pruned.push(entry);
      }
    }
    if (pruned.length > 0) {
      log.info(`Pruned ${pruned.length} idle sessions`);
    }
    return pruned;
  }

  get size(): number {
    return this.sessions.size;
  }
}
