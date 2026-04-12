export type {
  Provider,
  ProviderCapabilities,
  CreateSessionOpts,
  ProviderSession,
  ProviderEvent,
  ProviderEventListener,
  ResolvedUser,
  UserResolver,
  SessionStatus,
} from "./provider.js";

export type {
  ChannelAdapter,
  ChannelContext,
  ChannelTarget,
  ChannelCapabilities,
  SendResult,
} from "./channel.js";

export type {
  InboundMessage,
  OutboundMessage,
  MessagePayload,
  Attachment,
  Sender,
} from "./messages.js";

export {
  SessionMap,
  buildSessionKey,
  type SessionEntry,
  type SessionMapKey,
} from "./session-map.js";

export { StreamManager } from "./stream-manager.js";
export { Bridge } from "./bridge.js";
export { loadConfig, getEnabledChannels, getLogLevel, type HarnessGateConfig } from "./config.js";
export { createLogger, setLogLevel, type LogLevel } from "./logger.js";
export { createWebhookResolver } from "./webhook-resolver.js";
