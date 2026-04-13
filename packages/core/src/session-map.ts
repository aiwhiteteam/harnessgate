import { createLogger } from "./logger.js";

const log = createLogger("session-map");

export type SessionMapKey = string;

export function buildSessionKey(opts: {
  channel: string;
  chatType: string;
  channelId: string;
  threadId?: string;
  userId?: string;
  agentId?: string;
  sessionId?: string;
}): SessionMapKey {
  const parts = [opts.channel, opts.chatType, opts.channelId];
  if (opts.threadId) parts.push(`t:${opts.threadId}`);
  if (opts.userId) parts.push(`u:${opts.userId}`);
  if (opts.agentId) parts.push(`a:${opts.agentId}`);
  if (opts.sessionId) parts.push(`s:${opts.sessionId}`);
  return parts.join(":");
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

/**
 * Interface for session persistence.
 * Implement this to swap in your own database (Postgres, Redis, etc.).
 */
export interface SessionStore {
  get(key: SessionMapKey): Promise<SessionEntry | null>;
  set(key: SessionMapKey, entry: SessionEntry): Promise<void>;
  delete(key: SessionMapKey): Promise<boolean>;
  touch(key: SessionMapKey): Promise<void>;
}

/**
 * In-memory session store. Default for development.
 * Sessions are lost on restart.
 */
export class MemorySessionStore implements SessionStore {
  private sessions = new Map<SessionMapKey, SessionEntry>();

  async get(key: SessionMapKey): Promise<SessionEntry | null> {
    return this.sessions.get(key) ?? null;
  }

  async set(key: SessionMapKey, entry: SessionEntry): Promise<void> {
    this.sessions.set(key, entry);
    log.debug(`Session mapped: ${key} → ${entry.providerSessionId}`);
  }

  async delete(key: SessionMapKey): Promise<boolean> {
    return this.sessions.delete(key);
  }

  async touch(key: SessionMapKey): Promise<void> {
    const entry = this.sessions.get(key);
    if (entry) {
      entry.lastActiveAt = Date.now();
    }
  }
}
