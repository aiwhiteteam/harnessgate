/**
 * Example: Using HarnessGate as a library in your own Node.js app.
 *
 * Install:
 *   npm install @harnessgate/core @harnessgate/provider-claude @harnessgate/platform-web
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY   — your Anthropic API key
 */

import { Bridge, type BridgeConfig } from "@harnessgate/core";
import { ClaudeProvider } from "@harnessgate/provider-claude";
import { WebAdapter } from "@harnessgate/platform-web";

// 1. Create provider
const provider = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);

// 2. Define config
const config: BridgeConfig = {
  provider: { type: "claude" },
  platforms: { web: { port: 3000 } },
};

// 3. Create bridge
const bridge = new Bridge(provider, config);

// 4. Optional: add user auth + per-user agent routing
bridge.setUserResolver(async (sender, _platform, _message) => {
  // Replace with your own DB lookup
  console.log(`User connected: ${sender.id}`);
  return {
    userId: sender.id,
    agentId: "agent_01XXXX",         // from your DB
    environmentId: "env_01XXXX",     // from your DB
  };
});

// 5. Optional: listen to all provider events
bridge.onEvent((sessionId, event) => {
  if (event.type === "raw") {
    console.log(`Raw event from ${sessionId}:`, event.eventType);
  }
});

// 6. Add platforms
bridge.addPlatform(new WebAdapter());

// 7. Start
await bridge.start();
console.log("HarnessGate running — open http://localhost:3000");
