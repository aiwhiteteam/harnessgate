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
  PlatformAdapter,
  MultiInstanceAdapter,
  PlatformContext,
  ChannelTarget,
  PlatformCapabilities,
  SendResult,
} from "./platform.js";
export { isMultiInstance } from "./platform.js";

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
