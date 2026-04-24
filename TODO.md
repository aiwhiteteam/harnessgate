# HarnessGate — Roadmap

## Done

- Core: Provider interface, PlatformAdapter interface, Bridge orchestrator
- Providers: Claude Managed Agents, HTTP (generic)
- Platforms: Telegram, Discord, Slack, WhatsApp (Cloud API), Teams (Bot Framework), Web UI
- User auth: UserResolver hook, per-user agent routing, per-conversation session scoping
- Session management: SQLite default, swappable SessionStore interface
- Multi-instance: connect/disconnect multiple bots per platform at runtime
- Examples: demo-web, demo-telegram (runnable starters), with-supabase
- Tests: 64 unit tests (session-map, bridge, logger, stream-manager, platform normalize tests)
- CI: GitHub Actions (typecheck + build)
- Docs: Platform setup guides for all 6 platforms (including SaaS distribution)

## Up Next

### Visual assets
- Logo / banner image for README
- Demo GIF showing end-to-end flow (message in Telegram → Claude responds)

### Soul files (per-agent personas)
Markdown files that define agent personality. HarnessGate reads them and creates Claude agents with those system prompts. Per-channel or per-user agent assignment. Removes the need for users to pre-create agents via the Anthropic API.

### More platform adapters

| Platform | Library | Difficulty |
|----------|---------|------------|
| Google Chat | Google Chat API | Medium |
| Matrix | matrix-js-sdk | Easy |
| LINE | @line/bot-sdk | Easy |
| Feishu/Lark | Feishu Open API | Medium |
| Twilio (SMS) | twilio | Easy |

### Testing
- Bridge integration test (mock provider + mock platform, verify end-to-end flow)
- Webhook resolver test (mock HTTP server)

### Infrastructure
- Docker Compose for local dev
- Dockerfile for production
- Health check endpoint
- Per-platform rate limiting

### Future providers
- OpenAI Assistants API
- Google Gemini

### Docs site
- When README exceeds ~500 lines or users request it
- Docusaurus or VitePress
