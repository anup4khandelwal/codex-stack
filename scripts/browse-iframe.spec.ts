#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browse-iframe-"));
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
class FakeLocator {
  constructor(owner, kind, value, extra = "") { this.owner = owner; this.kind = kind; this.value = value; this.extra = extra; }
  first() { return this; }
  async click() { append({ action: "click", owner: this.owner, kind: this.kind, value: this.value, extra: this.extra }); }
  async fill(text) { append({ action: "fill", owner: this.owner, kind: this.kind, value: this.value, extra: this.extra, text }); }
  async waitFor(options) { append({ action: "waitFor", owner: this.owner, kind: this.kind, value: this.value, state: options?.state || "visible" }); }
  async innerText() { return this.kind === "text" ? this.value : this.extra || this.value; }
  async innerHTML() { return "<div>stub</div>"; }
  async count() { return 1; }
  async isEnabled() { return true; }
  async isDisabled() { return false; }
  async isChecked() { return false; }
  async isEditable() { return true; }
  async evaluate(fn) {
    const previousDocument = globalThis.document;
    const current = { owner: this.owner, kind: this.kind, value: this.value };
    globalThis.document = { activeElement: current };
    try { return fn(current); } finally { globalThis.document = previousDocument; }
  }
  async contentFrame() {
    if (this.owner === "page" && this.kind === "css" && this.value === "iframe#embedded") {
      return selectorFrame;
    }
    return null;
  }
}
function makeScope(owner, frameUrl = "") {
  return {
    owner,
    currentUrl: frameUrl,
    locator(selector) { append({ action: "locator", owner, selector }); return new FakeLocator(owner, "css", selector); },
    getByRole(role, options = {}) { append({ action: "getByRole", owner, role, name: options.name || "" }); return new FakeLocator(owner, "role", role, options.name || ""); },
    getByLabel(text) { append({ action: "getByLabel", owner, text }); return new FakeLocator(owner, "label", text); },
    getByPlaceholder(text) { append({ action: "getByPlaceholder", owner, text }); return new FakeLocator(owner, "placeholder", text); },
    getByText(text) { append({ action: "getByText", owner, text }); return new FakeLocator(owner, "text", text); },
    getByTestId(value) { append({ action: "getByTestId", owner, value }); return new FakeLocator(owner, "testid", value); },
    async waitForURL(url) { this.currentUrl = url; append({ action: "waitForURL", owner, url }); },
    async waitForLoadState(state) { append({ action: "waitForLoadState", owner, state }); },
    async content() { return "<html></html>"; },
    async evaluate(fn, arg) { return typeof fn === "function" ? fn(arg) : null; },
    async title() { return owner; },
    url() { return this.currentUrl; },
  };
}
const namedFrame = makeScope("frame:name:auth", "https://frames.example.com/auth");
const urlFrame = makeScope("frame:url:checkout-provider", "https://frames.example.com/checkout-provider/embed");
const selectorFrame = makeScope("frame:selector:iframe#embedded", "https://frames.example.com/embedded");
const page = {
  ...makeScope("page", "https://example.com"),
  async goto(url, options = {}) { this.currentUrl = url; append({ action: "goto", owner: "page", url, waitUntil: options.waitUntil || "" }); return { status: () => 200, ok: () => true }; },
  async setViewportSize(size) { append({ action: "viewport", width: size.width, height: size.height }); },
  async screenshot(options) { fs.writeFileSync(options.path, "stub"); append({ action: "screenshot", owner: "page", path: options.path }); },
  once() {},
  frame(options = {}) { if (options.name === "auth") return namedFrame; return null; },
  frames() { return [namedFrame, urlFrame, selectorFrame]; },
};
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

  runBrowse(["click", "https://example.com/login", "role:button:Continue", "--session", "iframe", "--frame", "name:auth"]);
  runBrowse(["fill", "https://example.com/checkout", "label:Email", "buyer@example.com", "--session", "iframe", "--frame", "url:checkout-provider"]);
  runBrowse(["assert-visible", "https://example.com/home", "testid:hero", "--session", "iframe", "--frame", "iframe#embedded"]);
  const flowOutput = runBrowse([
    "flow",
    "https://example.com/widget",
    JSON.stringify([{ action: "assert-text", selector: "text:Frame ready", text: "Frame ready", frame: "name:auth" }]),
    "--session",
    "iframe",
  ]);

  const flowResults = JSON.parse(flowOutput) as Array<{ action?: string; frame?: string; status?: string }>;
  assert.ok(flowResults.some((entry) => entry.action === "assert-text" && entry.frame === "name:auth" && entry.status === "ok"));

  const log = JSON.parse(fs.readFileSync(logPath, "utf8")) as Array<Record<string, unknown>>;
  assert.ok(log.some((entry) => entry.action === "getByRole" && entry.owner === "frame:name:auth" && entry.role === "button" && entry.name === "Continue"));
  assert.ok(log.some((entry) => entry.action === "getByLabel" && entry.owner === "frame:url:checkout-provider" && entry.text === "Email"));
  assert.ok(log.some((entry) => entry.action === "locator" && entry.owner === "page" && entry.selector === "iframe#embedded"));
  assert.ok(log.some((entry) => entry.action === "getByTestId" && entry.owner === "frame:selector:iframe#embedded" && entry.value === "hero"));
  assert.ok(log.some((entry) => entry.action === "getByText" && entry.owner === "frame:name:auth" && entry.text === "Frame ready"));

  console.log("browse-iframe spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
