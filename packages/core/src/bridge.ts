import type { ChannelAdapter, ChannelTarget } from "./channel.js";
import type { InboundMessage, OutboundMessage } from "./messages.js";
import type {
  Provider,
  ProviderEvent,
  ProviderEventListener,
  UserResolver,
  ResolvedUser,
} from "./provider.js";
import { MemorySessionStore, buildSessionKey, type SessionStore, type SessionMapKey } from "./session-map.js";
import { StreamManager } from "./stream-manager.js";
import { createLogger } from "./logger.js";

const log = createLogger("bridge");

/** Configuration passed to the Bridge constructor. */
export interface BridgeConfig {
  /** Provider config — passed through to provider.createSession() as providerConfig. */
  provider: Record<string, unknown>;
  /** Per-channel config — keyed by channel id, passed to channel.start(). */
  channels?: Record<string, Record<string, unknown>>;
}

interface ActiveTurn {
  chunks: string[];
  target: ChannelTarget;
  channelId: string;
}

export class Bridge {
  private channels = new Map<string, ChannelAdapter>();
  private provider: Provider;
  private sessionStore: SessionStore;
  private streamManager = new StreamManager();
  private config: BridgeConfig;
  private abortController = new AbortController();

  /** Buffer of text chunks per session, flushed on idle. */
  private activeTurns = new Map<SessionMapKey, ActiveTurn>();
  /** External listeners for all provider events (including raw). */
  private eventListeners: ProviderEventListener[] = [];
  /** Optional user resolver for auth and per-user routing. */
  private userResolver?: UserResolver;

  constructor(provider: Provider, config?: BridgeConfig) {
    this.provider = provider;
    this.config = config ?? { provider: {} };
    this.sessionStore = new MemorySessionStore();
  }

  /** Swap the session store (SQLite, Postgres, Redis, etc.). */
  setSessionStore(store: SessionStore): void {
    this.sessionStore = store;
  }

  addChannel(adapter: ChannelAdapter): void {
    this.channels.set(adapter.id, adapter);
  }

  /** Register a listener for all provider events (including raw/provider-specific). */
  onEvent(listener: ProviderEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Set a user resolver for auth and per-user agent routing.
   * Called before session creation. Return null to reject the user.
   */
  setUserResolver(resolver: UserResolver): void {
    this.userResolver = resolver;
  }

  async start(): Promise<void> {
    log.info(
      `Starting bridge with provider "${this.provider.id}" and ${this.channels.size} channel(s)`,
    );

    // Start all channels
    const startPromises = Array.from(this.channels.entries()).map(
      ([id, adapter]) => {
        const channelConfig = this.config.channels?.[id] ?? {};
        return adapter
          .start({
            onMessage: (msg) => this.handleInbound(msg),
            onError: (err) =>
              log.error(`Channel ${id} error: ${err.message}`),
            config: channelConfig,
            signal: this.abortController.signal,
          })
          .then(() => log.info(`Channel started: ${id}`))
          .catch((err) =>
            log.error(`Failed to start channel ${id}: ${err.message}`),
          );
      },
    );

    await Promise.all(startPromises);

    log.info("Bridge started");
  }

  async stop(): Promise<void> {
    log.info("Stopping bridge...");
    this.abortController.abort();
    this.streamManager.stopAll();

    const stopPromises = Array.from(this.channels.values()).map((adapter) =>
      adapter.stop().catch((err) =>
        log.error(`Error stopping channel ${adapter.id}: ${err.message}`),
      ),
    );
    await Promise.all(stopPromises);

    log.info("Bridge stopped");
  }

  private async handleInbound(msg: InboundMessage): Promise<void> {
    // Resolve user identity + agent routing
    let resolvedUser: ResolvedUser | undefined;
    if (this.userResolver) {
      const result = await this.userResolver(msg.sender, msg.channel, msg).catch(
        (err) => {
          log.error(`User resolver error for ${msg.sender.id}`, err);
          return null;
        },
      );
      if (!result) {
        log.debug(`User rejected: ${msg.channel}:${msg.sender.id}`);
        return;
      }
      resolvedUser = result;
    }

    // Build session key with correct scoping per chat type:
    // - DM: per-user session (each user has their own context)
    // - Group/Channel: shared session (everyone shares one context)
    // - Thread: per-thread session (each thread is its own context)
    const userId = resolvedUser?.userId ?? msg.sender.id;
    const agentId = resolvedUser?.agentId;
    const sessionId = resolvedUser?.sessionId;
    const isDirect = msg.chatType === "direct";
    const isThread = msg.chatType === "thread";
    const sessionKey = buildSessionKey({
      channel: msg.channel,
      chatType: msg.chatType,
      channelId: msg.channelId,
      userId: isDirect ? userId : undefined,
      threadId: isThread ? msg.threadId : undefined,
      agentId,
      sessionId,
    });
    log.debug(`Inbound from ${sessionKey}: ${msg.text.slice(0, 100)}`);

    let entry = await this.sessionStore.get(sessionKey);

    // Create session if needed
    if (!entry) {
      try {
        // Build provider config, applying per-user overrides
        const providerConfig = { ...this.config.provider };
        if (resolvedUser?.agentId) {
          providerConfig.agentId = resolvedUser.agentId;
        }
        if (resolvedUser?.environmentId) {
          providerConfig.environmentId = resolvedUser.environmentId;
        }

        const session = await this.provider.createSession({
          providerConfig,
          sender: msg.sender,
          userId: resolvedUser?.userId,
          extra: resolvedUser?.metadata,
        });

        entry = {
          key: sessionKey,
          providerSessionId: session.id,
          channel: msg.channel,
          channelId: msg.channelId,
          threadId: msg.threadId,
          userId,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        };
        await this.sessionStore.set(sessionKey, entry);
        log.info(`New session: ${sessionKey} → ${session.id}`);
      } catch (err) {
        log.error(`Failed to create session for ${sessionKey}`, err);
        return;
      }
    }

    await this.sessionStore.touch(sessionKey);

    // Ensure stream is active — pass cached entry to avoid DB reads per event
    const cachedEntry = entry;
    this.streamManager.ensureStream(
      entry.providerSessionId,
      this.provider,
      (event) => this.handleProviderEvent(sessionKey, cachedEntry, event),
    );

    // Send typing indicator
    const channel = this.channels.get(msg.channel);
    if (channel?.sendTyping) {
      const target: ChannelTarget = {
        channelId: msg.channelId,
        threadId: msg.threadId,
      };
      channel.sendTyping(target).catch(() => {});
    }

    // Send message to provider
    try {
      await this.provider.sendMessage(entry.providerSessionId, {
        text: msg.text,
        attachments: msg.attachments,
      });
    } catch (err) {
      log.error(`Failed to send message to provider for ${sessionKey}`, err);
    }
  }

  private async handleProviderEvent(
    sessionKey: SessionMapKey,
    entry: import("./session-map.js").SessionEntry,
    event: ProviderEvent,
  ): Promise<void> {

    for (const listener of this.eventListeners) {
      try {
        listener(entry.providerSessionId, event);
      } catch (err) {
        log.error("Event listener error", err);
      }
    }

    const channel = this.channels.get(entry.channel);
    if (!channel) return;

    const target: ChannelTarget = {
      channelId: entry.channelId,
      threadId: entry.threadId,
    };

    switch (event.type) {
      case "message": {
        // Buffer text, flush on idle
        let turn = this.activeTurns.get(sessionKey);
        if (!turn) {
          turn = { chunks: [], target, channelId: entry.channel };
          this.activeTurns.set(sessionKey, turn);
        }
        turn.chunks.push(event.text);
        break;
      }

      case "status": {
        if (event.status === "idle") {
          // Flush buffered message
          await this.flushTurn(sessionKey, channel, target);
        } else if (event.status === "running") {
          // Send typing indicator
          if (channel.sendTyping) {
            channel.sendTyping(target).catch(() => {});
          }
        }
        break;
      }

      case "error": {
        // Flush any partial response before sending error
        await this.flushTurn(sessionKey, channel, target);
        const errorMsg: OutboundMessage = {
          text: `Error: ${event.message}`,
        };
        await channel.send(target, errorMsg).catch(() => {});
        break;
      }

      // raw, tool_use, thinking — no bridge action, already forwarded to listeners
      default:
        break;
    }
  }

  private async flushTurn(
    sessionKey: SessionMapKey,
    channel: ChannelAdapter,
    target: ChannelTarget,
  ): Promise<void> {
    const turn = this.activeTurns.get(sessionKey);
    if (!turn || turn.chunks.length === 0) return;

    const fullText = turn.chunks.join("");
    this.activeTurns.delete(sessionKey);

    if (!fullText.trim()) return;

    // Split by channel's max text length
    const maxLen = channel.capabilities.maxTextLength;
    const parts = splitText(fullText, maxLen);

    for (const part of parts) {
      try {
        await channel.send(target, { text: part });
      } catch (err) {
        log.error(`Failed to send to ${channel.id}`, err);
      }
    }
  }

  getSessionStore(): SessionStore {
    return this.sessionStore;
  }
}

export function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= 0) {
      // Fall back to space
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt <= 0) {
      // Hard split
      splitAt = maxLen;
    }

    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return parts;
}
