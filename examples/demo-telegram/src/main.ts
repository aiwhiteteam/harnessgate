/**
 * Example: HarnessGate with Telegram using connect()
 *
 * App configs are stored in a simple in-memory array (replace with your DB).
 * On startup, we open a connection for each app.
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY — your Anthropic API key
 */

import { Bridge } from "harnessgate";
import { ClaudeProvider } from "harnessgate/providers";
import { TelegramAdapter } from "harnessgate/platforms";

// --- In-memory app store (replace with your DB) ---

interface AppRecord {
  botToken: string;
  agentId: string;
  environmentId: string;
  appId?: string; // filled after connect
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

// --- Open connections for all apps in the store ---

for (const record of appStore) {
  const appId = await bridge.connect("telegram", { botToken: record.botToken });
  record.appId = appId;
  appById.set(appId, record);
  console.log(`Connected → appId=${appId}`);
}

console.log("HarnessGate running — Telegram bot is listening");
