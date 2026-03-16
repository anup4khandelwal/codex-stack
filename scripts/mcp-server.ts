#!/usr/bin/env bun
import process from "node:process";
import { inspectMcp, serveMcp } from "../src/mcp/server.ts";

function usage(): never {
  console.log(`mcp-server

Usage:
  bun scripts/mcp-server.ts serve
  bun scripts/mcp-server.ts inspect --json
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (!command) usage();
  if (command === "serve") {
    await serveMcp();
    return;
  }
  if (command === "inspect") {
    const asJson = rest.includes("--json");
    const payload = inspectMcp();
    process.stdout.write(asJson ? `${JSON.stringify(payload, null, 2)}\n` : `${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  usage();
}

main().catch((error) => {
  console.error("codex-stack MCP server failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
