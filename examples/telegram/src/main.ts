/**
 * Example: HarnessGate with Telegram using addApp()
 *
 * Bot tokens are stored in a simple in-memory store (replace with your DB).
 * On startup, all registered apps are loaded and connected.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY — your Anthropic API key
 */

import { Bridge } from "@harnessgate/core";
import { ClaudeProvider } from "@harnessgate/provider-claude";
import { TelegramAdapter } from "@harnessgate/platform-telegram";

// --- In-memory app store (replace with your DB) ---

interface AppRecord {
  appId: string;
  agentId: string;
  environmentId: string;
}

// Maps appId → agent routing (filled after connecting)
const appStore = new Map<string, AppRecord>();

// --- Bridge setup ---

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
const bridge = new Bridge(provider, { provider: { type: "claude" } });
bridge.addPlatform(new TelegramAdapter());

// Route users to the correct agent based on which app received the message
bridge.setUserResolver(async (sender, _platform, message) => {
  const record = appStore.get(message.appId!);
  if (!record) return null; // reject unknown apps

  return {
    userId: sender.id,
    agentId: record.agentId,
    environmentId: record.environmentId,
  };
});

// --- Register and start app ---

const appId = await bridge.addApp("telegram", { botToken: "YOUR_BOT_TOKEN" });
appStore.set(appId, {
  appId,
  agentId: "agent_01XXXX",
  environmentId: "env_01XXXX",
});
console.log(`Started bot → appId=${appId}`);

console.log("HarnessGate running — Telegram bot is listening");
