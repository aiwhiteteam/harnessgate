<!-- TODO: Add logo/banner image -->
<!-- <p align="center"><img src="docs/assets/banner.png" alt="HarnessGate" width="600" /></p> -->

<h1 align="center">HarnessGate</h1>

<p align="center">
  <strong>Connect any messaging platform to Claude Managed Agents.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/your-org/harnessgate/actions"><img src="https://img.shields.io/github/actions/workflow/status/your-org/harnessgate/ci.yml?branch=main&label=CI" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
</p>

<!-- TODO: Add demo GIF -->
<!-- <p align="center"><img src="docs/assets/demo.gif" alt="Demo" width="700" /></p> -->

---

## Why HarnessGate and Claude Managed Agents?

Standard agent runtimes like the Anthropic ecosystem, E2B, and the OpenAI Agents SDK give you a secure, production-grade harness out of the box. Existing chatbot frameworks (OpenClaw, Botpress) ship their **own agent loop** instead — so to plug into one of these runtimes, you end up **bypassing the framework entirely** just to pipe messages through.

HarnessGate takes a different approach: **no local agent loop.** It's a pure bridge that connects social media platforms to a provider runtime such as Claude Managed Agents or E2B. The gateway just routes messages between platforms and the agent.

This means:
- Claude Managed Agents features work out of the box (tool confirmation, custom tools, multi-agent threads, extended thinking)
- Any future agent runtime plugs in with 4 methods
- No competing agent loops, no bypassed infrastructure, no wasted abstractions

```
[Telegram] [Discord] [Slack] [WhatsApp] [Teams] [Web UI]
     |         |        |       |          |       |
     +----+----+----+---+-------+----------+------+
          |         |
     PlatformAdapter interface (per platform)
          |         |
          +----+----+
               |
          Bridge (orchestrator)
          SessionMap + StreamManager
               |
        Provider interface
               |
    +----------+----------+----------+
    | Claude   | HTTP     | Custom   |
    | Managed  | (any     | (npm pkg |
    | Agents   |  server) |  or file)|
    +----------+----------+----------+
```

## Features

- **Provider-agnostic** — Claude Managed Agents, any HTTP server, or bring your own
- **Platform adapters** — Telegram, Discord, Slack, WhatsApp, Teams, Web UI
- **Multi-app** — run multiple app instances per platform, each mapped to a different agent
- **Session management** — automatic session creation, SQLite persistence, multi-turn conversations
- **Buffer-then-send** — accumulates agent responses, sends as one message per turn
- **Auto-split** — respects per-platform message length limits
- **Event passthrough** — provider-specific events forwarded via `bridge.onEvent()` listeners

## Quick Start

```bash
npm install harnessgate
```

```typescript
import { Bridge, ClaudeProvider, TelegramAdapter } from "harnessgate";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
const bridge = new Bridge(provider, {
  provider: { type: "claude" },
  platforms: { telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN! } },
});

// Route users to agents (agentId + environmentId from your DB)
bridge.setUserResolver(async (sender) => ({
  userId: sender.id,
  agentId: "agent_01XXXX",
  environmentId: "env_01XXXX",
}));

bridge.addPlatform(new TelegramAdapter());
await bridge.start();
```

See [`examples/demo-web/`](examples/demo-web/) for a minimal starter, [`examples/demo-telegram/`](examples/demo-telegram/) for a Telegram bot, or [`examples/with-supabase/`](examples/with-supabase/) for a production starter with Supabase auth and session persistence.

### Run an example from the repo

```bash
git clone https://github.com/your-org/harnessgate.git
cd harnessgate
pnpm install

cd examples/demo-telegram
cp .env.example .env
# Add ANTHROPIC_API_KEY in .env

# Fill in botToken in src/main.ts
# Implement your agentId/environmentId lookup in the user resolver

pnpm build
node --env-file=.env dist/main.js
```

## Multi-Bot / appId

Every platform adapter supports running multiple app instances simultaneously. Each app connects to the platform and receives a platform-assigned `appId` — an opaque identifier that flows through every `InboundMessage` and `ChannelTarget`.

```typescript
// Add multiple Telegram bots at runtime
const supportBotId = await bridge.connect("telegram", { botToken: process.env.SUPPORT_BOT_TOKEN });
const salesBotId = await bridge.connect("telegram", { botToken: process.env.SALES_BOT_TOKEN });

// Route based on which bot received the message
bridge.setUserResolver(async (sender, platform, message) => {
  const agentId = await db.getAgentForBot(message.appId);
  const environmentId = await db.getEnvironmentForBot(message.appId);
  return { userId: sender.id, agentId, environmentId };
});
```

### appId per platform

Each platform exposes a different identifier as `appId`. The adapter reads it from the platform SDK after connecting:

| Platform | Source | Example value |
|----------|--------|---------------|
| Telegram | `bot.botInfo.id` | `"123456789"` |
| Discord | `client.application.id` | `"1098765432101234567"` |
| Slack | `event.api_app_id` | `"A0123456789"` |
| WhatsApp | WABA phone number ID | `"106540352267890"` |
| Teams | `activity.recipient.id` | `"28:abc123..."` |
| Web | N/A (single instance) | — |

The `appId` is included in session keys as `app:<appId>`, so each bot maintains separate conversation sessions even in the same channel.

## Session Management

Each conversation context gets its own Claude session:

| Context | Session scope | Example key |
|---------|--------------|-------------|
| DM | Per user | `telegram:direct:123:u:user99` |
| Group/Channel | Shared (all users) | `slack:group:ch1` |
| Thread | Per thread | `discord:thread:ch1:t:thread99` |

Sessions persist to SQLite when you wire one in (survives restarts), otherwise the bridge falls back to in-memory storage:

```typescript
import { SqliteSessionStore } from "harnessgate";

bridge.setSessionStore(new SqliteSessionStore("./harnessgate.db"));
```

For custom stores (Supabase, Postgres, Redis), implement the `SessionStore` interface directly:

```typescript
bridge.setSessionStore({
  async get(key) { /* query your DB */ },
  async set(key, entry) { /* upsert */ },
  async delete(key) { /* delete */ },
  async touch(key) { /* update lastActiveAt */ },
});
```

See [`examples/with-supabase/main.ts`](examples/with-supabase/main.ts) for a complete example with Supabase for both auth and session persistence.

## Provider Setup

HarnessGate supports three ways to connect an agent runtime:

### 1. Claude Managed Agents

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
```

```typescript
import { ClaudeProvider } from "harnessgate";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
```

Connects to [Claude Managed Agents](https://docs.anthropic.com/en/docs/managed-agents/overview). Full support for streaming, tool confirmation, custom tools, extended thinking, and multi-agent threads.

For Claude, `agentId` and `environmentId` come from your `UserResolver`, not static provider config:

```typescript
bridge.setUserResolver(async (sender) => ({
  userId: sender.id,
  agentId: "agent_01XXXX",
  environmentId: "env_01XXXX",
}));
```

### 2. HTTP — any server

```bash
# .env
MY_TOKEN=...
```

```typescript
import { HttpProvider } from "harnessgate";

const provider = new HttpProvider({
  baseUrl: "http://localhost:8080",
  headers: { Authorization: `Bearer ${process.env.MY_TOKEN}` },
});
```

Connects to **any** HTTP server that implements these endpoints:

| Endpoint | Request | Response |
|----------|---------|----------|
| `POST /sessions` | `{ systemPrompt? }` | `{ id: "session-123" }` |
| `POST /sessions/{id}/message` | `{ message: "hello", sessionId: "..." }` | `200 OK` |
| `GET /sessions/{id}/stream` | SSE stream | `data: {"type": "message", "text": "..."}` |
| `DELETE /sessions/{id}` | — | `200 OK` |

Your server can be written in any language. SSE events can use either format:

```
# HarnessGate-native format (recommended)
data: {"type": "message", "text": "Hello!"}
data: {"type": "status", "status": "idle"}

# Simple format (auto-detected)
data: {"response": "Hello!"}
data: {"text": "Hello!"}
```

Custom endpoint paths:

```typescript
const provider = new HttpProvider({
  baseUrl: "http://localhost:8080",
  endpoints: {
    createSession: "POST /api/conversations",
    sendMessage: "POST /api/conversations/{sessionId}/chat",
    stream: "GET /api/conversations/{sessionId}/events",
    destroySession: "DELETE /api/conversations/{sessionId}",
  },
});
```

### 3. Custom provider — npm package or local file

```bash
# .env
MY_PROVIDER_API_KEY=...
```

```typescript
// npm package
import MyProvider from "@my-org/my-langgraph-provider";

// or local file
import MyProvider from "./my-provider.js";

const provider = new MyProvider({ apiKey: process.env.MY_PROVIDER_API_KEY! });
```

The package/file must default-export a class implementing the `Provider` interface:

```typescript
import type { Provider } from "harnessgate";

export default class MyProvider implements Provider {
  readonly id = "my-provider";
  readonly capabilities = {
    interrupt: false,
    toolConfirmation: false,
    customTools: false,
    thinking: false,
  };

  constructor(config: Record<string, unknown>) {
    // config contains whatever you pass to `new MyProvider({ ... })`
  }

  async createSession(opts) { /* ... */ }
  async sendMessage(sessionId, message) { /* ... */ }
  async *stream(sessionId, signal) { /* ... */ }
  async destroySession(sessionId) { /* ... */ }
}
```

## User Auth

HarnessGate supports per-user access control and agent routing via a `UserResolver`:

```typescript
bridge.setUserResolver(async (sender, platform, message) => {
  const user = await db.findUser(platform, sender.id);
  if (!user?.isActive) return null; // reject

  return {
    userId: user.id,
    agentId: user.agentId,         // which agent template
    environmentId: user.envId,     // which environment
    metadata: { plan: user.plan }, // passed to provider session
  };
});
```

Return `null` to reject. When no resolver is set, all users are allowed with their platform ID as the user ID.

Claude requires the resolver to return both `agentId` and `environmentId` for session creation.

## Platform Configuration

Pass per-platform config to the `Bridge` constructor under `platforms`, keyed by platform id. Each entry is forwarded to that adapter's `start()`. Add an adapter via `bridge.addPlatform(...)` for each platform you want to enable.

```bash
# .env
TELEGRAM_BOT_TOKEN=...
DISCORD_BOT_TOKEN=...
SLACK_BOT_TOKEN=...
SLACK_APP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...
TEAMS_APP_ID=...
TEAMS_APP_PASSWORD=...
```

```typescript
import {
  Bridge,
  TelegramAdapter,
  DiscordAdapter,
  SlackAdapter,
  WhatsAppAdapter,
  TeamsAdapter,
  WebAdapter,
} from "harnessgate";

const bridge = new Bridge(provider, {
  provider: { type: "claude" },
  platforms: {
    web: { port: 3000 },
    telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN! },
    discord: { token: process.env.DISCORD_BOT_TOKEN! },
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN!,
      appToken: process.env.SLACK_APP_TOKEN!,
    },
    whatsapp: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN!,
      port: 8080,
    },
    teams: {
      appId: process.env.TEAMS_APP_ID!,
      appPassword: process.env.TEAMS_APP_PASSWORD!,
      port: 3978,
    },
  },
});

// Only adapters you addPlatform() are started — omit any you don't need.
bridge.addPlatform(new WebAdapter());
bridge.addPlatform(new TelegramAdapter());
// bridge.addPlatform(new DiscordAdapter());
// bridge.addPlatform(new SlackAdapter());
// bridge.addPlatform(new WhatsAppAdapter());
// bridge.addPlatform(new TeamsAdapter());

await bridge.start();
```

Load `.env` via `node --env-file=.env dist/main.js` or any `dotenv`-style loader.

## Platform Setup Guides

Detailed setup instructions for each platform, including SaaS multi-tenant distribution:

| Platform | Guide | Library |
|----------|-------|---------|
| Telegram | [`docs/setup-telegram.md`](docs/setup-telegram.md) | grammY |
| Discord | [`docs/setup-discord.md`](docs/setup-discord.md) | discord.js |
| Slack | [`docs/setup-slack.md`](docs/setup-slack.md) | @slack/bolt |
| WhatsApp | [`docs/setup-whatsapp.md`](docs/setup-whatsapp.md) | Cloud API (fetch) |
| Teams | [`docs/setup-teams.md`](docs/setup-teams.md) | botbuilder |
| Web | [`docs/setup-web.md`](docs/setup-web.md) | Built-in HTTP |

## Project Structure

```
harnessgate/
├── src/
│   ├── index.ts                # Barrel exports
│   ├── bridge.ts               # Orchestrator
│   ├── session-map.ts          # Session persistence
│   ├── stream-manager.ts       # SSE stream lifecycle
│   ├── platforms/
│   │   ├── telegram-adapter.ts # grammY
│   │   ├── discord-adapter.ts  # discord.js
│   │   ├── slack-adapter.ts    # @slack/bolt
│   │   ├── whatsapp-adapter.ts # Cloud API (fetch)
│   │   ├── teams-adapter.ts    # Bot Framework SDK
│   │   └── web-adapter.ts      # Built-in HTTP + SSE
│   └── providers/
│       ├── claude-provider.ts  # Claude Managed Agents
│       └── http-provider.ts    # Generic HTTP
├── docs/                       # Platform setup guides
└── examples/                   # Starter projects
```

## Extending HarnessGate

See [CONTRIBUTING.md](CONTRIBUTING.md) for step-by-step guides on adding platforms and providers.

### Provider interface

```typescript
interface Provider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  // Required — every provider
  createSession(opts: CreateSessionOpts): Promise<ProviderSession>;
  sendMessage(sessionId: string, message: MessagePayload): Promise<void>;
  stream(sessionId: string, signal: AbortSignal): AsyncIterable<ProviderEvent>;
  destroySession(sessionId: string): Promise<void>;

  // Optional — capability-gated
  interrupt?(sessionId: string): Promise<void>;
  confirmTool?(sessionId: string, toolUseId: string, approved: boolean): Promise<void>;
  submitToolResult?(sessionId: string, toolUseId: string, result: unknown): Promise<void>;
}
```

### Platform interface

```typescript
interface PlatformAdapter {
  readonly id: string;
  readonly capabilities: PlatformCapabilities;
  start(ctx: PlatformContext): Promise<void>;
  stop(): Promise<void>;
  send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult>;
  sendTyping?(target: ChannelTarget): Promise<void>;
  connect?(credentials: Record<string, unknown>, ctx: PlatformContext): Promise<string>;
  disconnect?(appId: string): Promise<void>;
  activeConnections?(): string[];
}
```

## Requirements

- Node.js >= 22
- pnpm

## License

MIT
