# HarnessGate — Next Session TODO

## Context

HarnessGate is a universal gateway connecting AI agent harness runtimes (Claude Managed Agents, any HTTP server, custom providers) to messaging platforms. It is **not** a chatbot framework — it's a thin bridge that delegates all intelligence to the provider runtime.

**Key differentiator:** HarnessGate is the only project whose architecture is designed for external managed agent runtimes from the start. Competitors (AstrBot 29.6K stars, LangBot 15.8K stars) run their own agent loop and would have to bypass their entire infrastructure to support Claude Managed Agents. HarnessGate has no local agent loop to bypass.

---

## ~~Priority 1: User Identity + Auth~~ DONE

### Why

Right now HarnessGate creates one Claude session per channel conversation, using the same agent for everyone, with no access control. This means:
- Anyone who finds the bot can use it and burn API credits
- No way to give different users different agents (e.g. Opus for paid, Sonnet for free)
- No way to resume a user's session if they switch channels
- No way to integrate with an existing user database

### The goal

A user sends a message on Telegram. Before the bridge creates a session:
1. Resolve their platform identity (Telegram user 12345) to an internal user
2. Check if they are authorized (active, paid, etc.)
3. Use their assigned agent/environment if configured
4. Resume their existing session if one exists

This is **not multi-tenancy** — it's per-user agent routing and access control within a single deployment. One operator, one product, many users.

### Industry standard approach

- **Programmatic** (library mode): `bridge.setUserResolver(async (sender, channel) => { ... })`
- **Webhook** (CLI mode): Bridge POSTs to a URL, your server returns allow/deny + user config
- Same pattern as Passport.js, NestJS Guards, Express middleware — framework provides the hook, user implements the logic with their own DB

### What needs to change

| File | Change |
|------|--------|
| `packages/core/src/provider.ts` | Add `ResolvedUser` type, `UserResolver` type, add `sender` to `CreateSessionOpts` |
| `packages/core/src/session-map.ts` | Add `userId` to `SessionEntry` |
| `packages/core/src/bridge.ts` | Add `setUserResolver()`, call resolver before session creation, update session key to include `sender.id` for per-user scoping in group chats |
| `packages/core/src/config.ts` | Add `auth.webhook` config option |
| `packages/core/src/index.ts` | Export `ResolvedUser`, `UserResolver` |
| `providers/claude/src/claude-provider.ts` | Pass `sender` and `userId` via session metadata |

### New types to add

```typescript
export interface ResolvedUser {
  userId: string;                         // internal user ID
  agentId?: string;                       // override agent for this user
  environmentId?: string;                 // override environment for this user
  metadata?: Record<string, unknown>;     // passed to provider session
}

export type UserResolver = (
  sender: Sender,
  channel: string,
) => Promise<ResolvedUser | null>;        // null = reject (unauthorized)
```

### Session key change

Current: `channel:chatType:channelId` — group chats share one session across all users

New: `channel:chatType:channelId:userId` — per-user sessions everywhere

### Webhook config (CLI mode)

```yaml
auth:
  webhook: https://myapp.com/auth/validate
  secret: ${AUTH_WEBHOOK_SECRET}
```

Bridge POSTs `{ channel, senderId, senderUsername }` → your server returns `{ allowed: true, userId, agentId? }` or `{ allowed: false }`.

---

## Priority 2: Init git repo + ship

After Priority 1 is done:

1. `git init`
2. Initial commit with all current work
3. Push to GitHub
4. Tag `v0.1.0`

---

## Priority 3: Post-launch

### Soul files (per-channel / per-user personas)
OpenClaw has "soul" files — markdown files that define the agent's personality. For HarnessGate this means:
- HarnessGate reads `souls/coding.md` and creates a Claude agent with that as the system prompt
- Per-channel or per-user agent assignment via config
- Removes the need for users to pre-create agents via the Anthropic API

### Remaining channel adapters (good first issues)
WhatsApp (Baileys), WhatsApp Business, Teams, Google Chat, Matrix, LINE, Feishu, Twilio. See CONTRIBUTING.md.

### Bridge integration test
Mock a provider that emits events, mock a channel that captures outbound messages, verify the full Bridge flow end-to-end.

### Docker Compose
Self-contained local dev setup with `docker compose up`.

### Session persistence
Currently sessions are in-memory and lost on restart. Add optional DB-backed session store so user sessions survive restarts.

### Additional providers
OpenAI Assistants API, Google Gemini — when those platforms release managed agent APIs.
