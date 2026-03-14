#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browse-download-"));
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
import path from "node:path";
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
  async innerText() { return this.extra || this.value; }
  async waitFor() {}
  async count() { return 1; }
  async isEnabled() { return true; }
  async isDisabled() { return false; }
  async isChecked() { return false; }
  async isEditable() { return true; }
  async evaluate() { return true; }
}
class FakePage {
  constructor() { this.currentUrl = ""; }
  locator(selector) { return new FakeLocator("css", selector); }
  getByRole(role, options = {}) { append({ action: "getByRole", role, name: options.name || "" }); return new FakeLocator("role", role, options.name || ""); }
  getByLabel(text) { return new FakeLocator("label", text); }
  getByPlaceholder(text) { return new FakeLocator("placeholder", text); }
  getByText(text) { return new FakeLocator("text", text); }
  getByTestId(value) { return new FakeLocator("testid", value); }
  async goto(url, options = {}) { this.currentUrl = url; append({ action: "goto", url, waitUntil: options.waitUntil || "" }); return { status: () => 200, ok: () => true }; }
  async waitForEvent(event) {
    append({ action: "waitForEvent", event });
    return {
      suggestedFilename() { return "report.csv"; },
      async saveAs(targetPath) { fs.mkdirSync(path.dirname(targetPath), { recursive: true }); fs.writeFileSync(targetPath, "stub report\\n"); append({ action: "saveAs", path: targetPath }); },
    };
  }
  async waitForURL(url) { this.currentUrl = url; }
  async waitForTimeout(ms) { append({ action: "waitForTimeout", ms }); }
  async waitForLoadState(state) { append({ action: "waitForLoadState", state }); }
  async title() { return "Stub"; }
  url() { return this.currentUrl; }
  async screenshot(options) { fs.writeFileSync(options.path, "stub"); }
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

  const downloadPath = path.join(fixtureRoot, "report-direct.csv");
  const directOutput = runBrowse([
    "download",
    "https://example.com/reports",
    "role:button:Export CSV",
    downloadPath,
    "--session",
    "download",
  ]);
  const directResult = JSON.parse(directOutput) as { path?: string; suggestedFilename?: string };
  assert.equal(directResult.path, downloadPath);
  assert.equal(directResult.suggestedFilename, "report.csv");
  assert.ok(fs.existsSync(downloadPath));

  const assertPath = path.join(fixtureRoot, "report-assert.csv");
  const assertOutput = runBrowse([
    "assert-download",
    "https://example.com/reports",
    "role:button:Export CSV",
    "report.csv",
    assertPath,
    "--session",
    "download",
  ]);
  const assertResult = JSON.parse(assertOutput) as { expected?: string; path?: string };
  assert.equal(assertResult.expected, "report.csv");
  assert.equal(assertResult.path, assertPath);
  assert.ok(fs.existsSync(assertPath));

  const flowOutput = runBrowse([
    "flow",
    "https://example.com/reports",
    JSON.stringify([
      { action: "download", selector: "role:button:Export CSV", path: "./flow-report.csv" },
      { action: "assert-download", selector: "role:button:Export CSV", expected: "report.csv", path: "./flow-assert.csv" },
    ]),
    "--session",
    "download",
  ]);
  const flowResults = JSON.parse(flowOutput) as Array<{ action?: string; path?: string; status?: string }>;
  assert.ok(flowResults.some((entry) => entry.action === "download" && entry.status === "ok"));
  assert.ok(flowResults.some((entry) => entry.action === "assert-download" && entry.status === "ok"));
  assert.ok(fs.existsSync(path.join(fixtureRoot, "flow-report.csv")));
  assert.ok(fs.existsSync(path.join(fixtureRoot, "flow-assert.csv")));

  const log = JSON.parse(fs.readFileSync(logPath, "utf8")) as Array<Record<string, unknown>>;
  assert.ok(log.some((entry) => entry.action === "waitForEvent" && entry.event === "download"));
  assert.ok(log.some((entry) => entry.action === "getByRole" && entry.role === "button" && entry.name === "Export CSV"));
  assert.ok(log.some((entry) => entry.action === "saveAs" && String(entry.path).includes("report-direct.csv")));
  assert.ok(log.some((entry) => entry.action === "saveAs" && String(entry.path).includes("flow-assert.csv")));

  console.log("browse-download spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
