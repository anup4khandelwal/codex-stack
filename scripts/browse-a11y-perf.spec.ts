#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browse-a11y-perf-"));
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
      CODEX_STACK_AXE_SOURCE: "window.axe={run: async () => ({violations:[],passes:[],incomplete:[]})};",
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
  constructor() {
    this.currentUrl = "";
    this.handlers = {};
  }
  on(name, callback) {
    if (!this.handlers[name]) this.handlers[name] = [];
    this.handlers[name].push(callback);
  }
  async addScriptTag(options) {
    append({ action: "addScriptTag", hasContent: Boolean(options?.content) });
  }
  async evaluateOnNewDocument(fn) {
    append({ action: "evaluateOnNewDocument", registered: true });
  }
  async goto(url, options = {}) {
    this.currentUrl = url;
    append({ action: "goto", url, waitUntil: options.waitUntil || "" });
    if (Array.isArray(this.handlers.requestfailed)) {
      for (const callback of this.handlers.requestfailed) {
        callback({ url: () => "https://example.com/static/chunk.js" });
      }
    }
    return { status: () => 200, ok: () => true };
  }
  async waitForTimeout(ms) {
    append({ action: "waitForTimeout", ms });
  }
  async evaluate(fn, arg) {
    append({ action: "evaluate", marker: arg?.marker || "", impact: arg?.impact || "", scopes: arg?.selectors || [] });
    if (arg?.marker === "codex-stack-a11y") {
      return {
        finalUrl: this.currentUrl,
        title: "Preview dashboard",
        violations: [
          {
            id: "color-contrast",
            impact: "serious",
            description: "Text contrast is too low.",
            help: "Elements must meet minimum color contrast ratio thresholds",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
            nodes: [{ target: ["#hero-title"] }],
          },
        ],
        passesCount: 8,
        incompleteCount: 1,
      };
    }
    if (arg?.marker === "codex-stack-perf") {
      return {
        finalUrl: this.currentUrl,
        title: "Preview dashboard",
        ttfb: 120,
        domContentLoaded: 540,
        loadEvent: 880,
        fcp: 310,
        lcp: 2550,
        cls: 0.21,
        jsHeapUsed: 10485760,
        resourceCount: 14,
      };
    }
    return null;
  }
  async title() { return "Preview dashboard"; }
  url() { return this.currentUrl; }
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

  const a11yOutput = runBrowse([
    "a11y",
    "https://example.com/dashboard",
    "--scope",
    "#app",
    "--impact",
    "serious",
    "--session",
    "insights",
    "--device",
    "mobile",
  ]);
  const a11y = JSON.parse(a11yOutput) as {
    minimumImpact?: string;
    scopeSelectors?: string[];
    violationCount?: number;
    topRules?: string[];
    violations?: Array<{ id?: string; selectors?: string[] }>;
  };
  assert.equal(a11y.minimumImpact, "serious");
  assert.deepEqual(a11y.scopeSelectors, ["#app"]);
  assert.equal(a11y.violationCount, 1);
  assert.ok(a11y.topRules?.some((item) => String(item).includes("color-contrast")));
  assert.equal(a11y.violations?.[0]?.id, "color-contrast");
  assert.deepEqual(a11y.violations?.[0]?.selectors, ["#hero-title"]);

  const perfOutput = runBrowse([
    "perf",
    "https://example.com/dashboard",
    "--budget",
    "lcp=2s",
    "--budget",
    "cls=0.1",
    "--budget",
    "failedResourceCount=0",
    "--wait-ms",
    "400",
    "--session",
    "insights",
    "--device",
    "desktop",
  ]);
  const perf = JSON.parse(perfOutput) as {
    waitMs?: number;
    budgetViolationCount?: number;
    topViolations?: string[];
    metrics?: { lcp?: number; cls?: number; failedResourceCount?: number };
    budgets?: Array<{ metric?: string; passed?: boolean; severity?: string }>;
  };
  assert.equal(perf.waitMs, 400);
  assert.equal(perf.metrics?.lcp, 2550);
  assert.equal(perf.metrics?.cls, 0.21);
  assert.equal(perf.metrics?.failedResourceCount, 1);
  assert.equal(perf.budgetViolationCount, 3);
  assert.ok(perf.topViolations?.some((item) => String(item).includes("LCP")));
  assert.ok(perf.budgets?.some((item) => item.metric === "lcp" && item.passed === false && item.severity === "high"));
  assert.ok(perf.budgets?.some((item) => item.metric === "cls" && item.passed === false && item.severity === "high"));
  assert.ok(perf.budgets?.some((item) => item.metric === "failedResourceCount" && item.passed === false && item.severity === "high"));

  const log = JSON.parse(fs.readFileSync(logPath, "utf8")) as Array<Record<string, unknown>>;
  assert.ok(log.some((entry) => entry.action === "addScriptTag" && entry.hasContent === true));
  assert.ok(log.some((entry) => entry.action === "evaluate" && entry.marker === "codex-stack-a11y" && Array.isArray(entry.scopes)));
  assert.ok(log.some((entry) => entry.action === "evaluateOnNewDocument"));
  assert.ok(log.some((entry) => entry.action === "waitForTimeout" && entry.ms === 400));

  console.log("browse-a11y-perf spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
