# Contributing to HarnessGate

## Development Setup

```bash
git clone https://github.com/your-org/harnessgate.git
cd harnessgate
pnpm install
pnpm build
pnpm test
```

## Adding a New Platform Adapter

This is the most common contribution. All adapters live in `src/platforms/`.

### 1. Create the adapter file

Create `src/platforms/my-platform-adapter.ts`:

```typescript
import type {
  PlatformAdapter,
  PlatformCapabilities,
  PlatformContext,
  ChannelTarget,
  SendResult,
  OutboundMessage,
} from "../platform.js";
import type { InboundMessage } from "../messages.js";

export class MyPlatformAdapter implements PlatformAdapter {
  readonly id = "my-platform";
  readonly capabilities: PlatformCapabilities = {
    maxTextLength: 4096,        // platform's max message length
    supportsMarkdown: true,
    supportsThreads: false,
    supportsTypingIndicator: true,
    supportsAttachments: false,
  };

  async start(ctx: PlatformContext): Promise<void> {
    // Initialize your bot/client
    // Call ctx.onMessage(msg) when a message arrives
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

  // Optional: multi-instance support
  async connect(credentials: Record<string, unknown>, ctx: PlatformContext): Promise<string> {
    // Connect a new bot instance, return appId
    return "app-id";
  }

  async disconnect(appId: string): Promise<void> {
    // Disconnect a bot instance
  }

  activeConnections(): string[] {
    // Return list of connected appIds
    return [];
  }
}
```

### 2. Export it

Add to `src/platforms/index.ts`:

```typescript
export { MyPlatformAdapter } from "./my-platform-adapter.js";
```

Add to `src/index.ts`:

```typescript
export { MyPlatformAdapter } from "./platforms/my-platform-adapter.js";
```

### 3. Use it

```typescript
import { MyPlatformAdapter } from "harnessgate";

bridge.addPlatform(new MyPlatformAdapter());
```

### 4. Add tests

Create `src/platforms/my-platform-normalize.test.ts` for the message normalization logic.

### 5. Build and test

```bash
pnpm build
pnpm test
```

## Adding a New Provider

Same pattern — implement the `Provider` interface in `src/providers/`.

Reference: `src/providers/claude-provider.ts`

## Code Style

- TypeScript strict mode, ESM (`"type": "module"`)
- Kebab-case file names
- PascalCase for classes and interfaces
- camelCase for functions and variables
- Use `export type` for type-only exports
- Tests co-located: `*.test.ts` next to `*.ts`

## Pull Requests

- One feature per PR
- Include a description of what changed and why
- Ensure `pnpm build` and `pnpm test` pass
- Add normalize tests for new platform adapters
