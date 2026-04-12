# HarnessGate — Roadmap

## Done

- Core: Provider interface, ChannelAdapter interface, Bridge orchestrator
- Providers: Claude Managed Agents, HTTP (generic), dynamic loading
- Channels: Web UI, Telegram, Discord, Slack (+ 8 scaffolded)
- User auth: UserResolver hook (programmatic + webhook), per-user agent routing, HMAC signing
- Session management: per-user scoping, idle pruning, stream management
- Tests: 38 unit tests (session-map, config, bridge, logger, stream-manager)
- Docs: README, CONTRIBUTING, CLAUDE.md, example config, library example
- CI: GitHub Actions (typecheck + build)

## Up Next

### Visual assets
- Logo / banner image for README
- Demo GIF showing end-to-end flow (message in Telegram → Claude responds)

### Soul files (per-agent personas)
Markdown files that define agent personality. HarnessGate reads them and creates Claude agents with those system prompts. Per-channel or per-user agent assignment. Removes the need for users to pre-create agents via the Anthropic API.

### Remaining channel adapters (good first issues)

| Channel | Library | Difficulty |
|---------|---------|------------|
| WhatsApp | Baileys | Medium |
| WhatsApp Business | Meta Cloud API | Medium |
| Microsoft Teams | botbuilder | Medium |
| Google Chat | Google Chat API | Medium |
| Matrix | matrix-js-sdk | Easy |
| LINE | @line/bot-sdk | Easy |
| Feishu/Lark | Feishu Open API | Medium |
| Twilio (SMS) | twilio | Easy |

### Testing
- Bridge integration test (mock provider + mock channel, verify end-to-end flow)
- Webhook resolver test (mock HTTP server)
- Channel adapter tests (mock bot libraries)

### Infrastructure
- Docker Compose for local dev
- Dockerfile for production
- Health check endpoint
- Session persistence (DB-backed session store, survive restarts)

### Future providers
- OpenAI Assistants API
- Google Gemini
- When those platforms release managed agent APIs

### Docs site
- When README exceeds ~500 lines or users request it
- Docusaurus or VitePress
