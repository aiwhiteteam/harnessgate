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
  botToken: string;
  agentId: string;
  environmentId: string;
}

const appStore = new Map<string, AppRecord>();

// Seed with your bot — in production these come from your DB/API
appStore.set("my-bot", {
  botToken: "YOUR_BOT_TOKEN",
  agentId: "agent_01XXXX",
  environmentId: "env_01XXXX",
});

// --- Bridge setup ---

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
const bridge = new Bridge(provider, { provider: { type: "claude" } });
bridge.addPlatform(new TelegramAdapter());

// Route users to the correct agent based on which app received the message
bridge.setUserResolver(async (sender, _platform, message) => {
  // Look up which agent this app maps to
  const record = [...appStore.entries()].find(
    ([, r]) => appIdMap.get(r.botToken) === message.appId,
  );
  if (!record) return null; // reject unknown apps

  return {
    userId: sender.id,
    agentId: record[1].agentId,
    environmentId: record[1].environmentId,
  };
});

// --- Start all apps ---

// Maps botToken → appId (filled after connecting)
const appIdMap = new Map<string, string>();

for (const [name, record] of appStore) {
  const appId = await bridge.addApp("telegram", { botToken: record.botToken });
  appIdMap.set(record.botToken, appId);
  console.log(`Started ${name} → appId=${appId}`);
}

console.log("HarnessGate running — Telegram bots are listening");
