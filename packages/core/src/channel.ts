import type { InboundMessage, OutboundMessage } from "./messages.js";

export interface ChannelTarget {
  channelId: string;
  threadId?: string;
  replyToId?: string;
}

export interface SendResult {
  messageId?: string;
  success: boolean;
  error?: string;
}

export interface ChannelCapabilities {
  maxTextLength: number;
  supportsMarkdown: boolean;
  supportsThreads: boolean;
  supportsTypingIndicator: boolean;
  supportsAttachments: boolean;
}

export interface ChannelContext {
  onMessage: (msg: InboundMessage) => void;
  onError: (err: Error) => void;
  config: Record<string, unknown>;
  signal: AbortSignal;
}

export interface ChannelAdapter {
  readonly id: string;

  /** Channel capabilities for message formatting. */
  readonly capabilities: ChannelCapabilities;

  /** Start listening for inbound messages. */
  start(ctx: ChannelContext): Promise<void>;

  /** Stop the channel listener. */
  stop(): Promise<void>;

  /** Send a message to the channel. */
  send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult>;

  /** Send typing indicator. */
  sendTyping?(target: ChannelTarget): Promise<void>;
}
