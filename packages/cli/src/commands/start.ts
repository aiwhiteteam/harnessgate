import {
  loadConfig,
  getEnabledChannels,
  getLogLevel,
  setLogLevel,
  Bridge,
  createLogger,
  createWebhookResolver,
  type ChannelAdapter,
  type Provider,
} from "@harnessgate/core";
import { ClaudeProvider } from "@harnessgate/provider-claude";
import { HttpProvider } from "@harnessgate/provider-http";
import { WebAdapter } from "@harnessgate/channel-web";
import { TelegramAdapter } from "@harnessgate/channel-telegram";
import { DiscordAdapter } from "@harnessgate/channel-discord";
import { SlackAdapter } from "@harnessgate/channel-slack";

const log = createLogger("cli");

/** Registry of built-in channel adapter factories. */
const CHANNEL_REGISTRY: Record<string, () => ChannelAdapter> = {
  web: () => new WebAdapter(),
  telegram: () => new TelegramAdapter(),
  discord: () => new DiscordAdapter(),
  slack: () => new SlackAdapter(),
};

/** Built-in provider factories. */
const BUILTIN_PROVIDERS: Record<string, (config: Record<string, unknown>) => Provider> = {
  claude: (config) => new ClaudeProvider(config.apiKey as string),
  http: (config) => new HttpProvider(config),
};

/**
 * Resolve a provider by type.
 * Built-in types: "claude", "http"
 * External: npm package name or local file path (must default-export a Provider class)
 */
async function resolveProvider(
  type: string,
  config: Record<string, unknown>,
): Promise<Provider> {
  // Built-in provider
  const builtin = BUILTIN_PROVIDERS[type];
  if (builtin) return builtin(config);

  // External provider: npm package or local file
  // Expects: export default class MyProvider implements Provider { constructor(config) {} }
  try {
    log.info(`Loading external provider: ${type}`);
    const mod = await import(type) as { default: new (config: Record<string, unknown>) => Provider };
    if (!mod.default) {
      throw new Error(`Provider "${type}" must have a default export`);
    }
    return new mod.default(config);
  } catch (err) {
    throw new Error(`Failed to load provider "${type}": ${err}`);
  }
}

export async function startCommand(configPath: string): Promise<void> {
  log.info(`Loading config from ${configPath}`);
  const config = loadConfig(configPath);
  setLogLevel(getLogLevel(config));

  // Create provider
  const provider = await resolveProvider(config.provider.type, config.provider);
  log.info(`Provider: ${provider.id}`);

  // Create bridge
  const bridge = new Bridge(provider, config);

  // Set up auth if configured
  if (config.auth.webhook) {
    log.info(`Auth webhook configured: ${config.auth.webhook}`);
    bridge.setUserResolver(createWebhookResolver(config.auth.webhook, config.auth.secret));
  }

  // Register enabled channels
  const enabledChannels = getEnabledChannels(config);
  if (enabledChannels.length === 0) {
    log.error("No channels enabled. Enable at least one channel in config.");
    process.exit(1);
  }

  for (const { id } of enabledChannels) {
    const factory = CHANNEL_REGISTRY[id];
    if (!factory) {
      log.warn(`Unknown channel "${id}", skipping. Available: ${Object.keys(CHANNEL_REGISTRY).join(", ")}`);
      continue;
    }
    bridge.addChannel(factory());
  }

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Shutting down...");
    await bridge.stop();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start
  await bridge.start();
}
