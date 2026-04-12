# CLAUDE.md — HarnessGate

## What is this project

HarnessGate is a universal gateway that connects AI agent harness runtimes (Claude Managed Agents, any HTTP server, custom providers) to messaging platforms (Telegram, Discord, Slack, WhatsApp, Web UI, etc.).

## Architecture

```
Channels (inbound)  →  Bridge (orchestrator)  →  Provider (outbound to agent runtime)
                        SessionMap + StreamManager
```

- **Provider** (`packages/core/src/provider.ts`) — interface for agent runtimes. Required methods: `createSession`, `sendMessage`, `stream`, `destroySession`. Optional (capability-gated): `interrupt`, `confirmTool`, `submitToolResult`.
- **ChannelAdapter** (`packages/core/src/channel.ts`) — interface for messaging platforms. Required: `start`, `stop`, `send`. Optional: `sendTyping`.
- **Bridge** (`packages/core/src/bridge.ts`) — orchestrator connecting channels to providers. Manages session mapping, stream lifecycle, message buffering, and text splitting.
- **SessionMap** (`packages/core/src/session-map.ts`) — maps `channel:chatType:channelId:userId` keys to provider session IDs. Per-user sessions.
- **StreamManager** (`packages/core/src/stream-manager.ts`) — maintains one SSE stream per active session with reconnection and event deduplication.

## Monorepo layout

```
packages/       → core infrastructure (core, cli)
channels/       → messaging platform adapters (web, telegram, discord, ...)
providers/      → agent runtime backends (claude, http)
```

All packages use pnpm workspace (`workspace:*` references). Three workspace roots in `pnpm-workspace.yaml`: `packages/*`, `channels/*`, `providers/*`.

## Provider types

- `claude` — Claude Managed Agents API (REST + SSE). Full feature support including tool confirmation, custom tools, thinking, multi-agent threads.
- `http` — Generic HTTP provider. Connects to any server with REST + SSE endpoints. No code needed, just config.
- External — any npm package or local `.js` file that default-exports a class implementing `Provider`.

## Key design decisions

- **Buffer-then-send**: agent message events are buffered until `session.status_idle`, then flushed as one message. Avoids rapid-fire messages.
- **Raw event passthrough**: provider-specific events that don't map to the universal `ProviderEvent` union are emitted as `{ type: "raw", eventType, data }`. Bridge forwards them to `onEvent()` listeners.
- **Provider capabilities**: optional methods (`interrupt`, `confirmTool`, `submitToolResult`) are gated by a `capabilities` object. Bridge checks capabilities before calling.
- **Generic providerConfig**: `CreateSessionOpts.providerConfig` is `Record<string, unknown>`. Each provider extracts its own fields (Claude: `agentId`/`environmentId`, HTTP: `baseUrl`).
- **User identity**: `UserResolver` hook resolves platform sender → internal user. Supports programmatic (library mode) and webhook (CLI mode). Per-user agent/environment overrides. Session keys include userId for per-user scoping. Webhook resolver (`webhook-resolver.ts`) signs requests with HMAC-SHA256.

## Build & run

```bash
pnpm install
pnpm build
pnpm start          # requires harnessgate.yaml
```

## Conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- Kebab-case file names, PascalCase classes/interfaces, camelCase functions
- `export type` for type-only exports in barrel files
- Channel packages: `@harnessgate/channel-{name}` in `channels/{name}/`
- Provider packages: `@harnessgate/provider-{name}` in `providers/{name}/`
- Each package has `src/index.ts` barrel, `tsconfig.json` extending root, `package.json` with `workspace:*` dep on core
