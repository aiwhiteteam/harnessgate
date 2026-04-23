import { Bridge } from "harnessgate";
import { ClaudeProvider } from "harnessgate/providers";
import { WebAdapter } from "harnessgate/platforms";
import { sessionStore, resolveUser } from "./supabase.js";
import { startAdminApi } from "./api.js";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

const bridge = new Bridge(provider, {
  provider: { type: "claude" },
  platforms: { web: { port: Number(process.env.PORT) || {{PORT}} } },
});

bridge.addPlatform(new WebAdapter());
bridge.setSessionStore(sessionStore);

bridge.setUserResolver(async (sender, platform, message) =>
  resolveUser(sender, platform, message.appId)
);

await bridge.start();
startAdminApi(Number(process.env.ADMIN_PORT) || 4000);
console.log("HarnessGate + Supabase running — open http://localhost:" + (process.env.PORT || {{PORT}}));
