#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const STATE_DIR = path.join(os.tmpdir(), "codex-stack");
const STATE_PATH = path.join(STATE_DIR, "browse-state.json");

function usage() {
  console.log(`codex-stack browse

Usage:
  codex-stack browse doctor
  codex-stack browse status
  codex-stack browse text <url>
  codex-stack browse html <url> [selector]
  codex-stack browse links <url>
  codex-stack browse screenshot <url> [path]
  codex-stack browse eval <url> <expression>
  codex-stack browse flow <url> <json-steps>
`);
  process.exit(1);
}

function state() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { lastCommand: "", lastUrl: "", updatedAt: "" };
  }
}

function writeState(payload) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2));
}

async function loadPlaywright() {
  try {
    const mod = await import("playwright");
    return mod;
  } catch {
    return null;
  }
}

async function withPage(url, callback) {
  const playwright = await loadPlaywright();
  if (!playwright) {
    console.error("Playwright is not installed. Run `npm install` and `npx playwright install chromium`.");
    process.exit(1);
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (/machport|permission denied|sandbox|Target page, context or browser has been closed/i.test(message)) {
      console.error("Unable to launch Chromium in the current sandboxed environment.");
      console.error("Run the same command in a normal local shell after `npx playwright install chromium`.");
      process.exit(1);
    }
    throw error;
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  try {
    return await callback({ page, context, browser });
  } finally {
    await browser.close();
  }
}

function parseFlow(jsonText) {
  try {
    const steps = JSON.parse(jsonText);
    return Array.isArray(steps) ? steps : null;
  } catch {
    return null;
  }
}

const [, , command = "doctor", ...rest] = process.argv;

if (command === "doctor") {
  const playwrightInstalled = fs.existsSync(path.resolve(process.cwd(), "node_modules", "playwright"));
  console.log("codex-stack browse runtime");
  console.log(`- playwright package: ${playwrightInstalled ? "installed" : "missing"}`);
  console.log(`- state file: ${STATE_PATH}`);
  console.log("- commands: text, html, links, screenshot, eval, flow");
  console.log("- browser install: run `npx playwright install chromium` after npm install");
  process.exit(0);
}

if (command === "status") {
  console.log(JSON.stringify(state(), null, 2));
  process.exit(0);
}

if (command === "text") {
  const url = rest[0];
  if (!url) usage();
  const text = await withPage(url, async ({ page }) => page.locator("body").innerText());
  writeState({ lastCommand: "text", lastUrl: url, updatedAt: new Date().toISOString() });
  console.log(text);
  process.exit(0);
}

if (command === "html") {
  const [url, selector] = rest;
  if (!url) usage();
  const html = await withPage(url, async ({ page }) => (selector ? page.locator(selector).first().innerHTML() : page.content()));
  writeState({ lastCommand: "html", lastUrl: url, updatedAt: new Date().toISOString() });
  console.log(html);
  process.exit(0);
}

if (command === "links") {
  const url = rest[0];
  if (!url) usage();
  const links = await withPage(url, async ({ page }) =>
    page.$$eval("a[href]", (anchors) =>
      anchors.map((anchor) => ({
        text: (anchor.textContent || "").trim(),
        href: anchor.href,
      }))
    )
  );
  writeState({ lastCommand: "links", lastUrl: url, updatedAt: new Date().toISOString() });
  console.log(JSON.stringify(links, null, 2));
  process.exit(0);
}

if (command === "screenshot") {
  const url = rest[0];
  const outPath = rest[1] || path.join(os.tmpdir(), "codex-stack-browse.png");
  if (!url) usage();
  await withPage(url, async ({ page }) => page.screenshot({ path: outPath, fullPage: true }));
  writeState({ lastCommand: "screenshot", lastUrl: url, updatedAt: new Date().toISOString(), output: outPath });
  console.log(outPath);
  process.exit(0);
}

if (command === "eval") {
  const [url, expression] = rest;
  if (!url || !expression) usage();
  const result = await withPage(url, async ({ page }) => page.evaluate(expressionText => eval(expressionText), expression));
  writeState({ lastCommand: "eval", lastUrl: url, updatedAt: new Date().toISOString() });
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "flow") {
  const [url, jsonSteps] = rest;
  if (!url || !jsonSteps) usage();
  const steps = parseFlow(jsonSteps);
  if (!steps) {
    console.error("Invalid JSON steps. Example: [{\"action\":\"click\",\"selector\":\"button\"}]");
    process.exit(1);
  }
  const out = await withPage(url, async ({ page }) => {
    const results = [];
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const action = String(step.action || "");
      if (action === "click") {
        await page.locator(String(step.selector)).first().click();
        results.push({ action, selector: step.selector, status: "ok" });
        continue;
      }
      if (action === "fill") {
        await page.locator(String(step.selector)).first().fill(String(step.value || ""));
        results.push({ action, selector: step.selector, status: "ok" });
        continue;
      }
      if (action === "wait") {
        await page.locator(String(step.selector)).first().waitFor({ state: "visible" });
        results.push({ action, selector: step.selector, status: "ok" });
        continue;
      }
      if (action === "screenshot") {
        const target = String(step.path || path.join(os.tmpdir(), "codex-stack-flow.png"));
        await page.screenshot({ path: target, fullPage: true });
        results.push({ action, path: target, status: "ok" });
        continue;
      }
      results.push({ action, status: "unsupported" });
    }
    return results;
  });
  writeState({ lastCommand: "flow", lastUrl: url, updatedAt: new Date().toISOString(), steps: steps.length });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

usage();
