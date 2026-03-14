#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browse-semantic-"));
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
  constructor(kind, value, extra = "") { this.kind = kind; this.value = value; this.extra = extra; }
  first() { return this; }
  async click() { append({ action: "click", kind: this.kind, value: this.value, extra: this.extra }); }
  async fill(text) { append({ action: "fill", kind: this.kind, value: this.value, extra: this.extra, text }); }
  async press(key) { append({ action: "press", kind: this.kind, value: this.value, extra: this.extra, key }); }
  async waitFor(options) { append({ action: "waitFor", kind: this.kind, value: this.value, extra: this.extra, state: options?.state || "visible" }); }
  async setInputFiles(files) { append({ action: "setInputFiles", kind: this.kind, value: this.value, extra: this.extra, files: Array.isArray(files) ? files : [files] }); }
  async innerText() { return this.kind === "text" ? this.value : this.extra || this.value; }
  async innerHTML() { return "<div>stub</div>"; }
  async count() { return 1; }
  async isEnabled() { return true; }
  async isDisabled() { return false; }
  async isChecked() { return false; }
  async isEditable() { return true; }
  async evaluate(fn) {
    const previousDocument = globalThis.document;
    const current = { kind: this.kind, value: this.value, extra: this.extra };
    globalThis.document = { activeElement: current };
    try { return fn(current); } finally { globalThis.document = previousDocument; }
  }
}
class FakePage {
  constructor() { this.currentUrl = ""; }
  locator(selector) { append({ action: "locator", selector }); return new FakeLocator("css", selector); }
  getByRole(role, options = {}) { append({ action: "getByRole", role, name: options.name || "" }); return new FakeLocator("role", role, options.name || ""); }
  getByLabel(text) { append({ action: "getByLabel", text }); return new FakeLocator("label", text); }
  getByPlaceholder(text) { append({ action: "getByPlaceholder", text }); return new FakeLocator("placeholder", text); }
  getByText(text) { append({ action: "getByText", text }); return new FakeLocator("text", text); }
  getByTestId(value) { append({ action: "getByTestId", value }); return new FakeLocator("testid", value); }
  async setViewportSize(size) { append({ action: "viewport", width: size.width, height: size.height }); }
  async goto(url, options = {}) { this.currentUrl = url; append({ action: "goto", url, waitUntil: options.waitUntil || "" }); return { status: () => 200, ok: () => true }; }
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

  runBrowse(["click", "https://example.com/login", "role:button:Continue", "--session", "semantic", "--device", "mobile"]);
  runBrowse(["fill", "https://example.com/login", "label:Email", "demo@example.com", "--session", "semantic"]);
  runBrowse(["html", "https://example.com/search", "placeholder:Search", "--session", "semantic"]);
  runBrowse(["assert-visible", "https://example.com/home", "testid:hero", "--session", "semantic"]);
  runBrowse(["assert-text", "https://example.com/home", "text:Welcome back", "Welcome back", "--session", "semantic"]);
  runBrowse(["wait", "https://example.com/home", "state:hidden:testid:toast", "--session", "semantic"]);

  const log = JSON.parse(fs.readFileSync(logPath, "utf8")) as Array<Record<string, unknown>>;
  assert.ok(log.some((entry) => entry.action === "viewport" && entry.width === 390 && entry.height === 844));
  assert.ok(log.some((entry) => entry.action === "getByRole" && entry.role === "button" && entry.name === "Continue"));
  assert.ok(log.some((entry) => entry.action === "getByLabel" && entry.text === "Email"));
  assert.ok(log.some((entry) => entry.action === "getByPlaceholder" && entry.text === "Search"));
  assert.ok(log.some((entry) => entry.action === "getByTestId" && entry.value === "hero"));
  assert.ok(log.some((entry) => entry.action === "getByText" && entry.text === "Welcome back"));
  assert.ok(log.some((entry) => entry.action === "waitFor" && entry.kind === "testid" && entry.value === "toast" && entry.state === "hidden"));

  console.log("browse-semantic-device spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
