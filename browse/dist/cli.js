#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = path.resolve(process.cwd(), ".codex-stack");
const STATE_DIR = path.join(ROOT_DIR, "browse");
const STATE_PATH = path.join(STATE_DIR, "state.json");
const SESSION_DIR = path.join(STATE_DIR, "sessions");
const FLOW_DIR = path.join(STATE_DIR, "flows");

function usage() {
  console.log(`codex-stack browse

Usage:
  codex-stack browse doctor
  codex-stack browse status [--session <name>]
  codex-stack browse sessions
  codex-stack browse flows
  codex-stack browse save-flow <name> <json-steps>
  codex-stack browse show-flow <name>
  codex-stack browse delete-flow <name>
  codex-stack browse clear-session [name]
  codex-stack browse text <url> [--session <name>]
  codex-stack browse html <url> [selector] [--session <name>]
  codex-stack browse links <url> [--session <name>]
  codex-stack browse screenshot <url> [path] [--session <name>]
  codex-stack browse eval <url> <expression> [--session <name>]
  codex-stack browse click <url> <selector> [--session <name>]
  codex-stack browse fill <url> <selector> <value> [--session <name>]
  codex-stack browse wait <url> [selector|ms:<n>|url:<target>] [--session <name>]
  codex-stack browse press <url> <selector> <key> [--session <name>]
  codex-stack browse flow <url> <json-steps> [--session <name>]
  codex-stack browse run-flow <url> <name> [--session <name>]
  codex-stack browse login <url> <name> [--session <name>]
`);
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readState() {
  return readJson(STATE_PATH, { sessions: {} });
}

function writeState(payload) {
  writeJson(STATE_PATH, payload);
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
      authenticated: false,
      lastFlow: "",
    },
  };
}

function sessionProfileDir(name) {
  return path.join(SESSION_DIR, name);
}

function flowPath(name) {
  return path.join(FLOW_DIR, `${name}.json`);
}

function assertFlowName(name) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    console.error("Flow names may only contain letters, numbers, dot, underscore, and dash.");
    process.exit(1);
  }
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

function parseFlow(jsonText) {
  try {
    const steps = JSON.parse(jsonText);
    return Array.isArray(steps) ? steps : null;
  } catch {
    return null;
  }
}

function listNamedFlows() {
  ensureDir(FLOW_DIR);
  return fs.readdirSync(FLOW_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const fullPath = path.join(FLOW_DIR, name);
      const steps = readJson(fullPath, []);
      return {
        name: name.replace(/\.json$/, ""),
        steps: Array.isArray(steps) ? steps.length : 0,
        path: fullPath,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function loadNamedFlow(name) {
  assertFlowName(name);
  const fullPath = flowPath(name);
  if (!fs.existsSync(fullPath)) {
    console.error(`Unknown flow: ${name}`);
    process.exit(1);
  }
  const steps = readJson(fullPath, []);
  if (!Array.isArray(steps)) {
    console.error(`Stored flow is invalid JSON array: ${name}`);
    process.exit(1);
  }
  return steps;
}

function saveNamedFlow(name, steps) {
  assertFlowName(name);
  writeJson(flowPath(name), steps);
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

async function executeStep(page, step, sessionName) {
  if (!step || typeof step !== "object") {
    return { action: "unknown", status: "skipped" };
  }

  const action = String(step.action || "");
  if (action === "goto") {
    await page.goto(String(step.url || ""), { waitUntil: "networkidle" });
    return { action, url: step.url, status: "ok" };
  }
  if (action === "click") {
    await page.locator(String(step.selector)).first().click();
    return { action, selector: step.selector, status: "ok" };
  }
  if (action === "fill") {
    await page.locator(String(step.selector)).first().fill(String(step.value || ""));
    return { action, selector: step.selector, status: "ok" };
  }
  if (action === "press") {
    await page.locator(String(step.selector)).first().press(String(step.key || "Enter"));
    return { action, selector: step.selector, key: step.key || "Enter", status: "ok" };
  }
  if (action === "wait") {
    if (step.selector) {
      await page.locator(String(step.selector)).first().waitFor({ state: "visible" });
      return { action, selector: step.selector, status: "ok" };
    }
    if (step.url) {
      await page.waitForURL(String(step.url));
      return { action, url: step.url, status: "ok" };
    }
    if (typeof step.ms === "number") {
      await page.waitForTimeout(step.ms);
      return { action, ms: step.ms, status: "ok" };
    }
    await page.waitForLoadState("networkidle");
    return { action, status: "ok" };
  }
  if (action === "screenshot") {
    const target = String(step.path || path.join(os.tmpdir(), `codex-stack-flow-${sessionName}.png`));
    await page.screenshot({ path: target, fullPage: true });
    return { action, path: target, status: "ok" };
  }
  if (action === "text") {
    const text = await page.locator(String(step.selector || "body")).first().innerText();
    return { action, selector: step.selector || "body", text, status: "ok" };
  }
  if (action === "html") {
    const html = step.selector
      ? await page.locator(String(step.selector)).first().innerHTML()
      : await page.content();
    return { action, selector: step.selector || "document", html, status: "ok" };
  }

  return { action, status: "unsupported" };
}

async function executeFlow({ sessionName, url, steps, recordName, authenticated = false }) {
  const results = await withPage(sessionName, url, async ({ page }) => {
    const entries = [];
    for (const step of steps) {
      entries.push(await executeStep(page, step, sessionName));
    }
    return entries;
  });
  recordSession(sessionName, {
    lastCommand: recordName,
    lastUrl: url,
    lastFlow: recordName,
    authenticated,
    output: `${steps.length} steps`,
  });
  return results;
}

const parsed = parseGlobalArgs(process.argv.slice(2));
const { command, rest, session } = parsed;

if (command === "doctor") {
  const playwrightInstalled = fs.existsSync(path.resolve(process.cwd(), "node_modules", "playwright"));
  console.log("codex-stack browse runtime");
  console.log(`- playwright package: ${playwrightInstalled ? "installed" : "missing"}`);
  console.log(`- state file: ${STATE_PATH}`);
  console.log(`- session root: ${SESSION_DIR}`);
  console.log(`- flow root: ${FLOW_DIR}`);
  console.log("- session model: persistent browser profile per named session");
  console.log("- commands: sessions, flows, save-flow, show-flow, delete-flow, text, html, links, screenshot, eval, click, fill, wait, press, flow, run-flow, login");
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

if (command === "flows") {
  console.log(JSON.stringify(listNamedFlows(), null, 2));
  process.exit(0);
}

if (command === "save-flow") {
  const [name, jsonSteps] = rest;
  if (!name || !jsonSteps) usage();
  const steps = parseFlow(jsonSteps);
  if (!steps) {
    console.error("Invalid JSON steps. Example: [{\"action\":\"click\",\"selector\":\"button\"}]");
    process.exit(1);
  }
  saveNamedFlow(name, steps);
  console.log(`saved flow ${name}`);
  process.exit(0);
}

if (command === "show-flow") {
  const [name] = rest;
  if (!name) usage();
  console.log(JSON.stringify(loadNamedFlow(name), null, 2));
  process.exit(0);
}

if (command === "delete-flow") {
  const [name] = rest;
  if (!name) usage();
  assertFlowName(name);
  fs.rmSync(flowPath(name), { force: true });
  console.log(`deleted flow ${name}`);
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
  recordSession(session, { lastCommand: "text", lastUrl: url, output: `${text.length} chars` });
  console.log(text);
  process.exit(0);
}

if (command === "html") {
  const [url, selector] = rest;
  if (!url) usage();
  const html = await withPage(session, url, async ({ page }) => (selector ? page.locator(selector).first().innerHTML() : page.content()));
  recordSession(session, { lastCommand: "html", lastUrl: url, output: `${html.length} chars` });
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
  recordSession(session, { lastCommand: "links", lastUrl: url, output: `${links.length} links` });
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
  const result = await withPage(session, url, async ({ page }) => page.evaluate((expressionText) => eval(expressionText), expression));
  recordSession(session, { lastCommand: "eval", lastUrl: url });
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "click") {
  const [url, selector] = rest;
  if (!url || !selector) usage();
  await withPage(session, url, async ({ page }) => {
    await page.locator(selector).first().click();
  });
  recordSession(session, { lastCommand: "click", lastUrl: url, output: selector });
  console.log(`clicked ${selector}`);
  process.exit(0);
}

if (command === "fill") {
  const [url, selector, value] = rest;
  if (!url || !selector || value === undefined) usage();
  await withPage(session, url, async ({ page }) => {
    await page.locator(selector).first().fill(value);
  });
  recordSession(session, { lastCommand: "fill", lastUrl: url, output: selector });
  console.log(`filled ${selector}`);
  process.exit(0);
}

if (command === "wait") {
  const [url, target] = rest;
  if (!url) usage();
  await withPage(session, url, async ({ page }) => {
    if (!target) {
      await page.waitForLoadState("networkidle");
      return;
    }
    if (target.startsWith("ms:")) {
      await page.waitForTimeout(Number(target.slice(3)) || 0);
      return;
    }
    if (target.startsWith("url:")) {
      await page.waitForURL(target.slice(4));
      return;
    }
    await page.locator(target).first().waitFor({ state: "visible" });
  });
  recordSession(session, { lastCommand: "wait", lastUrl: url, output: target || "networkidle" });
  console.log(`waited for ${target || "networkidle"}`);
  process.exit(0);
}

if (command === "press") {
  const [url, selector, key] = rest;
  if (!url || !selector || !key) usage();
  await withPage(session, url, async ({ page }) => {
    await page.locator(selector).first().press(key);
  });
  recordSession(session, { lastCommand: "press", lastUrl: url, output: `${selector}:${key}` });
  console.log(`pressed ${key} on ${selector}`);
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
  const out = await executeFlow({
    sessionName: session,
    url,
    steps,
    recordName: "flow:inline",
  });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (command === "run-flow" || command === "login") {
  const [url, name] = rest;
  if (!url || !name) usage();
  const steps = loadNamedFlow(name);
  const out = await executeFlow({
    sessionName: session,
    url,
    steps,
    recordName: `${command}:${name}`,
    authenticated: command === "login",
  });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

usage();
