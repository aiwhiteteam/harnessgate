import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import pc from "picocolors";

export interface ProjectConfig {
  projectName: string;
  platform: "telegram" | "discord" | "slack" | "web";
  anthropicApiKey: string;
  agentId: string;
  environmentId: string;
  platformCredentials: Record<string, string>;
  useSupabase: boolean;
  supabaseUrl: string;
  supabaseServiceKey: string;
  adminPort: string;
}

const PLATFORMS = [
  { key: "1", value: "telegram" as const, label: "Telegram", desc: "Telegram bot via grammY" },
  { key: "2", value: "discord" as const, label: "Discord", desc: "Discord bot via discord.js" },
  { key: "3", value: "slack" as const, label: "Slack", desc: "Slack app via Bolt (socket mode)" },
  { key: "4", value: "web" as const, label: "Web", desc: "Web chat UI (HTTP + SSE)" },
] as const;

async function ask(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? pc.dim(` (${defaultValue})`) : "";
  const answer = await rl.question(`${pc.cyan("?")} ${question}${suffix} `);
  return answer.trim() || defaultValue || "";
}

async function askRequired(rl: readline.Interface, question: string): Promise<string> {
  while (true) {
    const answer = await ask(rl, question);
    if (answer) return answer;
    console.log(pc.red("  This field is required."));
  }
}

export async function collectConfig(argProjectName?: string): Promise<ProjectConfig> {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    console.log();
    console.log(pc.bold("  create-harnessgate-app"));
    console.log(pc.dim("  Scaffold a HarnessGate project in seconds."));
    console.log();

    // Project name
    const projectName = argProjectName || await askRequired(rl, "Project name:");

    // Platform selection
    console.log();
    console.log(pc.cyan("?") + " Which platform?");
    for (const p of PLATFORMS) {
      console.log(pc.dim(`  ${p.key}) `) + pc.bold(p.label) + pc.dim(` — ${p.desc}`));
    }
    let platform: ProjectConfig["platform"] | undefined;
    while (!platform) {
      const choice = await ask(rl, "Enter choice (1-4):", "4");
      const match = PLATFORMS.find((p) => p.key === choice || p.value === choice.toLowerCase());
      if (match) {
        platform = match.value;
      } else {
        console.log(pc.red("  Invalid choice. Enter 1-4."));
      }
    }
    console.log(pc.dim(`  → ${platform}`));

    // Supabase
    console.log();
    const supabaseAnswer = await ask(rl, "Include Supabase for multi-tenant auth + routing? (y/N):", "N");
    const useSupabase = supabaseAnswer.toLowerCase() === "y" || supabaseAnswer.toLowerCase() === "yes";

    let supabaseUrl = "";
    let supabaseServiceKey = "";
    let anthropicApiKey = "";
    let agentId = "";
    let environmentId = "";
    const platformCredentials: Record<string, string> = {};

    if (useSupabase) {
      // Supabase mode: agent/env/tokens come from the apps table
      console.log();
      console.log(pc.bold("  Credentials") + pc.dim(" (stored in .env)"));
      console.log();
      anthropicApiKey = await ask(rl, "Anthropic API key:", "sk-ant-...");
      supabaseUrl = await ask(rl, "Supabase project URL:", "https://xxx.supabase.co");
      supabaseServiceKey = await ask(rl, "Supabase service role key:", "eyJ...");
      if (platform === "web") {
        platformCredentials.port = await ask(rl, "Port:", "3000");
      }
      platformCredentials.adminPort = await ask(rl, "Admin API port:", "4000");
      console.log();
      console.log(pc.dim("  Agent IDs, environment IDs, and bot tokens are stored in the Supabase apps table."));
      console.log(pc.dim("  Use the Admin API to manage apps, users, and access grants."));
    } else {
      // Simple mode: single bot, env vars for everything
      console.log();
      console.log(pc.bold("  Credentials") + pc.dim(" (stored in .env, leave blank to fill later)"));
      console.log();
      anthropicApiKey = await ask(rl, "Anthropic API key:", "sk-ant-...");
      agentId = await ask(rl, "Agent ID:", "agent_01XXXX");
      environmentId = await ask(rl, "Environment ID:", "env_01XXXX");

      if (platform === "telegram") {
        platformCredentials.botToken = await ask(rl, "Telegram bot token:", "YOUR_BOT_TOKEN");
      } else if (platform === "discord") {
        platformCredentials.botToken = await ask(rl, "Discord bot token:", "YOUR_BOT_TOKEN");
      } else if (platform === "slack") {
        platformCredentials.botToken = await ask(rl, "Slack bot token (xoxb-...):", "xoxb-...");
        platformCredentials.appToken = await ask(rl, "Slack app token (xapp-...):", "xapp-...");
      } else if (platform === "web") {
        platformCredentials.port = await ask(rl, "Port:", "3000");
      }
    }

    console.log();
    console.log(pc.green("  Ready to scaffold!"));
    console.log();

    return {
      projectName,
      platform,
      anthropicApiKey,
      agentId,
      environmentId,
      platformCredentials,
      useSupabase,
      supabaseUrl,
      supabaseServiceKey,
      adminPort: platformCredentials.adminPort || "4000",
    };
  } finally {
    rl.close();
  }
}
