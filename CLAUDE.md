# CLAUDE.md — HarnessGate

## What is this project

HarnessGate is a universal gateway that connects AI agent harness runtimes (Claude Managed Agents, any HTTP server, custom providers) to messaging platforms (Telegram, Discord, Slack, WhatsApp, Teams, Web UI).

## Architecture

```
Platforms (inbound)  →  Bridge (orchestrator)  →  Provider (outbound to agent runtime)
                        SessionMap + StreamManager
```

- **Provider** (`src/provider.ts`) — interface for agent runtimes. Required methods: `createSession`, `sendMessage`, `stream`, `destroySession`. Optional (capability-gated): `interrupt`, `confirmTool`, `submitToolResult`.
- **PlatformAdapter** (`src/platform.ts`) — interface for messaging platforms. Required: `start`, `stop`, `send`. Optional: `sendTyping`, `connect`, `disconnect`, `activeConnections`.
- **Bridge** (`src/bridge.ts`) — orchestrator connecting platforms to providers. Manages session mapping, stream lifecycle, message buffering, and text splitting. Supports `connect(platform, credentials)` and `disconnect(platform, appId)` for dynamic connection management.
- **SessionStore** (`src/session-map.ts`) — interface for session persistence. Maps session keys to provider session IDs. Built-in: `MemorySessionStore` (dev), `SqliteSessionStore` (production default). Swappable via `bridge.setSessionStore()`.
- **StreamManager** (`src/stream-manager.ts`) — maintains one SSE stream per active session with reconnection and event deduplication.

### Platform adapters

| Adapter | File | Library | Max text |
|---------|------|---------|----------|
| Telegram | `src/platforms/telegram-adapter.ts` | grammY | 4096 |
| Discord | `src/platforms/discord-adapter.ts` | discord.js | 2000 |
| Slack | `src/platforms/slack-adapter.ts` | @slack/bolt | 4000 |
| WhatsApp | `src/platforms/whatsapp-adapter.ts` | Cloud API (fetch) | 4096 |
| Teams | `src/platforms/teams-adapter.ts` | botbuilder | 28000 |
| Web | `src/platforms/web-adapter.ts` | Built-in HTTP | 100000 |

## Session scoping

One conversation context = one Claude session (not one agent — agent is a template).

- **DM**: per-user session → key includes `u:userId`
- **Group/Channel**: shared session → key is just `platform:group:channelId`
- **Thread**: per-thread session → key includes `t:threadId`
- Optional: `app:appId` for multi-bot, `a:agentId` and `s:sessionId` for multi-agent and multi-conversation routing

Session key format: `platform:chatType:channelId[:app:appId][:t:threadId][:u:userId][:a:agentId][:s:sessionId]`

## Multi-instance / appId

- **appId** — platform-assigned bot/app identity. Opaque to core.
- `PlatformAdapter` has optional `connect()`/`disconnect()`/`activeConnections()` methods for opening multiple live connections per adapter. Each connection gets its own `appId` after connecting. App records (credentials + agent routing) live in the developer's own DB — the adapter only manages the live connection.
- `InboundMessage.appId` carries the bot identity on every incoming message.
- `ChannelTarget.appId` routes outbound messages to the correct bot instance.
- No BotRegistry — `UserResolver` handles auth and bot→agent routing using `message.appId`.

### appId per platform

| Platform | Source | Example value |
|----------|--------|---------------|
| Telegram | `bot.botInfo.id` | `"123456789"` |
| Discord | `client.application.id` | `"1098765432101234567"` |
| Slack | `event.api_app_id` | `"A0123456789"` |
| WhatsApp | WABA phone number ID | `"106540352267890"` |
| Teams | `activity.recipient.id` | `"28:abc123..."` |
| Web | N/A (single instance) | — |

## Project layout

```
src/
├── index.ts                # Barrel exports
├── bridge.ts               # Orchestrator
├── messages.ts             # InboundMessage, OutboundMessage, ChannelTarget
├── platform.ts             # PlatformAdapter interface
├── provider.ts             # Provider interface
├── session-map.ts          # SessionStore (Memory + SQLite)
├── stream-manager.ts       # SSE stream lifecycle
├── platforms/              # 6 platform adapters
│   ├── index.ts
│   ├── telegram-adapter.ts
│   ├── discord-adapter.ts
│   ├── slack-adapter.ts
│   ├── whatsapp-adapter.ts
│   ├── teams-adapter.ts
│   └── web-adapter.ts
└── providers/              # Agent runtime backends
    ├── index.ts
    ├── claude-provider.ts
    └── http-provider.ts
docs/                       # Platform setup guides (one per platform)
examples/                   # Starter projects
```

## Provider types

- `claude` — Claude Managed Agents API (REST + SSE). Full feature support including tool confirmation, custom tools, thinking, multi-agent threads.
- `http` — Generic HTTP provider. Connects to any server with REST + SSE endpoints. No code needed, just config.
- External — any npm package or local `.js` file that default-exports a class implementing `Provider`.

## Key design decisions

- **Buffer-then-send**: agent message events are buffered until `session.status_idle`, then flushed as one message. Avoids rapid-fire messages.
- **Raw event passthrough**: provider-specific events that don't map to the universal `ProviderEvent` union are emitted as `{ type: "raw", eventType, data }`. Bridge forwards them to `onEvent()` listeners.
- **Provider capabilities**: optional methods (`interrupt`, `confirmTool`, `submitToolResult`) are gated by a `capabilities` object. Bridge checks capabilities before calling.
- **Generic providerConfig**: `CreateSessionOpts.providerConfig` is `Record<string, unknown>`. Each provider extracts its own fields (Claude: `agentId`/`environmentId`, HTTP: `baseUrl`).
- **User identity**: `UserResolver` hook resolves platform sender → internal user. Receives full `InboundMessage` (including `appId`) for routing context. Per-user agent/environment overrides.
- **Session persistence**: SQLite default via `SqliteSessionStore` (WAL mode, prepared statements). Falls back to `MemorySessionStore`. Swappable via `bridge.setSessionStore()`.
- **Platform naming**: "Platform" = the messaging service (Telegram, Discord, etc.). "Channel" = a conversation target within a platform (e.g., a Slack channel). `ChannelTarget` is kept because it targets a conversation, not a platform.

## Build, test & run

```bash
pnpm install
pnpm build
pnpm test           # unit tests (vitest)
```

## Conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- Kebab-case file names, PascalCase classes/interfaces, camelCase functions
- `export type` for type-only exports in barrel files
- Tests co-located with source: `*.test.ts` next to `*.ts`
- Platform adapters: `src/platforms/{name}-adapter.ts`
- Normalize tests: `src/platforms/{name}-normalize.test.ts`
- Examples in `examples/` directory
- Build system: pnpm, vitest for tests
