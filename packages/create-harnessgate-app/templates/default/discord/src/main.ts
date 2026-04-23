import { Bridge } from "harnessgate";
import { ClaudeProvider } from "harnessgate/providers";
import { DiscordAdapter } from "harnessgate/platforms";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

const bridge = new Bridge(provider, {
  provider: { type: "claude" },
});

bridge.addPlatform(new DiscordAdapter());

bridge.setUserResolver(async (sender) => ({
  userId: sender.id,
  agentId: process.env.AGENT_ID!,
  environmentId: process.env.ENVIRONMENT_ID!,
}));

await bridge.connect("discord", {
  botToken: process.env.DISCORD_BOT_TOKEN!,
});

console.log("HarnessGate running — Discord bot is listening");
