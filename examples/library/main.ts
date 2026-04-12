/**
 * Example: Using HarnessGate as a library in your own Node.js app.
 *
 * npm install @harnessgate/core @harnessgate/provider-claude @harnessgate/channel-web @harnessgate/channel-telegram
 */

import { Bridge, type HarnessGateConfig } from "@harnessgate/core";
import { ClaudeProvider } from "@harnessgate/provider-claude";
import { WebAdapter } from "@harnessgate/channel-web";

// 1. Create provider
const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

// 2. Define config
const config: HarnessGateConfig = {
  provider: {
    type: "claude",
    agentId: process.env.AGENT_ID!,
    environmentId: process.env.ENVIRONMENT_ID!,
  },
  channels: {
    web: { enabled: true, port: 3000 },
  },
  auth: {},
  session: { maxIdleMs: 3_600_000 },
  logging: { level: "info" },
};

// 3. Create bridge
const bridge = new Bridge(provider, config);

// 4. Optional: add user auth
bridge.setUserResolver(async (sender, _channel) => {
  // Replace with your own DB lookup
  console.log(`User connected: ${sender.id}`);
  return { userId: sender.id };
});

// 5. Optional: listen to all provider events
bridge.onEvent((sessionId, event) => {
  if (event.type === "raw") {
    console.log(`Raw event from ${sessionId}:`, event.eventType);
  }
});

// 6. Add channels
bridge.addChannel(new WebAdapter());

// 7. Start
await bridge.start();
console.log("HarnessGate running — open http://localhost:3000");
