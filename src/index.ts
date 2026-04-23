// Core
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
  ToolExecutor,
} from "./provider.js";

export type {
  PlatformAdapter,
  PlatformContext,
  ChannelTarget,
  PlatformCapabilities,
  SendResult,
} from "./platform.js";

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

// Providers
export { ClaudeProvider } from "./providers/claude-provider.js";
export { HttpProvider } from "./providers/http-provider.js";

// Platforms
export { TelegramAdapter } from "./platforms/telegram-adapter.js";
export { DiscordAdapter } from "./platforms/discord-adapter.js";
export { SlackAdapter } from "./platforms/slack-adapter.js";
export { WebAdapter } from "./platforms/web-adapter.js";
export { WhatsAppAdapter } from "./platforms/whatsapp-adapter.js";
export { TeamsAdapter } from "./platforms/teams-adapter.js";
