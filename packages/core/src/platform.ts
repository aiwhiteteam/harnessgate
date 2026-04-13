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

  /** Start listening for inbound messages (single-app mode). */
  start(ctx: PlatformContext): Promise<void>;

  /** Stop all app instances. */
  stop(): Promise<void>;

  /** Send a message to the platform. */
  send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult>;

  /** Send typing indicator. */
  sendTyping?(target: ChannelTarget): Promise<void>;

  /** Add and start an app instance. Returns the platform-assigned appId after connecting. */
  addApp?(config: Record<string, unknown>, ctx: PlatformContext): Promise<string>;

  /** Stop and remove an app instance by its platform-assigned appId. */
  removeApp?(appId: string): Promise<void>;

  /** List currently active appIds. */
  activeApps?(): string[];
}
