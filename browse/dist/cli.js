#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = path.resolve(process.cwd(), ".codex-stack");
const STATE_DIR = path.join(ROOT_DIR, "browse");
const STATE_PATH = path.join(STATE_DIR, "state.json");
const SESSION_DIR = path.join(STATE_DIR, "sessions");

function usage() {
  console.log(`codex-stack browse

Usage:
  codex-stack browse doctor
  codex-stack browse status [--session <name>]
  codex-stack browse sessions
  codex-stack browse clear-session [name]
  codex-stack browse text <url> [--session <name>]
  codex-stack browse html <url> [selector] [--session <name>]
  codex-stack browse links <url> [--session <name>]
  codex-stack browse screenshot <url> [path] [--session <name>]
  codex-stack browse eval <url> <expression> [--session <name>]
  codex-stack browse flow <url> <json-steps> [--session <name>]
`);
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { sessions: {} };
  }
}

function writeState(payload) {
  ensureDir(STATE_DIR);
  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2));
}

function getSessionState(name) {
  const full = readState();
  return {
    full,
    session: full.sessions?.[name] || {
      name,
      updatedAt: "",
      lastCommand: "",
      lastUrl: "",
      output: "",
    },
  };
}

function sessionProfileDir(name) {
  return path.join(SESSION_DIR, name);
}

function parseGlobalArgs(argv) {
  const out = { session: "default", command: "", rest: [] };
  const copy = [...argv];
  out.command = copy.shift() || "doctor";

  while (copy.length) {
    const item = copy.shift();
    if (item === "--session") {
      out.session = copy.shift() || "default";
      continue;
    }
    out.rest.push(item);
  }
  return out;
}

async function loadPlaywright() {
  try {
    const mod = await import("playwright");
    return mod;
  } catch {
    return null;
  }
}

async function withPage(sessionName, url, callback) {
  const playwright = await loadPlaywright();
  if (!playwright) {
    console.error("Playwright is not installed. Run `npm install` and `npx playwright install chromium`.");
    process.exit(1);
  }

  ensureDir(SESSION_DIR);
  const userDataDir = sessionProfileDir(sessionName);

  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, { headless: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (/machport|permission denied|sandbox|Target page, context or browser has been closed/i.test(message)) {
      console.error("Unable to launch Chromium in the current sandboxed environment.");
      console.error("Run the same command in a normal local shell after `npx playwright install chromium`.");
      process.exit(1);
    }
    throw error;
  }

  const page = context.pages()[0] || (await context.newPage());
  if (url) {
    await page.goto(url, { waitUntil: "networkidle" });
  }

  try {
    return await callback({ page, context });
  } finally {
    await context.close();
  }
}

function recordSession(sessionName, patch) {
  const state = readState();
  if (!state.sessions) state.sessions = {};
  state.sessions[sessionName] = {
    ...(state.sessions[sessionName] || { name: sessionName }),
    ...patch,
    name: sessionName,
    updatedAt: new Date().toISOString(),
  };
  writeState(state);
}

function parseFlow(jsonText) {
  try {
    const steps = JSON.parse(jsonText);
    return Array.isArray(steps) ? steps : null;
  } catch {
    return null;
  }
}

const parsed = parseGlobalArgs(process.argv.slice(2));
const { command, rest, session } = parsed;

if (command === "doctor") {
  const playwrightInstalled = fs.existsSync(path.resolve(process.cwd(), "node_modules", "playwright"));
  console.log("codex-stack browse runtime");
  console.log(`- playwright package: ${playwrightInstalled ? "installed" : "missing"}`);
  console.log(`- state file: ${STATE_PATH}`);
  console.log(`- session root: ${SESSION_DIR}`);
  console.log("- session model: persistent browser profile per named session");
  console.log("- commands: sessions, clear-session, text, html, links, screenshot, eval, flow");
  console.log("- browser install: run `npx playwright install chromium` after npm install");
  process.exit(0);
}

if (command === "status") {
  const { session: sessionState } = getSessionState(session);
  console.log(JSON.stringify(sessionState, null, 2));
  process.exit(0);
}

if (command === "sessions") {
  const state = readState();
  const rows = Object.values(state.sessions || {}).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

if (command === "clear-session") {
  const targetSession = rest[0] || session;
  const state = readState();
  if (state.sessions?.[targetSession]) {
    delete state.sessions[targetSession];
    writeState(state);
  }
  fs.rmSync(sessionProfileDir(targetSession), { recursive: true, force: true });
  console.log(`cleared session ${targetSession}`);
  process.exit(0);
}

if (command === "text") {
  const url = rest[0];
  if (!url) usage();
  const text = await withPage(session, url, async ({ page }) => page.locator("body").innerText());
  recordSession(session, { lastCommand: "text", lastUrl: url });
  console.log(text);
  process.exit(0);
}

if (command === "html") {
  const [url, selector] = rest;
  if (!url) usage();
  const html = await withPage(session, url, async ({ page }) => (selector ? page.locator(selector).first().innerHTML() : page.content()));
  recordSession(session, { lastCommand: "html", lastUrl: url });
  console.log(html);
  process.exit(0);
}

if (command === "links") {
  const url = rest[0];
  if (!url) usage();
  const links = await withPage(session, url, async ({ page }) =>
    page.$$eval("a[href]", (anchors) =>
      anchors.map((anchor) => ({
        text: (anchor.textContent || "").trim(),
        href: anchor.href,
      }))
    )
  );
  recordSession(session, { lastCommand: "links", lastUrl: url });
  console.log(JSON.stringify(links, null, 2));
  process.exit(0);
}

if (command === "screenshot") {
  const url = rest[0];
  const outPath = rest[1] || path.join(os.tmpdir(), `codex-stack-browse-${session}.png`);
  if (!url) usage();
  await withPage(session, url, async ({ page }) => page.screenshot({ path: outPath, fullPage: true }));
  recordSession(session, { lastCommand: "screenshot", lastUrl: url, output: outPath });
  console.log(outPath);
  process.exit(0);
}

if (command === "eval") {
  const [url, expression] = rest;
  if (!url || !expression) usage();
  const result = await withPage(session, url, async ({ page }) => page.evaluate(expressionText => eval(expressionText), expression));
  recordSession(session, { lastCommand: "eval", lastUrl: url });
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
  const out = await withPage(session, url, async ({ page }) => {
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
        const target = String(step.path || path.join(os.tmpdir(), `codex-stack-flow-${session}.png`));
        await page.screenshot({ path: target, fullPage: true });
        results.push({ action, path: target, status: "ok" });
        continue;
      }
      results.push({ action, status: "unsupported" });
    }
    return results;
  });
  recordSession(session, { lastCommand: "flow", lastUrl: url, steps: steps.length });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

usage();
