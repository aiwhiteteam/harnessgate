# Discord Setup

## Prerequisites

- A Discord account
- Your HarnessGate project set up with `harnessgate` installed

## 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → name it → **Create**
3. Note the **Application ID** (you'll need this for the invite link)

## 2. Create a Bot

1. In your application, go to the **Bot** tab
2. Click **Add Bot** → confirm
3. Click **Reset Token** → copy the **bot token** — save it
4. Under **Privileged Gateway Intents**, enable:
   - **Message Content Intent** (required to read message text)
   - **Server Members Intent** (optional, for member info)

## 3. Generate an Invite Link

1. Go to the **OAuth2** tab → **URL Generator**
2. Select scopes: `bot`
3. Select bot permissions: `Send Messages`, `Read Message History`, `View Channels`
4. Copy the generated URL

## 4. Invite the Bot

Share the invite URL with anyone who wants to add the bot to their server:
```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&scope=bot&permissions=68608
```

The server admin clicks the link → selects their server → **Authorize**.

## 5. Connect to HarnessGate

```typescript
import { Bridge, ClaudeProvider, DiscordAdapter } from "harnessgate";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY);
const bridge = new Bridge({ provider, defaultAgentId: "your-agent-id", defaultEnvironmentId: "your-env-id" });

bridge.addPlatform(new DiscordAdapter());
await bridge.start({ discord: { token: process.env.DISCORD_BOT_TOKEN } });
```

## 6. Test

1. Go to a server where the bot is invited
2. Send a message in a channel the bot can see
3. For DMs, right-click the bot → **Message**

## SaaS Distribution

Discord bots use OAuth2 invite links for distribution:

- **Public bot**: In Developer Portal → Bot tab → enable **Public Bot**. Anyone with the invite link can add it to their server.
- **Private bot**: Keep "Public Bot" disabled. Only you can add it to servers.
- **Verification**: Bots in 75+ servers must be verified by Discord (submit application in Developer Portal).
- **App Directory**: Submit your bot to [discord.com/application-directory](https://discord.com/application-directory) for discoverability.

Each server is like a "customer org" — one bot instance serves all servers via the same token.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Bot token from Developer Portal |
