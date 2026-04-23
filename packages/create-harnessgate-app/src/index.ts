#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import pc from "picocolors";
import { collectConfig } from "./prompts.js";
import { packageJson, tsconfig, dotenv } from "./templates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(__dirname, "..", "templates");

const projectName = process.argv[2];
const config = await collectConfig(projectName);
const projectDir = path.resolve(process.cwd(), config.projectName);

// Check if directory already exists
if (fs.existsSync(projectDir)) {
  const entries = fs.readdirSync(projectDir);
  if (entries.length > 0) {
    console.error(pc.red(`  Directory "${config.projectName}" already exists and is not empty.`));
    process.exit(1);
  }
}

// Create project structure
fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });

// 1. Write generated files (dynamic JSON/.env)
const generated: [string, string][] = [
  ["package.json", packageJson(config)],
  ["tsconfig.json", tsconfig()],
  [".env", dotenv(config)],
];

for (const [filePath, content] of generated) {
  fs.writeFileSync(path.join(projectDir, filePath), content, "utf-8");
  console.log(pc.dim(`  created ${filePath}`));
}

// 2. Copy base templates
copyFile(path.join(templatesDir, "base", "gitignore"), path.join(projectDir, ".gitignore"));

// 3. Copy variant-specific templates (simple or supabase)
const variant = config.useSupabase ? "supabase" : "default";
const variantDir = path.join(templatesDir, variant);

// Copy platform main.ts
const platformMainSrc = path.join(variantDir, config.platform, "src", "main.ts");
copyTemplate(platformMainSrc, path.join(projectDir, "src", "main.ts"), {
  "{{PORT}}": config.platformCredentials.port || "3000",
});

// Copy supabase-specific files
if (config.useSupabase) {
  // src/supabase.ts
  copyFile(
    path.join(variantDir, "src", "supabase.ts"),
    path.join(projectDir, "src", "supabase.ts"),
  );

  // src/api.ts
  copyFile(
    path.join(variantDir, "src", "api.ts"),
    path.join(projectDir, "src", "api.ts"),
  );

  // openapi.json (at project root — read by api.ts at runtime)
  copyTemplate(
    path.join(variantDir, "src", "openapi.json"),
    path.join(projectDir, "openapi.json"),
    { "{{ADMIN_PORT}}": config.adminPort || "4000" },
  );

  // supabase/schema.sql
  fs.mkdirSync(path.join(projectDir, "supabase"), { recursive: true });
  copyFile(
    path.join(variantDir, "supabase", "schema.sql"),
    path.join(projectDir, "supabase", "schema.sql"),
  );
}

// Install dependencies
console.log();
console.log(pc.dim("  Installing dependencies..."));
console.log();

const pkgManager = detectPackageManager();

try {
  execSync(`${pkgManager} install`, { cwd: projectDir, stdio: "inherit" });
} catch {
  console.log();
  console.log(pc.yellow(`  Could not install dependencies. Run "${pkgManager} install" manually.`));
}

// Done
console.log();
console.log(pc.green(pc.bold("  Done!")) + " Your HarnessGate project is ready.");
console.log();
console.log(pc.dim("  Next steps:"));
console.log();
console.log(`  ${pc.cyan("cd")} ${config.projectName}`);
console.log(`  ${pc.dim("# Edit .env with your real credentials")}`);
if (config.useSupabase) {
  console.log(`  ${pc.dim("# Run supabase/schema.sql in your Supabase SQL editor")}`);
  console.log(`  ${pc.dim("# Insert your apps, users, platform_identities, and user_agent_access rows")}`);
}
console.log(`  ${pc.cyan(`${pkgManager} run build`)}`);
console.log(`  ${pc.cyan(`${pkgManager} run start`)}`);
console.log();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function copyFile(src: string, dest: string): void {
  fs.copyFileSync(src, dest);
  console.log(pc.dim(`  created ${path.relative(projectDir, dest)}`));
}

function copyTemplate(src: string, dest: string, vars: Record<string, string>): void {
  let content = fs.readFileSync(src, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(key, value);
  }
  fs.writeFileSync(dest, content, "utf-8");
  console.log(pc.dim(`  created ${path.relative(projectDir, dest)}`));
}

function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent || "";
  if (userAgent.startsWith("pnpm")) return "pnpm";
  if (userAgent.startsWith("yarn")) return "yarn";
  if (userAgent.startsWith("bun")) return "bun";
  return "npm";
}
