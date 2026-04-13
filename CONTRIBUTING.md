# Contributing to HarnessGate

## What's Needed

### Channel Adapters (good first issues)

These channels have scaffolded packages but need implementation. Each follows the same pattern as the Telegram adapter — see the guide below.

| Channel | Package | Library | Difficulty |
|---------|---------|---------|------------|
| WhatsApp | `channels/whatsapp/` | `@whiskeysockets/baileys` | Medium (QR auth flow) |
| WhatsApp Business | `channels/whatsapp-business/` | Meta Cloud API (raw HTTP) | Medium |
| Microsoft Teams | `channels/teams/` | `botbuilder` | Medium |
| Google Chat | `channels/google-chat/` | Google Chat API | Medium |
| Matrix | `channels/matrix/` | `matrix-js-sdk` | Easy |
| LINE | `channels/line/` | `@line/bot-sdk` | Easy |
| Feishu/Lark | `channels/feishu/` | Feishu Open API | Medium |
| Twilio (SMS) | `channels/twilio/` | `twilio` | Easy |

Reference implementation: `channels/telegram/src/telegram-adapter.ts` (~90 lines)

### Providers

| Provider | Status | Notes |
|----------|--------|-------|
| Claude Managed Agents | Done | `providers/claude/` |
| HTTP (generic) | Done | `providers/http/` |
| OpenAI Assistants | Not started | Would need a new `providers/openai/` package |
| Google Gemini | Not started | Would need a new `providers/gemini/` package |

### Other Contributions

- Tests (none exist yet — co-located `*.test.ts` files with Vitest)
- Docker Compose setup
- Health check endpoint
- Per-channel rate limiting

## Development Setup

```bash
git clone https://github.com/your-org/harnessgate.git
cd harnessgate
pnpm install
pnpm build
```

## Adding a New Channel Adapter

This is the most common contribution. Follow these steps:

### 1. Create the package

```bash
mkdir -p channels/my-channel/src
```

### 2. Add `package.json`

```json
{
  "name": "@harnessgate/channel-my-channel",
  "version": "0.1.0",
  "description": "MyChannel adapter for HarnessGate",
  "license": "MIT",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@harnessgate/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

### 3. Add `tsconfig.json`

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### 4. Implement the adapter

Create `channels/my-channel/src/my-channel-adapter.ts`:

```typescript
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
  InboundMessage,
} from "@harnessgate/core";

export class MyChannelAdapter implements ChannelAdapter {
  readonly id = "my-channel";
  readonly capabilities: ChannelCapabilities = {
    maxTextLength: 4096,        // platform's max message length
    supportsMarkdown: true,
    supportsThreads: false,
    supportsTypingIndicator: true,
    supportsAttachments: false,
  };

  async start(ctx: ChannelContext): Promise<void> {
    // Initialize your bot/client using ctx.config for credentials
    // Call ctx.onMessage(msg) when a message arrives
    // Use ctx.signal to handle shutdown
  }

  async stop(): Promise<void> {
    // Clean up connections
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<SendResult> {
    // Send message to the platform
    return { success: true };
  }

  async sendTyping(target: ChannelTarget): Promise<void> {
    // Optional: send typing indicator
  }
}
```

### 5. Create barrel export

Create `channels/my-channel/src/index.ts`:

```typescript
export { MyChannelAdapter } from "./my-channel-adapter.js";
```

### 6. Use it

```typescript
import { MyChannelAdapter } from "@harnessgate/channel-my-channel";

bridge.addChannel(new MyChannelAdapter());
```

### 7. Build and test

```bash
pnpm install
pnpm build
```

## Adding a New Provider

Same pattern as channels, but in the `providers/` directory implementing the `Provider` interface.

## Code Style

- TypeScript strict mode
- Kebab-case file names
- PascalCase for classes and interfaces
- camelCase for functions and variables
- Use `export type` for type-only exports

## Pull Requests

- One feature per PR
- Include a description of what changed and why
- Ensure `pnpm build` passes
- Add tests for new functionality
