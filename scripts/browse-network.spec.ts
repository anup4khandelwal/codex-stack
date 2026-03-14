#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browse-network-"));
const logPath = path.join(fixtureRoot, "playwright-log.json");
const modulePath = path.join(fixtureRoot, "playwright-stub.mjs");

function runBrowse(args: string[]): string {
  return execFileSync(bun, [path.join(rootDir, "browse", "src", "cli.ts"), ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_STACK_PLAYWRIGHT_MODULE: modulePath,
      CODEX_STACK_PLAYWRIGHT_LOG: logPath,
    },
  }).trim();
}

async function main(): Promise<void> {
  fs.writeFileSync(
    modulePath,
    `import fs from "node:fs";
const LOG_PATH = process.env.CODEX_STACK_PLAYWRIGHT_LOG;
function append(entry) {
  const rows = fs.existsSync(LOG_PATH) ? JSON.parse(fs.readFileSync(LOG_PATH, "utf8")) : [];
  rows.push(entry);
  fs.writeFileSync(LOG_PATH, JSON.stringify(rows, null, 2));
}
class FakePage {
  constructor() { this.currentUrl = ""; this.routes = []; }
  locator(selector) { return { first: () => ({ innerText: async () => selector, waitFor: async () => {}, count: async () => 1, isEnabled: async () => true, isDisabled: async () => false, isChecked: async () => false, isEditable: async () => true, evaluate: async () => true }) }; }
  getByRole(role, options = {}) { return { first: () => ({ click: async () => append({ action: "getByRole-click", role, name: options.name || "" }) }) }; }
  getByLabel(text) { return { first: () => ({ fill: async (value) => append({ action: "getByLabel-fill", text, value }) }) }; }
  getByPlaceholder(text) { return { first: () => ({ innerHTML: async () => text }) }; }
  getByText(text) { return { first: () => ({ innerText: async () => text, waitFor: async () => append({ action: "getByText-wait", text }) }) }; }
  getByTestId(value) { return { first: () => ({ waitFor: async (options) => append({ action: "getByTestId-wait", value, state: options?.state || "visible" }) }) }; }
  async route(pattern, handler) { this.routes.push({ pattern, handler }); append({ action: "route-registered", pattern }); }
  async unrouteAll() { this.routes = []; append({ action: "unrouteAll" }); }
  async goto(url, options = {}) {
    this.currentUrl = url;
    append({ action: "goto", url, waitUntil: options.waitUntil || "" });
    for (const entry of this.routes) {
      await entry.handler({
        abort: async (code) => append({ action: "route-abort", pattern: entry.pattern, code: code || "" }),
        continue: async () => append({ action: "route-continue", pattern: entry.pattern }),
        fulfill: async (payload) => append({ action: "route-fulfill", pattern: entry.pattern, status: payload.status, body: payload.body || "", headers: payload.headers || {} }),
      });
    }
    return { status: () => 200, ok: () => true };
  }
  async waitForURL(url) { this.currentUrl = url; append({ action: "waitForURL", url }); }
  async waitForTimeout(ms) { append({ action: "waitForTimeout", ms }); }
  async waitForLoadState(state) { append({ action: "waitForLoadState", state }); }
  async title() { return "Stub"; }
  url() { return this.currentUrl; }
  async screenshot(options) { fs.writeFileSync(options.path, "stub"); append({ action: "screenshot", path: options.path }); }
  async content() { return "<html></html>"; }
  async evaluate(fn, arg) { return typeof fn === "function" ? fn(arg) : null; }
  once() {}
}
const page = new FakePage();
const context = {
  pages() { return [page]; },
  async newPage() { return page; },
  async close() { append({ action: "close" }); },
  async storageState() { return { cookies: [], origins: [] }; },
  async clearCookies() {},
  async addCookies() {},
};
export const chromium = {
  async launchPersistentContext() {
    append({ action: "launch" });
    return context;
  }
};
`,
  );

  const mockOutput = runBrowse([
    "mock",
    "https://example.com/app",
    "**/api/profile",
    '{"status":503,"json":{"error":"offline"}}',
    "--session",
    "network",
  ]);
  const mockResult = JSON.parse(mockOutput) as { action?: string; mode?: string; status?: number };
  assert.equal(mockResult.action, "mock");
  assert.equal(mockResult.mode, "fulfill");
  assert.equal(mockResult.status, 503);

  const blockOutput = runBrowse([
    "block",
    "https://example.com/app",
    "**/analytics/**",
    "--session",
    "network",
  ]);
  const blockResult = JSON.parse(blockOutput) as { action?: string; mode?: string };
  assert.equal(blockResult.action, "block");
  assert.equal(blockResult.mode, "abort");

  const flowOutput = runBrowse([
    "flow",
    "https://example.com/app",
    JSON.stringify([
      { action: "route", pattern: "**/api/orders", json: { orders: [] } },
      { action: "clear-routes" },
      { action: "wait", ms: 1 },
    ]),
    "--session",
    "network",
  ]);
  const flowResults = JSON.parse(flowOutput) as Array<{ action?: string; status?: string; mode?: string }>;
  assert.ok(flowResults.some((entry) => entry.action === "route" && entry.mode === "fulfill" && entry.status === "ok"));
  assert.ok(flowResults.some((entry) => entry.action === "clear-routes" && entry.status === "ok"));

  const log = JSON.parse(fs.readFileSync(logPath, "utf8")) as Array<Record<string, unknown>>;
  assert.ok(log.some((entry) => entry.action === "route-registered" && entry.pattern === "**/api/profile"));
  assert.ok(log.some((entry) => entry.action === "route-fulfill" && entry.pattern === "**/api/profile" && entry.status === 503));
  assert.ok(log.some((entry) => entry.action === "route-abort" && entry.pattern === "**/analytics/**"));
  assert.ok(log.some((entry) => entry.action === "route-registered" && entry.pattern === "**/api/orders"));
  assert.ok(log.some((entry) => entry.action === "unrouteAll"));

  console.log("browse-network spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
