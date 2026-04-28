import { Bridge } from "harnessgate";
import { ClaudeProvider } from "harnessgate/providers";
import { TelegramAdapter } from "harnessgate/platforms";
import { supabase, sessionStore, resolveUser, getActiveApps } from "./supabase.js";
import { startAdminApi } from "./api.js";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

const bridge = new Bridge(provider, {
  provider: { type: "claude" },
});

bridge.addPlatform(new TelegramAdapter());
bridge.setSessionStore(sessionStore);

bridge.setUserResolver(async (sender, platform, message) =>
  resolveUser(sender, platform, message.appId)
);

// Connect all active Telegram apps from the DB
const apps = await getActiveApps("telegram");
for (const app of apps) {
  const creds = app.credentials as { botToken: string };
  const appId = await bridge.connect("telegram", { botToken: creds.botToken });
  await supabase.from("apps").update({ app_id: appId }).eq("id", app.id);
  console.log(`Connected app ${app.id} → appId=${appId}`);
}

startAdminApi(Number(process.env.ADMIN_PORT) || 4000);
console.log(`HarnessGate running — ${apps.length} Telegram bot(s) listening`);
