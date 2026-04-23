import type { SessionStore, SessionEntry, SessionMapKey } from "./session-map.js";
import { createLogger } from "./logger.js";

const log = createLogger("sqlite-session-store");

/**
 * SQLite-backed session store. Default for production.
 * Sessions survive restarts.
 *
 * Uses better-sqlite3 which must be installed separately:
 *   npm install better-sqlite3
 */
export class SqliteSessionStore implements SessionStore {
  private db: import("better-sqlite3").Database;
  private stmts: {
    get: import("better-sqlite3").Statement;
    set: import("better-sqlite3").Statement;
    delete: import("better-sqlite3").Statement;
    touch: import("better-sqlite3").Statement;
  };

  constructor(dbPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    this.db = new Database(dbPath);

    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        key TEXT PRIMARY KEY,
        provider_session_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        user_id TEXT,
        app_id TEXT,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      )
    `);

    this.stmts = {
      get: this.db.prepare("SELECT * FROM sessions WHERE key = ?"),
      set: this.db.prepare(`
        INSERT OR REPLACE INTO sessions (key, provider_session_id, platform, channel_id, thread_id, user_id, app_id, created_at, last_active_at)
        VALUES (@key, @providerSessionId, @platform, @channelId, @threadId, @userId, @appId, @createdAt, @lastActiveAt)
      `),
      delete: this.db.prepare("DELETE FROM sessions WHERE key = ?"),
      touch: this.db.prepare("UPDATE sessions SET last_active_at = ? WHERE key = ?"),
    };

    const count = (this.db.prepare("SELECT COUNT(*) as count FROM sessions").get() as { count: number }).count;
    log.info(`SQLite session store opened: ${dbPath} (${count} sessions)`);
  }

  async get(key: SessionMapKey): Promise<SessionEntry | null> {
    const row = this.stmts.get.get(key) as SessionRow | undefined;
    return row ? rowToEntry(row) : null;
  }

  async set(key: SessionMapKey, entry: SessionEntry): Promise<void> {
    this.stmts.set.run({
      key,
      providerSessionId: entry.providerSessionId,
      platform: entry.platform,
      channelId: entry.channelId,
      threadId: entry.threadId ?? null,
      userId: entry.userId ?? null,
      appId: entry.appId ?? null,
      createdAt: entry.createdAt,
      lastActiveAt: entry.lastActiveAt,
    });
    log.debug(`Session stored: ${key} → ${entry.providerSessionId}`);
  }

  async delete(key: SessionMapKey): Promise<boolean> {
    const result = this.stmts.delete.run(key);
    return result.changes > 0;
  }

  async touch(key: SessionMapKey): Promise<void> {
    this.stmts.touch.run(Date.now(), key);
  }

  close(): void {
    this.db.close();
  }
}

interface SessionRow {
  key: string;
  provider_session_id: string;
  platform: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string | null;
  app_id: string | null;
  created_at: number;
  last_active_at: number;
}

function rowToEntry(row: SessionRow): SessionEntry {
  return {
    key: row.key,
    providerSessionId: row.provider_session_id,
    platform: row.platform,
    channelId: row.channel_id,
    threadId: row.thread_id ?? undefined,
    userId: row.user_id ?? undefined,
    appId: row.app_id ?? undefined,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}
