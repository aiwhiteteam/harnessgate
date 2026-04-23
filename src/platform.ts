import type { InboundMessage, OutboundMessage } from "./messages.js";

export interface ChannelTarget {
  channelId: string;
  threadId?: string;
  replyToId?: string;
  /** Platform-assigned app ID for routing send() to the correct app instance. */
  appId?: string;
}

export interface SendResult {
  messageId?: string;
  success: boolean;
  error?: string;
}

export interface PlatformCapabilities {
  maxTextLength: number;
  supportsMarkdown: boolean;
  supportsThreads: boolean;
  supportsTypingIndicator: boolean;
  supportsAttachments: boolean;
}

export interface PlatformContext {
  onMessage: (msg: InboundMessage) => void;
  onError: (err: Error) => void;
  config: Record<string, unknown>;
  signal: AbortSignal;
}

export interface PlatformAdapter {
  readonly id: string;

  /** Platform capabilities for message formatting. */
  readonly capabilities: PlatformCapabilities;

  /** Start listening for inbound messages (single-connection mode). */
  start(ctx: PlatformContext): Promise<void>;

  /** Stop all active connections. */
  stop(): Promise<void>;

  /** Send a message to the platform. */
  send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult>;

  /** Send typing indicator. */
  sendTyping?(target: ChannelTarget): Promise<void>;

  /** Open a new connection with the given credentials. Returns the platform-assigned appId. */
  connect?(credentials: Record<string, unknown>, ctx: PlatformContext): Promise<string>;

  /** Close a connection by its platform-assigned appId. */
  disconnect?(appId: string): Promise<void>;

  /** List appIds of currently active connections. */
  activeConnections?(): string[];
}
