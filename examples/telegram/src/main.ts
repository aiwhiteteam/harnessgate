/**
 * Example: HarnessGate with Telegram using addApp()
 *
 * App configs are stored in a simple in-memory store (replace with your DB).
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
  botToken: string;
  agentId: string;
  environmentId: string;
  appId?: string; // filled after addApp connects
}

const appStore: AppRecord[] = [
  {
    botToken: "YOUR_BOT_TOKEN",
    agentId: "agent_01XXXX",
    environmentId: "env_01XXXX",
  },
];

// --- Bridge setup ---

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
const bridge = new Bridge(provider, { provider: { type: "claude" } });
bridge.addPlatform(new TelegramAdapter());

// appId → AppRecord lookup (built after connecting)
const appById = new Map<string, AppRecord>();

// Route users to the correct agent based on which app received the message
bridge.setUserResolver(async (sender, _platform, message) => {
  const record = appById.get(message.appId!);
  if (!record) return null;

  return {
    userId: sender.id,
    agentId: record.agentId,
    environmentId: record.environmentId,
  };
});

// --- Connect all apps from the store ---

for (const record of appStore) {
  const appId = await bridge.addApp("telegram", { botToken: record.botToken });
  record.appId = appId;
  appById.set(appId, record);
  console.log(`Started app → appId=${appId}`);
}

console.log("HarnessGate running — Telegram bot is listening");
