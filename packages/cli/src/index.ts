#!/usr/bin/env node

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startCommand } from "./commands/start.js";

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`
HarnessGate - Universal AI Agent Gateway

Usage:
  harnessgate start [--config <path>]    Start the gateway
  harnessgate help                       Show this help

Options:
  --config, -c    Path to config file (default: harnessgate.yaml)
`);
}

async function main(): Promise<void> {
  switch (command) {
    case "start": {
      let configPath = "harnessgate.yaml";

      const configIdx = args.indexOf("--config");
      const configShortIdx = args.indexOf("-c");
      const idx = configIdx !== -1 ? configIdx : configShortIdx;
      if (idx !== -1 && args[idx + 1]) {
        configPath = args[idx + 1];
      }

      configPath = resolve(configPath);

      if (!existsSync(configPath)) {
        console.error(`Config file not found: ${configPath}`);
        console.error("Copy harnessgate.example.yaml to harnessgate.yaml and configure it.");
        process.exit(1);
      }

      await startCommand(configPath);
      break;
    }

    case "help":
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
