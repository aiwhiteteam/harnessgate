import type { ChannelAdapter, ChannelTarget } from "./channel.js";
import type { HarnessGateConfig } from "./config.js";
import type { InboundMessage, OutboundMessage } from "./messages.js";
import type {
  Provider,
  ProviderEvent,
  ProviderEventListener,
  UserResolver,
  ResolvedUser,
} from "./provider.js";
import { SessionMap, buildSessionKey, type SessionMapKey } from "./session-map.js";
import { StreamManager } from "./stream-manager.js";
import { createLogger } from "./logger.js";

const log = createLogger("bridge");

interface ActiveTurn {
  chunks: string[];
  target: ChannelTarget;
  channelId: string;
}

export class Bridge {
  private channels = new Map<string, ChannelAdapter>();
  private provider: Provider;
  private sessionMap = new SessionMap();
  private streamManager = new StreamManager();
  private config: HarnessGateConfig;
  private abortController = new AbortController();
  private pruneInterval?: ReturnType<typeof setInterval>;

  /** Buffer of text chunks per session, flushed on idle. */
  private activeTurns = new Map<SessionMapKey, ActiveTurn>();
  /** External listeners for all provider events (including raw). */
  private eventListeners: ProviderEventListener[] = [];
  /** Optional user resolver for auth and per-user routing. */
  private userResolver?: UserResolver;

  constructor(provider: Provider, config: HarnessGateConfig) {
    this.provider = provider;
    this.config = config;
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
        const channelConfig = this.config.channels[id] ?? {};
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

    // Periodic session pruning
    this.pruneInterval = setInterval(() => {
      const pruned = this.sessionMap.prune(this.config.session.maxIdleMs);
      const destroyPromises = pruned.map((entry) => {
        this.streamManager.stopStream(entry.providerSessionId);
        this.activeTurns.delete(entry.key);
        return this.provider
          .destroySession(entry.providerSessionId)
          .catch(() => {});
      });
      Promise.all(destroyPromises).catch(() => {});
    }, 60_000);

    log.info("Bridge started");
  }

  async stop(): Promise<void> {
    log.info("Stopping bridge...");
    if (this.pruneInterval) clearInterval(this.pruneInterval);
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
    // Resolve user identity if resolver is configured
    let resolvedUser: ResolvedUser | undefined;
    if (this.userResolver) {
      const result = await this.userResolver(msg.sender, msg.channel).catch(
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

    // Build session key — include userId for per-user sessions
    const userId = resolvedUser?.userId ?? msg.sender.id;
    const sessionKey = buildSessionKey(msg.channel, msg.chatType, msg.channelId, userId);
    log.debug(`Inbound from ${sessionKey}: ${msg.text.slice(0, 100)}`);

    let entry = this.sessionMap.get(sessionKey);

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
        this.sessionMap.set(sessionKey, entry);
        log.info(`New session: ${sessionKey} → ${session.id}`);
      } catch (err) {
        log.error(`Failed to create session for ${sessionKey}`, err);
        return;
      }
    }

    this.sessionMap.touch(sessionKey);

    // Ensure stream is active
    this.streamManager.ensureStream(
      entry.providerSessionId,
      this.provider,
      (event) => this.handleProviderEvent(sessionKey, event),
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
    event: ProviderEvent,
  ): Promise<void> {
    // Notify external listeners (for raw/provider-specific event handling)
    const entry = this.sessionMap.get(sessionKey);
    if (!entry) return;

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

  getSessionMap(): SessionMap {
    return this.sessionMap;
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
