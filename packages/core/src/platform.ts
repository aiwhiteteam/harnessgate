import type { InboundMessage, OutboundMessage } from "./messages.js";

export interface ChannelTarget {
  channelId: string;
  threadId?: string;
  replyToId?: string;
  /** Platform-assigned app/bot ID for multi-instance adapters. Routes send() to the right bot instance. */
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

  /** Start listening for inbound messages. */
  start(ctx: PlatformContext): Promise<void>;

  /** Stop the platform listener. */
  stop(): Promise<void>;

  /** Send a message to the platform. */
  send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult>;

  /** Send typing indicator. */
  sendTyping?(target: ChannelTarget): Promise<void>;
}

/**
 * A platform adapter that supports running multiple bot/app instances
 * concurrently under different credentials.
 *
 * Adapters implementing this can be used for multi-tenant scenarios.
 * The bridge calls addBot/removeBot instead of start() when this
 * interface is detected.
 */
export interface MultiInstanceAdapter extends PlatformAdapter {
  /** Add and start a bot/app instance. The appId is resolved from the platform after connecting. */
  addBot(config: Record<string, unknown>, ctx: PlatformContext): Promise<string>;
  /** Stop and remove a bot/app instance by its platform-assigned appId. */
  removeBot(appId: string): Promise<void>;
  /** List currently active appIds. */
  activeBots(): string[];
}

/** Type guard for multi-instance capable adapters. */
export function isMultiInstance(adapter: PlatformAdapter): adapter is MultiInstanceAdapter {
  return "addBot" in adapter && "removeBot" in adapter;
}
