#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browse-advanced-"));
const uploadPath = path.join(fixtureRoot, "upload.txt");
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
  fs.writeFileSync(uploadPath, "demo upload\n");
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
  constructor(page, selector) { this.page = page; this.selector = selector; }
  first() { return this; }
  async click() {
    append({ action: "click", selector: this.selector });
    if (this.page.dialogHandler && this.selector === "#dialog-button") {
      const handler = this.page.dialogHandler;
      this.page.dialogHandler = null;
      await handler({
        accept: async (value) => append({ action: "dialog-accept", value: value || "" }),
        dismiss: async () => append({ action: "dialog-dismiss" }),
      });
    }
    if (this.selector === "#focus") this.page.activeSelector = this.selector;
  }
  async fill(value) { append({ action: "fill", selector: this.selector, value }); }
  async press(key) { append({ action: "press", selector: this.selector, key }); }
  async waitFor(options) { append({ action: "waitFor", selector: this.selector, state: options?.state || "visible" }); }
  async setInputFiles(files) { append({ action: "setInputFiles", selector: this.selector, files: Array.isArray(files) ? files : [files] }); }
  async innerText() { return this.selector === "body" ? "Example Domain" : this.selector; }
  async count() { return 1; }
  async isEnabled() { return this.selector !== "#disabled"; }
  async isDisabled() { return this.selector === "#disabled"; }
  async isChecked() { return this.selector === "#checked"; }
  async isEditable() { return this.selector === "#editable"; }
  async evaluate(fn) {
    const element = { selector: this.selector };
    const previousDocument = globalThis.document;
    globalThis.document = { activeElement: this.page.activeSelector === this.selector ? element : { selector: this.page.activeSelector } };
    try { return fn(element); } finally { globalThis.document = previousDocument; }
  }
}
class FakePage {
  constructor() { this.currentUrl = ""; this.dialogHandler = null; this.activeSelector = "#focus"; }
  locator(selector) { return new FakeLocator(this, selector); }
  async goto(url, options = {}) { this.currentUrl = url; append({ action: "goto", url, waitUntil: options.waitUntil || "" }); return { status: () => 200, ok: () => true }; }
  async waitForURL(url) { this.currentUrl = url; append({ action: "waitForURL", url }); }
  async waitForTimeout(ms) { append({ action: "waitForTimeout", ms }); }
  async waitForLoadState(state) { append({ action: "waitForLoadState", state }); }
  async title() { return "Stub"; }
  url() { return this.currentUrl; }
  async screenshot(options) { fs.writeFileSync(options.path, "stub"); append({ action: "screenshot", path: options.path }); }
  async content() { return "<html></html>"; }
  async evaluate(fn, arg) { return typeof fn === "function" ? fn(arg) : null; }
  once(event, handler) { if (event === "dialog") { this.dialogHandler = handler; append({ action: "dialog-armed" }); } }
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

  const flowOutput = runBrowse([
    "flow",
    "https://example.com/login",
    JSON.stringify([
      { action: "dialog", mode: "dismiss" },
      { action: "click", selector: "#dialog-button" },
      { action: "upload", selector: "#file", path: uploadPath },
      { action: "wait", loadState: "load" },
      { action: "wait", selector: "#toast", state: "hidden" },
      { action: "assert-hidden", selector: "#hidden" },
    ]),
    "--session",
    "advanced",
  ]);
  const flowResults = JSON.parse(flowOutput) as Array<{ action?: string; mode?: string; files?: string[] }>;
  assert.ok(flowResults.some((entry) => entry.action === "dialog" && entry.mode === "dismiss"));
  assert.ok(flowResults.some((entry) => entry.action === "upload"));

  runBrowse(["assert-enabled", "https://example.com/settings", "#enabled", "--session", "advanced"]);
  runBrowse(["assert-disabled", "https://example.com/settings", "#disabled", "--session", "advanced"]);
  runBrowse(["assert-checked", "https://example.com/settings", "#checked", "--session", "advanced"]);
  runBrowse(["assert-editable", "https://example.com/settings", "#editable", "--session", "advanced"]);
  runBrowse(["assert-focused", "https://example.com/settings", "#focus", "--session", "advanced"]);
  runBrowse(["wait", "https://example.com/settings", "load:domcontentloaded", "--session", "advanced"]);
  runBrowse(["wait", "https://example.com/settings", "state:hidden:#toast", "--session", "advanced"]);

  const log = JSON.parse(fs.readFileSync(logPath, "utf8")) as Array<Record<string, unknown>>;
  assert.ok(log.some((entry) => entry.action === "dialog-armed"));
  assert.ok(log.some((entry) => entry.action === "dialog-dismiss"));
  assert.ok(log.some((entry) => entry.action === "setInputFiles" && Array.isArray(entry.files) && String(entry.files[0]).includes("upload.txt")));
  assert.ok(log.some((entry) => entry.action === "waitForLoadState" && entry.state === "load"));
  assert.ok(log.some((entry) => entry.action === "waitFor" && entry.selector === "#toast" && entry.state === "hidden"));

  console.log("browse-advanced spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
