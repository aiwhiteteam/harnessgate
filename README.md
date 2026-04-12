<!-- TODO: Add logo/banner image -->
<!-- <p align="center"><img src="docs/assets/banner.png" alt="HarnessGate" width="600" /></p> -->

<h1 align="center">HarnessGate</h1>

<p align="center">
  <strong>Connect Claude Managed Agents or any harness runtime to any messaging platform.</strong>
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

## Why HarnessGate?

**HarnessGate is a multi-channel gateway for Claude Managed Agents (and any other agent runtime).**

You built an agent on Claude Managed Agents. Now you want it on Telegram, Discord, Slack, WhatsApp, and a web chat — without rewriting it five times. HarnessGate is the glue: point it at your agent, turn on the channels you want, done.

Other chatbot frameworks (AstrBot, LangBot, Botpress) try to **be** the agent — they call LLMs, run tools, and manage context themselves. Plugging Claude Managed Agents into them means fighting their built-in brain.

HarnessGate has **no brain of its own**. It just pipes messages between your users and your agent. Your agent stays in charge, and all its features (tool confirmation, custom tools, multi-agent threads, extended thinking) just work.

### HarnessGate vs OpenClaw

Think of [OpenClaw](https://github.com/openclaw/openclaw) as a **ready-to-use personal assistant** — you install it, it talks to you on WhatsApp / Telegram / Slack / Discord, and the AI brain is baked in. Great if you want a turnkey assistant for yourself.

HarnessGate is the opposite: **bring your own brain**. You already have an agent (Claude Managed Agents, a custom LangGraph server, anything HTTP) — HarnessGate just gives it a mouth on every channel. No opinions about what the agent does, no bundled LLM, no lock-in.

| | OpenClaw | HarnessGate |
|---|---|---|
| What it is | Full personal AI assistant | Gateway / bridge only |
| Agent brain | Built in | **Yours** (Claude Managed Agents, HTTP, custom) |
| Best for | "I want an assistant on my phone" | "I built an agent, now put it on every channel" |
| Channels | Many (WhatsApp, Telegram, Slack, …) | Many (WhatsApp, Telegram, Slack, …) |

Short version: **OpenClaw = the whole robot. HarnessGate = the wires connecting your robot to the world.**

```
[Telegram] [Discord] [Slack] [WhatsApp] [Web UI] [Teams] ...
     |         |        |        |         |        |
     +----+----+----+---+----+---+----+----+--------+
          |         |        |        |
     ChannelAdapter interface (per platform)
          |         |        |        |
          +----+----+----+---+--------+
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
- **12 channel adapters** — Telegram, Discord, Slack, WhatsApp, Web UI, Teams, Google Chat, Matrix, LINE, Feishu, Twilio, WhatsApp Business
- **Session management** — automatic session creation, idle pruning, multi-turn conversations
- **Buffer-then-send** — accumulates agent responses, sends as one message per turn
- **Auto-split** — respects per-channel message length limits
- **Event passthrough** — provider-specific events forwarded via `bridge.onEvent()` listeners

## Quick Start

### As a server (CLI)

```bash
git clone https://github.com/your-org/harnessgate.git
cd harnessgate
pnpm install
pnpm build

cp harnessgate.example.yaml harnessgate.yaml
# Edit harnessgate.yaml — see Provider Setup below

pnpm start
# Open http://localhost:3000
```

### As a library (npm)

```bash
npm install @harnessgate/core @harnessgate/provider-claude @harnessgate/channel-web
```

```typescript
import { Bridge } from "@harnessgate/core";
import { ClaudeProvider } from "@harnessgate/provider-claude";
import { WebAdapter } from "@harnessgate/channel-web";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
const bridge = new Bridge(provider, {
  provider: { type: "claude", agentId: "agent_01XXX", environmentId: "env_01XXX" },
  channels: { web: { enabled: true, port: 3000 } },
  auth: {},
  session: { maxIdleMs: 3_600_000 },
  logging: { level: "info" },
});

bridge.addChannel(new WebAdapter());
await bridge.start();
```

See [`examples/library/main.ts`](examples/library/main.ts) for a full example with auth and event listeners.

## Provider Setup

HarnessGate supports three ways to connect an agent runtime:

### 1. Claude Managed Agents

```yaml
provider:
  type: claude
  apiKey: ${ANTHROPIC_API_KEY}
  agentId: agent_01XXXX
  environmentId: env_01XXXX
```

Connects to [Claude Managed Agents](https://docs.anthropic.com/en/docs/managed-agents/overview). Full support for streaming, tool confirmation, custom tools, extended thinking, and multi-agent threads.

### 2. HTTP — any server

```yaml
provider:
  type: http
  baseUrl: http://localhost:8080
  headers:
    Authorization: Bearer ${MY_TOKEN}
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

```yaml
provider:
  type: http
  baseUrl: http://localhost:8080
  endpoints:
    createSession: POST /api/conversations
    sendMessage: POST /api/conversations/{sessionId}/chat
    stream: GET /api/conversations/{sessionId}/events
    destroySession: DELETE /api/conversations/{sessionId}
```

### 3. Custom provider — npm package or local file

```yaml
provider:
  type: "@my-org/my-langgraph-provider"    # npm package
  apiKey: xxx

# or

provider:
  type: "./my-provider.js"                  # local file
  apiKey: xxx
```

The package/file must default-export a class implementing the `Provider` interface:

```typescript
import type { Provider } from "@harnessgate/core";

export default class MyProvider implements Provider {
  readonly id = "my-provider";
  readonly capabilities = {
    interrupt: false,
    toolConfirmation: false,
    customTools: false,
    thinking: false,
  };

  constructor(config: Record<string, unknown>) {
    // config contains everything from the provider block in YAML
  }

  async createSession(opts) { /* ... */ }
  async sendMessage(sessionId, message) { /* ... */ }
  async *stream(sessionId, signal) { /* ... */ }
  async destroySession(sessionId) { /* ... */ }
}
```

## User Auth

HarnessGate supports per-user access control and agent routing. Two modes:

### Programmatic (library mode)

```typescript
import { Bridge } from "@harnessgate/core";

const bridge = new Bridge(provider, config);

bridge.setUserResolver(async (sender, channel) => {
  const user = await db.findUser(channel, sender.id);
  if (!user?.isActive) return null; // reject

  return {
    userId: user.id,
    agentId: user.agentId,         // per-user agent override
    environmentId: user.envId,     // per-user environment override
    metadata: { plan: user.plan }, // passed to provider session
  };
});
```

### Webhook (CLI mode)

```yaml
auth:
  webhook: https://myapp.com/auth/validate
  secret: ${AUTH_WEBHOOK_SECRET}
```

HarnessGate POSTs `{ channel, senderId, senderUsername, senderDisplayName }` to your webhook. Your server returns:

```json
{ "allowed": true, "userId": "u99", "agentId": "agent_premium" }
```

Or `{ "allowed": false }` to reject. The request body is signed with HMAC-SHA256 in the `X-HarnessGate-Signature` header when a secret is configured.

When no auth is configured, all users are allowed with their platform ID as the user ID.

## Channel Configuration

```yaml
channels:
  web:
    enabled: true
    port: 3000
  telegram:
    enabled: false
    botToken: ${TELEGRAM_BOT_TOKEN}
  discord:
    enabled: false
    token: ${DISCORD_BOT_TOKEN}
  slack:
    enabled: false
    botToken: ${SLACK_BOT_TOKEN}
    appToken: ${SLACK_APP_TOKEN}

session:
  maxIdleMs: 3600000

logging:
  level: info
```

Environment variables are interpolated via `${VAR}` syntax.

## Project Structure

```
harnessgate/
├── packages/
│   ├── core/          # Provider/Channel interfaces, Bridge, SessionMap, StreamManager
│   └── cli/           # CLI entry point
├── channels/
│   ├── web/           # HTTP + WebSocket chat UI
│   ├── telegram/      # grammY
│   ├── discord/       # discord.js
│   ├── slack/         # @slack/bolt
│   ├── whatsapp/      # Baileys
│   ├── teams/         # Bot Framework
│   ├── google-chat/
│   ├── matrix/        # matrix-js-sdk
│   ├── line/          # @line/bot-sdk
│   ├── feishu/        # Feishu/Lark
│   ├── twilio/        # SMS + Voice
│   └── whatsapp-business/  # Meta Cloud API
└── providers/
    ├── claude/        # Claude Managed Agents API
    └── http/          # Generic HTTP — any server
```

## Extending HarnessGate

See [CONTRIBUTING.md](CONTRIBUTING.md) for step-by-step guides on adding channels and providers.

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

### Channel interface

```typescript
interface ChannelAdapter {
  readonly id: string;
  readonly capabilities: ChannelCapabilities;
  start(ctx: ChannelContext): Promise<void>;
  stop(): Promise<void>;
  send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult>;
  sendTyping?(target: ChannelTarget): Promise<void>;
}
```

## Requirements

- Node.js >= 22
- pnpm

## License

MIT
