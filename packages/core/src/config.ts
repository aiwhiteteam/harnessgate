import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { LogLevel } from "./logger.js";

const ChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
}).passthrough();

const ConfigSchema = z.object({
  provider: z.object({
    type: z.string(),
  }).passthrough(),
  channels: z.record(z.string(), ChannelConfigSchema).default({}),
  auth: z
    .object({
      /** Webhook URL for user validation. Bridge POSTs sender info, expects allow/deny. */
      webhook: z.string().optional(),
      /** HMAC secret for signing webhook requests. */
      secret: z.string().optional(),
    })
    .default({}),
  session: z
    .object({
      maxIdleMs: z.number().default(3_600_000),
    })
    .default({}),
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    })
    .default({}),
});

export type HarnessGateConfig = z.infer<typeof ConfigSchema>;

/** Replace ${VAR} with process.env.VAR in all string values. */
function interpolateEnv(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{(\w+)\}/g, (_, name: string) => {
      return process.env[name] ?? "";
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateEnv);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateEnv(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(filePath: string): HarnessGateConfig {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  const interpolated = interpolateEnv(parsed);
  return ConfigSchema.parse(interpolated);
}

export function getLogLevel(config: HarnessGateConfig): LogLevel {
  return config.logging.level;
}

export function getEnabledChannels(
  config: HarnessGateConfig,
): Array<{ id: string; config: Record<string, unknown> }> {
  return Object.entries(config.channels)
    .filter(([_, channelConfig]) => channelConfig.enabled)
    .map(([id, channelConfig]) => ({ id, config: channelConfig }));
}
