import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, getEnabledChannels, getLogLevel } from "./config.js";

describe("loadConfig", () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "harnessgate-test-"));
    configPath = join(dir, "harnessgate.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  it("parses a minimal valid config", () => {
    writeFileSync(configPath, `
provider:
  type: claude
channels: {}
`);
    const config = loadConfig(configPath);
    expect(config.provider.type).toBe("claude");
    expect(config.session.maxIdleMs).toBe(3_600_000);
    expect(config.logging.level).toBe("info");
  });

  it("interpolates environment variables", () => {
    process.env.TEST_API_KEY = "sk-test-123";
    writeFileSync(configPath, `
provider:
  type: claude
  apiKey: \${TEST_API_KEY}
`);
    const config = loadConfig(configPath);
    expect(config.provider.apiKey).toBe("sk-test-123");
    delete process.env.TEST_API_KEY;
  });

  it("replaces missing env vars with empty string", () => {
    delete process.env.NONEXISTENT_VAR;
    writeFileSync(configPath, `
provider:
  type: claude
  apiKey: \${NONEXISTENT_VAR}
`);
    const config = loadConfig(configPath);
    expect(config.provider.apiKey).toBe("");
  });

  it("uses defaults for optional fields", () => {
    writeFileSync(configPath, `
provider:
  type: http
`);
    const config = loadConfig(configPath);
    expect(config.session.maxIdleMs).toBe(3_600_000);
    expect(config.logging.level).toBe("info");
    expect(config.channels).toEqual({});
  });

  it("throws on missing provider.type", () => {
    writeFileSync(configPath, `
provider: {}
`);
    expect(() => loadConfig(configPath)).toThrow();
  });
});

describe("getEnabledChannels", () => {
  it("returns only enabled channels", () => {
    const config = {
      provider: { type: "claude" },
      channels: {
        web: { enabled: true, port: 3000 },
        telegram: { enabled: false, botToken: "" },
        discord: { enabled: true, token: "abc" },
      },
      auth: {},
      session: { maxIdleMs: 3600000 },
      logging: { level: "info" as const },
    };

    const enabled = getEnabledChannels(config);
    expect(enabled).toHaveLength(2);
    expect(enabled.map((c) => c.id)).toEqual(["web", "discord"]);
  });

  it("returns empty array when no channels enabled", () => {
    const config = {
      provider: { type: "claude" },
      channels: {},
      auth: {},
      session: { maxIdleMs: 3600000 },
      logging: { level: "info" as const },
    };

    expect(getEnabledChannels(config)).toHaveLength(0);
  });
});

describe("getLogLevel", () => {
  it("returns configured log level", () => {
    const config = {
      provider: { type: "claude" },
      channels: {},
      auth: {},
      session: { maxIdleMs: 3600000 },
      logging: { level: "debug" as const },
    };
    expect(getLogLevel(config)).toBe("debug");
  });
});
