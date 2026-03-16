#!/usr/bin/env bun
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const inspect = spawnSync(process.execPath || "bun", ["src/cli.ts", "mcp", "inspect", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
assert.equal(inspect.status, 0, inspect.stderr || "Expected mcp inspect to succeed.");
const manifest = JSON.parse(inspect.stdout || "{}") as {
  server?: { transport?: string; mutationPolicy?: string };
  tools?: Array<{ name?: string }>;
  resources?: Array<{ uri?: string }>;
  resourceTemplates?: Array<{ uriTemplate?: string }>;
};
assert.equal(manifest.server?.transport, "stdio");
assert.equal(manifest.server?.mutationPolicy, "read-only-plus-dry-run");
assert.ok(manifest.tools?.some((tool) => tool.name === "codex_stack_review_diff"));
assert.ok(manifest.tools?.some((tool) => tool.name === "codex_stack_fleet_validate"));
assert.ok(manifest.resources?.some((resource) => resource.uri === "codex-stack://qa/published/index.json"));
assert.ok(manifest.resourceTemplates?.some((resource) => resource.uriTemplate === "codex-stack://skills/{mode}"));

const client = new Client({ name: "codex-stack-mcp-spec", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath || "bun",
  args: ["src/cli.ts", "mcp", "serve"],
  cwd: process.cwd(),
  stderr: "pipe",
});
await client.connect(transport);

const tools = await client.listTools();
assert.ok(tools.tools.some((tool) => tool.name === "codex_stack_ship_plan"));
assert.ok(tools.tools.some((tool) => tool.name === "codex_stack_upgrade_check"));

const resources = await client.listResources();
assert.ok(resources.resources.some((resource) => resource.uri === "codex-stack://modes"));
assert.ok(resources.resources.some((resource) => resource.uri === "codex-stack://skills/review"));
assert.ok(resources.resources.some((resource) => resource.uri === "codex-stack://qa/published/release-readiness-demo/report.json"));

const skillResource = await client.readResource({ uri: "codex-stack://skills/review" });
const skillText = "text" in skillResource.contents[0] ? skillResource.contents[0].text : "";
assert.match(skillText, /review/i);

const qaReport = await client.readResource({ uri: "codex-stack://qa/published/release-readiness-demo/report.json" });
const qaText = "text" in qaReport.contents[0] ? qaReport.contents[0].text : "{}";
const qaPayload = JSON.parse(qaText) as { status?: string; healthScore?: number };
assert.equal(qaPayload.status, "warning");
assert.equal(qaPayload.healthScore, 14);

const fleetValidate = await client.callTool({
  name: "codex_stack_fleet_validate",
  arguments: { manifest: ".codex-stack/fleet.example.json" },
});
assert.equal(fleetValidate.isError, false);
const structured = (fleetValidate.structuredContent || {}) as { ok?: boolean; result?: { controlRepo?: unknown } };
assert.equal(structured.ok, true);
assert.ok(structured.result && typeof structured.result === "object" && "controlRepo" in structured.result);

await client.close();
await transport.close();
console.log("mcp-server spec passed");
