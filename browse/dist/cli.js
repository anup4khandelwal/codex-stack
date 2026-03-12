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
const REPO_FLOW_DIR = path.resolve(process.cwd(), "browse", "flows");

function usage() {
  console.log(`codex-stack browse

Usage:
  codex-stack browse doctor
  codex-stack browse status [--session <name>]
  codex-stack browse sessions
  codex-stack browse flows
  codex-stack browse save-flow <name> <json-steps>
  codex-stack browse save-repo-flow <name> <json-steps>
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
  codex-stack browse assert-visible <url> <selector> [--session <name>]
  codex-stack browse assert-text <url> <selector> <expected> [--session <name>]
  codex-stack browse assert-url <url> <expected> [--session <name>]
  codex-stack browse assert-count <url> <selector> <expected-count> [--session <name>]
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

function repoFlowPath(name) {
  return path.join(REPO_FLOW_DIR, `${name}.json`);
}

function assertFlowName(name) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error("Flow names may only contain letters, numbers, dot, underscore, and dash.");
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

function readFlowDirectory(dirPath, source) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const fullPath = path.join(dirPath, name);
      const steps = readJson(fullPath, []);
      return {
        name: name.replace(/\.json$/, ""),
        steps: Array.isArray(steps) ? steps.length : 0,
        path: fullPath,
        source,
      };
    });
}

function listNamedFlows() {
  ensureDir(FLOW_DIR);
  const map = new Map();
  for (const entry of readFlowDirectory(REPO_FLOW_DIR, "repo")) {
    map.set(entry.name, entry);
  }
  for (const entry of readFlowDirectory(FLOW_DIR, "local")) {
    map.set(entry.name, entry);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function resolveNamedFlow(name) {
  assertFlowName(name);
  const localPath = flowPath(name);
  if (fs.existsSync(localPath)) {
    const steps = readJson(localPath, []);
    if (!Array.isArray(steps)) {
      throw new Error(`Stored local flow is invalid JSON array: ${name}`);
    }
    return { name, source: "local", path: localPath, steps };
  }

  const checkedInPath = repoFlowPath(name);
  if (fs.existsSync(checkedInPath)) {
    const steps = readJson(checkedInPath, []);
    if (!Array.isArray(steps)) {
      throw new Error(`Stored repo flow is invalid JSON array: ${name}`);
    }
    return { name, source: "repo", path: checkedInPath, steps };
  }

  throw new Error(`Unknown flow: ${name}`);
}

function loadNamedFlow(name) {
  return resolveNamedFlow(name).steps;
}

function saveNamedFlow(name, steps) {
  assertFlowName(name);
  writeJson(flowPath(name), steps);
}

function saveRepoFlow(name, steps) {
  assertFlowName(name);
  writeJson(repoFlowPath(name), steps);
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

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    throw new Error("Playwright is not installed. Run `npm install` and `npx playwright install chromium`.");
  }

  ensureDir(SESSION_DIR);
  const userDataDir = sessionProfileDir(sessionName);

  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, { headless: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (/machport|permission denied|sandbox|Target page, context or browser has been closed/i.test(message)) {
      throw new Error("Unable to launch Chromium in the current sandboxed environment. Run the same command in a normal local shell after `npx playwright install chromium`.");
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

async function runStep(page, step, sessionName) {
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
  if (action === "assert-visible") {
    const selector = String(step.selector || "");
    await page.locator(selector).first().waitFor({ state: "visible" });
    return { action, selector, status: "ok" };
  }
  if (action === "assert-text") {
    const selector = String(step.selector || "body");
    const expected = String(step.value ?? step.text ?? "");
    const text = await page.locator(selector).first().innerText();
    assertCondition(text.includes(expected), `Expected text ${JSON.stringify(expected)} in ${selector}.`);
    return { action, selector, expected, status: "ok" };
  }
  if (action === "assert-url") {
    const expected = String(step.value ?? step.url ?? "");
    const currentUrl = page.url();
    assertCondition(currentUrl.includes(expected), `Expected URL to include ${JSON.stringify(expected)} but got ${JSON.stringify(currentUrl)}.`);
    return { action, expected, currentUrl, status: "ok" };
  }
  if (action === "assert-count") {
    const selector = String(step.selector || "");
    const expectedCount = Number(step.count ?? step.value ?? 0);
    const count = await page.locator(selector).count();
    assertCondition(count === expectedCount, `Expected ${expectedCount} matches for ${selector} but got ${count}.`);
    return { action, selector, expectedCount, count, status: "ok" };
  }

  return { action, status: "unsupported" };
}

async function executeFlow({ sessionName, url, steps, recordName, authenticated = false }) {
  const results = await withPage(sessionName, url, async ({ page }) => {
    const entries = [];
    for (const step of steps) {
      entries.push(await runStep(page, step, sessionName));
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

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
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
    console.log("- commands: sessions, flows, save-flow, save-repo-flow, show-flow, delete-flow, text, html, links, screenshot, eval, click, fill, wait, press, assert-visible, assert-text, assert-url, assert-count, flow, run-flow, login");
    console.log(`- repo flow root: ${REPO_FLOW_DIR}`);
    console.log("- flow search order: local .codex-stack flow overrides checked-in repo flow with the same name");
    console.log("- browser install: run `npx playwright install chromium` after npm install");
    return;
  }

  if (command === "status") {
    const { session: sessionState } = getSessionState(session);
    printJson(sessionState);
    return;
  }

  if (command === "sessions") {
    const state = readState();
    const rows = Object.values(state.sessions || {}).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    printJson(rows);
    return;
  }

  if (command === "flows") {
    printJson(listNamedFlows());
    return;
  }

  if (command === "save-flow") {
    const [name, jsonSteps] = rest;
    if (!name || !jsonSteps) usage();
    const steps = parseFlow(jsonSteps);
    assertCondition(Boolean(steps), "Invalid JSON steps. Example: [{\"action\":\"click\",\"selector\":\"button\"}]");
    saveNamedFlow(name, steps);
    console.log(`saved flow ${name}`);
    return;
  }

  if (command === "save-repo-flow") {
    const [name, jsonSteps] = rest;
    if (!name || !jsonSteps) usage();
    const steps = parseFlow(jsonSteps);
    assertCondition(Boolean(steps), "Invalid JSON steps. Example: [{\"action\":\"click\",\"selector\":\"button\"}]");
    saveRepoFlow(name, steps);
    console.log(`saved repo flow ${name}`);
    return;
  }

  if (command === "show-flow") {
    const [name] = rest;
    if (!name) usage();
    printJson(resolveNamedFlow(name));
    return;
  }

  if (command === "delete-flow") {
    const [name] = rest;
    if (!name) usage();
    assertFlowName(name);
    const target = flowPath(name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
      console.log(`deleted flow ${name}`);
      return;
    }
    if (fs.existsSync(repoFlowPath(name))) {
      throw new Error(`Flow ${name} is checked into the repo. Edit or delete ${repoFlowPath(name)} directly.`);
    }
    throw new Error(`Unknown flow: ${name}`);
    return;
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
    return;
  }

  if (command === "text") {
    const url = rest[0];
    if (!url) usage();
    const text = await withPage(session, url, async ({ page }) => page.locator("body").innerText());
    recordSession(session, { lastCommand: "text", lastUrl: url, output: `${text.length} chars` });
    console.log(text);
    return;
  }

  if (command === "html") {
    const [url, selector] = rest;
    if (!url) usage();
    const html = await withPage(session, url, async ({ page }) => (selector ? page.locator(selector).first().innerHTML() : page.content()));
    recordSession(session, { lastCommand: "html", lastUrl: url, output: `${html.length} chars` });
    console.log(html);
    return;
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
    printJson(links);
    return;
  }

  if (command === "screenshot") {
    const url = rest[0];
    const outPath = rest[1] || path.join(os.tmpdir(), `codex-stack-browse-${session}.png`);
    if (!url) usage();
    await withPage(session, url, async ({ page }) => page.screenshot({ path: outPath, fullPage: true }));
    recordSession(session, { lastCommand: "screenshot", lastUrl: url, output: outPath });
    console.log(outPath);
    return;
  }

  if (command === "eval") {
    const [url, expression] = rest;
    if (!url || !expression) usage();
    const result = await withPage(session, url, async ({ page }) => page.evaluate((expressionText) => eval(expressionText), expression));
    recordSession(session, { lastCommand: "eval", lastUrl: url });
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    return;
  }

  if (command === "click") {
    const [url, selector] = rest;
    if (!url || !selector) usage();
    await withPage(session, url, async ({ page }) => {
      await page.locator(selector).first().click();
    });
    recordSession(session, { lastCommand: "click", lastUrl: url, output: selector });
    console.log(`clicked ${selector}`);
    return;
  }

  if (command === "fill") {
    const [url, selector, value] = rest;
    if (!url || !selector || value === undefined) usage();
    await withPage(session, url, async ({ page }) => {
      await page.locator(selector).first().fill(value);
    });
    recordSession(session, { lastCommand: "fill", lastUrl: url, output: selector });
    console.log(`filled ${selector}`);
    return;
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
    return;
  }

  if (command === "press") {
    const [url, selector, key] = rest;
    if (!url || !selector || !key) usage();
    await withPage(session, url, async ({ page }) => {
      await page.locator(selector).first().press(key);
    });
    recordSession(session, { lastCommand: "press", lastUrl: url, output: `${selector}:${key}` });
    console.log(`pressed ${key} on ${selector}`);
    return;
  }

  if (command === "assert-visible") {
    const [url, selector] = rest;
    if (!url || !selector) usage();
    await withPage(session, url, async ({ page }) => {
      await page.locator(selector).first().waitFor({ state: "visible" });
    });
    recordSession(session, { lastCommand: "assert-visible", lastUrl: url, output: selector });
    console.log(`asserted visible ${selector}`);
    return;
  }

  if (command === "assert-text") {
    const [url, selector, expected] = rest;
    if (!url || !selector || expected === undefined) usage();
    await withPage(session, url, async ({ page }) => {
      const text = await page.locator(selector).first().innerText();
      assertCondition(text.includes(expected), `Expected text ${JSON.stringify(expected)} in ${selector}.`);
    });
    recordSession(session, { lastCommand: "assert-text", lastUrl: url, output: `${selector}:${expected}` });
    console.log(`asserted text ${JSON.stringify(expected)} in ${selector}`);
    return;
  }

  if (command === "assert-url") {
    const [url, expected] = rest;
    if (!url || expected === undefined) usage();
    await withPage(session, url, async ({ page }) => {
      const currentUrl = page.url();
      assertCondition(currentUrl.includes(expected), `Expected URL to include ${JSON.stringify(expected)} but got ${JSON.stringify(currentUrl)}.`);
    });
    recordSession(session, { lastCommand: "assert-url", lastUrl: url, output: expected });
    console.log(`asserted URL contains ${JSON.stringify(expected)}`);
    return;
  }

  if (command === "assert-count") {
    const [url, selector, expectedCountRaw] = rest;
    if (!url || !selector || expectedCountRaw === undefined) usage();
    const expectedCount = Number(expectedCountRaw);
    assertCondition(Number.isInteger(expectedCount), "Expected count must be an integer.");
    await withPage(session, url, async ({ page }) => {
      const count = await page.locator(selector).count();
      assertCondition(count === expectedCount, `Expected ${expectedCount} matches for ${selector} but got ${count}.`);
    });
    recordSession(session, { lastCommand: "assert-count", lastUrl: url, output: `${selector}:${expectedCount}` });
    console.log(`asserted ${expectedCount} matches for ${selector}`);
    return;
  }

  if (command === "flow") {
    const [url, jsonSteps] = rest;
    if (!url || !jsonSteps) usage();
    const steps = parseFlow(jsonSteps);
    assertCondition(Boolean(steps), "Invalid JSON steps. Example: [{\"action\":\"click\",\"selector\":\"button\"}]");
    const out = await executeFlow({
      sessionName: session,
      url,
      steps,
      recordName: "flow:inline",
    });
    printJson(out);
    return;
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
    printJson(out);
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(cleanError(error));
  process.exit(1);
});

function cleanError(error) {
  return error instanceof Error ? error.message : String(error);
}
