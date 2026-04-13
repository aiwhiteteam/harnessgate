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
  MemorySessionStore,
  buildSessionKey,
  type SessionStore,
  type SessionEntry,
  type SessionMapKey,
} from "./session-map.js";
export { SqliteSessionStore } from "./sqlite-session-store.js";

export { StreamManager } from "./stream-manager.js";
export { Bridge, type BridgeConfig } from "./bridge.js";
export { createLogger, setLogLevel, type LogLevel } from "./logger.js";
