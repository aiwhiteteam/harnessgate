import { Bridge } from "harnessgate";
import { ClaudeProvider } from "harnessgate/providers";
import { SlackAdapter } from "harnessgate/platforms";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

const bridge = new Bridge(provider, {
  provider: { type: "claude" },
});

bridge.addPlatform(new SlackAdapter());

bridge.setUserResolver(async (sender) => ({
  userId: sender.id,
  agentId: process.env.AGENT_ID!,
  environmentId: process.env.ENVIRONMENT_ID!,
}));

await bridge.connect("slack", {
  botToken: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
});

console.log("HarnessGate running — Slack bot is listening");
