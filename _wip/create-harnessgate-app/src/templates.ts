import type { ProjectConfig } from "./prompts.js";

// ---------------------------------------------------------------------------
// package.json (dynamic — depends on platform + supabase choice)
// ---------------------------------------------------------------------------

export function packageJson(config: ProjectConfig): string {
  const deps: Record<string, string> = {
    harnessgate: "^0.1.0",
  };

  if (config.useSupabase) {
    deps["@supabase/supabase-js"] = "^2.49.0";
  }

  return JSON.stringify(
    {
      name: config.projectName,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        build: "tsc",
        start: "node dist/main.js",
        dev: "tsc --watch",
      },
      dependencies: deps,
      devDependencies: {
        typescript: "^5.7.0",
        "@types/node": "^22.0.0",
      },
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// tsconfig.json (static but small enough to keep as JSON)
// ---------------------------------------------------------------------------

export function tsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        outDir: "dist",
        rootDir: "src",
        strict: true,
        esModuleInterop: true,
        declaration: true,
        sourceMap: true,
        skipLibCheck: true,
      },
      include: ["src"],
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// .env (dynamic — different fields per mode)
// ---------------------------------------------------------------------------

export function dotenv(config: ProjectConfig): string {
  const lines = [`ANTHROPIC_API_KEY=${config.anthropicApiKey}`];

  if (config.useSupabase) {
    lines.push(`SUPABASE_URL=${config.supabaseUrl}`);
    lines.push(`SUPABASE_SERVICE_KEY=${config.supabaseServiceKey}`);
    lines.push(`ADMIN_PORT=${config.adminPort || "4000"}`);
    lines.push(`ADMIN_API_KEY=`);
    if (config.platform === "web") {
      lines.push(`PORT=${config.platformCredentials.port || "3000"}`);
    }
  } else {
    lines.push(`AGENT_ID=${config.agentId}`);
    lines.push(`ENVIRONMENT_ID=${config.environmentId}`);

    if (config.platform === "telegram") {
      lines.push(`TELEGRAM_BOT_TOKEN=${config.platformCredentials.botToken}`);
    } else if (config.platform === "discord") {
      lines.push(`DISCORD_BOT_TOKEN=${config.platformCredentials.botToken}`);
    } else if (config.platform === "slack") {
      lines.push(`SLACK_BOT_TOKEN=${config.platformCredentials.botToken}`);
      lines.push(`SLACK_APP_TOKEN=${config.platformCredentials.appToken}`);
    } else if (config.platform === "web") {
      lines.push(`PORT=${config.platformCredentials.port || "3000"}`);
    }
  }

  return lines.join("\n") + "\n";
}
