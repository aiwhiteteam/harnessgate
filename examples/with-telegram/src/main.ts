/**
 * Example: HarnessGate with Telegram
 *
 * Install:
 *   npm install @harnessgate/core @harnessgate/provider-claude @harnessgate/platform-telegram
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY    — your Anthropic API key
 *   TELEGRAM_BOT_TOKEN   — from @BotFather on Telegram
 */

import { Bridge, type BridgeConfig } from "@harnessgate/core";
import { ClaudeProvider } from "@harnessgate/provider-claude";
import { TelegramAdapter } from "@harnessgate/platform-telegram";

// 1. Create provider
const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

// 2. Config — botToken is required
const config: BridgeConfig = {
  provider: { type: "claude" },
  platforms: {
    telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN },
  },
};

// 3. Create bridge and add platform
const bridge = new Bridge(provider, config);
bridge.addPlatform(new TelegramAdapter());

// 4. Optional: route users to specific agents
bridge.setUserResolver(async (sender, _platform, _message) => {
  console.log(`Telegram user connected: ${sender.id} (@${sender.displayName})`);
  return {
    userId: sender.id,
    agentId: "agent_01XXXX",       // replace with your agent ID
    environmentId: "env_01XXXX",   // replace with your environment ID
  };
});

// 5. Optional: listen to provider events
bridge.onEvent((sessionId, event) => {
  if (event.type === "raw") {
    console.log(`Raw event from ${sessionId}:`, event.eventType);
  }
});

// 6. Start
await bridge.start();
console.log("HarnessGate running — Telegram bot is listening");
