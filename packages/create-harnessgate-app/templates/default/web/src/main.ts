import { Bridge } from "harnessgate";
import { ClaudeProvider } from "harnessgate/providers";
import { WebAdapter } from "harnessgate/platforms";

const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

const bridge = new Bridge(provider, {
  provider: { type: "claude" },
  platforms: { web: { port: Number(process.env.PORT) || {{PORT}} } },
});

bridge.addPlatform(new WebAdapter());

bridge.setUserResolver(async (sender) => ({
  userId: sender.id,
  agentId: process.env.AGENT_ID!,
  environmentId: process.env.ENVIRONMENT_ID!,
}));

await bridge.start();
console.log("HarnessGate running — open http://localhost:" + (process.env.PORT || {{PORT}}));
