#!/usr/bin/env bun
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

type FlowFormat = "json" | "yaml" | "markdown";
type FlowSource = "local" | "repo";
type PlaywrightModule = any;
type PlaywrightPage = {
  evaluate<TResult>(pageFunction: () => TResult): Promise<TResult>;
  evaluate<TArg, TResult>(pageFunction: (arg: TArg) => TResult, arg: TArg): Promise<TResult>;
  $$eval<TResult>(selector: string, pageFunction: (elements: HTMLAnchorElement[]) => TResult): Promise<TResult>;
} & Record<string, any>;
type PlaywrightContext = Record<string, any>;
type StepResult = Record<string, unknown>;

interface SessionState {
  name: string;
  updatedAt: string;
  lastCommand: string;
  lastUrl: string;
  output: string;
  authenticated: boolean;
  lastFlow: string;
}

interface BrowseState {
  sessions: Record<string, SessionState>;
}

interface ParsedGlobalArgs {
  session: string;
  command: string;
  rest: string[];
}

type FlowStep = Record<string, unknown>;

interface LoadedFlowDocument {
  absolute: string;
  format: FlowFormat;
  steps: FlowStep[];
}

interface FlowDirectoryEntry {
  name: string;
  steps: number;
  path: string;
  source: FlowSource;
}

interface ResolvedFlow {
  name: string;
  source: FlowSource;
  path: string;
  steps: FlowStep[];
}

interface SnapshotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SnapshotElement {
  selector: string;
  tag?: string;
  text?: string;
  bounds?: SnapshotBounds;
}

interface SnapshotPayload {
  capturedAt: string;
  url: string;
  title: string;
  bodyText: string;
  page: {
    width: number;
    height: number;
  };
  elements: SnapshotElement[];
  bodyHash: string;
  name?: string;
  screenshotPath?: string;
  screenshotHash?: string;
}

interface ChangedSelectorEntry {
  selector: string;
  before?: string;
  after?: string;
}

interface SnapshotComparison {
  status: "changed" | "match";
  summary: {
    missingSelectors: number;
    changedSelectors: number;
    newSelectors: number;
    titleChanged: boolean;
    bodyTextChanged: boolean;
    screenshotChanged: boolean;
  };
  missingSelectors: string[];
  changedSelectors: ChangedSelectorEntry[];
  newSelectors: string[];
  titleChanged: boolean;
  bodyTextChanged: boolean;
  screenshotChanged: boolean;
}

const ROOT_DIR = path.resolve(process.cwd(), ".codex-stack");
const STATE_DIR = path.join(ROOT_DIR, "browse");
const STATE_PATH = path.join(STATE_DIR, "state.json");
const SESSION_DIR = path.join(STATE_DIR, "sessions");
const FLOW_DIR = path.join(STATE_DIR, "flows");
const SNAPSHOT_DIR = path.join(STATE_DIR, "snapshots");
const ARTIFACT_DIR = path.join(STATE_DIR, "artifacts");
const REPO_FLOW_DIR = path.resolve(process.cwd(), "browse", "flows");

function usage(): never {
  console.log(`codex-stack browse

Usage:
  codex-stack browse doctor
  codex-stack browse status [--session <name>]
  codex-stack browse sessions
  codex-stack browse flows
  codex-stack browse save-flow <name> <json-steps>
  codex-stack browse save-repo-flow <name> <json-steps>
  codex-stack browse import-flow <name> <path>
  codex-stack browse import-repo-flow <name> <path>
  codex-stack browse export-flow <name> <path>
  codex-stack browse show-flow <name>
  codex-stack browse delete-flow <name>
  codex-stack browse clear-session [name]
  codex-stack browse snapshot <url> [name] [--session <name>]
  codex-stack browse compare-snapshot <url> <name> [--session <name>]
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

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, payload: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readState(): BrowseState {
  return readJson(STATE_PATH, { sessions: {} });
}

function writeState(payload: BrowseState): void {
  writeJson(STATE_PATH, payload);
}

function getSessionState(name: string): { full: BrowseState; session: SessionState } {
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

function sessionProfileDir(name: string): string {
  return path.join(SESSION_DIR, name);
}

function flowPath(name: string): string {
  return path.join(FLOW_DIR, `${name}.json`);
}

function repoFlowPath(name: string): string {
  return path.join(REPO_FLOW_DIR, `${name}.json`);
}

function snapshotJsonPath(name: string): string {
  return path.join(SNAPSHOT_DIR, `${name}.json`);
}

function snapshotScreenshotPath(name: string): string {
  return path.join(SNAPSHOT_DIR, `${name}.png`);
}

function snapshotArtifactPath(name: string, suffix: string, ext: string): string {
  return path.join(ARTIFACT_DIR, `${name}-${suffix}.${ext}`);
}

function normalizeText(text: unknown): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "snapshot";
}

function defaultSnapshotName(url: string): string {
  try {
    const parsed = new URL(url);
    return slugify(`${parsed.hostname}${parsed.pathname}`.replace(/\/+/g, "-"));
  } catch {
    return slugify(url);
  }
}

function textHash(text: unknown): string {
  return createHash("sha256").update(String(text || "")).digest("hex");
}

function fileHash(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertFlowName(name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error("Flow names may only contain letters, numbers, dot, underscore, and dash.");
  }
}

function parseGlobalArgs(argv: string[]): ParsedGlobalArgs {
  const out: ParsedGlobalArgs = { session: "default", command: "", rest: [] };
  const copy = [...argv];
  out.command = copy.shift() || "doctor";

  while (copy.length) {
    const item = copy.shift();
    if (item === "--session") {
      out.session = copy.shift() || "default";
      continue;
    }
    if (typeof item === "string") {
      out.rest.push(item);
    }
  }
  return out;
}

function parseFlow(jsonText: string): FlowStep[] | null {
  try {
    const steps = JSON.parse(jsonText);
    return Array.isArray(steps) ? steps : null;
  } catch {
    return null;
  }
}

function detectFlowFormat(filePath: string): FlowFormat {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  throw new Error("Unsupported flow format. Use .json, .yaml, .yml, or .md.");
}

function parseYamlScalar(rawValue: string): string | number | boolean | null {
  const value = String(rawValue || "").trim();
  if (value === "") return "";
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if (value.startsWith('"')) {
    return JSON.parse(value);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function parseYamlFlow(text: string): FlowStep[] {
  const steps: FlowStep[] = [];
  let current: FlowStep | null = null;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const itemMatch = line.match(/^\s*-\s*(.*)$/);
    if (itemMatch) {
      if (current) steps.push(current);
      current = {};
      const rest = itemMatch[1].trim();
      if (rest) {
        const separator = rest.indexOf(":");
        if (separator === -1) {
          throw new Error(`Invalid YAML flow entry: ${rawLine}`);
        }
        const key = rest.slice(0, separator).trim();
        const value = rest.slice(separator + 1);
        current[key] = parseYamlScalar(value);
      }
      continue;
    }

    const propertyMatch = line.match(/^\s+([^:#][^:]*):(.*)$/);
    if (propertyMatch && current) {
      const key = propertyMatch[1].trim();
      const value = propertyMatch[2];
      current[key] = parseYamlScalar(value);
      continue;
    }

    throw new Error(`Unsupported YAML flow syntax: ${rawLine}`);
  }

  if (current) steps.push(current);
  return steps;
}

function assertFlowSteps(steps: FlowStep[] | null, context = "flow"): asserts steps is FlowStep[] {
  assertCondition(Array.isArray(steps), `${context} must be a JSON/YAML array of step objects.`);
  const flowSteps = steps as FlowStep[];
  for (const [index, step] of flowSteps.entries()) {
    assertCondition(step && typeof step === "object" && !Array.isArray(step), `${context} step ${index + 1} must be an object.`);
  }
}

function parseMarkdownFlow(text: string): FlowStep[] {
  const matches = [...String(text || "").matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g)];
  for (const match of matches) {
    const language = String(match[1] || "").toLowerCase();
    const block = match[2];
    if (language === "json") {
      const steps = parseFlow(block);
      if (steps) return steps;
      continue;
    }
    if (language === "yaml" || language === "yml" || !language) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("[")) {
        const steps = parseFlow(trimmed);
        if (steps) return steps;
      }
      return parseYamlFlow(block);
    }
  }
  throw new Error("Markdown flow files must contain a fenced ```json or ```yaml block.");
}

function loadFlowDocument(filePath: string): LoadedFlowDocument {
  const absolute = path.resolve(process.cwd(), filePath);
  const format = detectFlowFormat(absolute);
  const content = fs.readFileSync(absolute, "utf8");
  let steps;
  if (format === "json") {
    steps = parseFlow(content);
  } else if (format === "yaml") {
    steps = parseYamlFlow(content);
  } else {
    steps = parseMarkdownFlow(content);
  }
  assertFlowSteps(steps, path.basename(absolute));
  return { absolute, format, steps };
}

function yamlScalar(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(String(value ?? ""));
}

function toYamlFlow(steps: FlowStep[]): string {
  return steps.map((step) => {
    const entries = Object.entries(step);
    if (!entries.length) return "- {}";
    return entries.map(([key, value], index) => (
      index === 0
        ? `- ${key}: ${yamlScalar(value)}`
        : `  ${key}: ${yamlScalar(value)}`
    )).join("\n");
  }).join("\n");
}

function toMarkdownFlow(name: string, steps: FlowStep[], source: FlowSource): string {
  return `# Flow: ${name}

Exported from codex-stack browse.

- Source: ${source}
- Steps: ${steps.length}

\`\`\`yaml
${toYamlFlow(steps)}
\`\`\`

Run it with:

\`\`\`bash
bun src/cli.ts browse run-flow <url> ${name} --session demo
\`\`\`
`;
}

function exportFlowDocument(name: string, targetPath: string, flow: ResolvedFlow): { absolute: string; format: FlowFormat } {
  const absolute = path.resolve(process.cwd(), targetPath);
  const format = detectFlowFormat(absolute);
  let content = "";
  if (format === "json") {
    content = `${JSON.stringify(flow.steps, null, 2)}\n`;
  } else if (format === "yaml") {
    content = `${toYamlFlow(flow.steps)}\n`;
  } else {
    content = toMarkdownFlow(name, flow.steps, flow.source);
  }
  ensureDir(path.dirname(absolute));
  fs.writeFileSync(absolute, content);
  return { absolute, format };
}

async function captureSnapshotPayload(page: PlaywrightPage): Promise<SnapshotPayload> {
  const snapshot = await page.evaluate(() => {
    const normalize = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
    const escape = (value: unknown) =>
      globalThis.CSS?.escape ? globalThis.CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");

    const selectorFor = (element: Element) => {
      if (!(element instanceof HTMLElement)) return "";
      if (element.id) return `#${escape(element.id)}`;

      const tag = element.tagName.toLowerCase();
      if (element.dataset.testid) return `${tag}[data-testid="${escape(element.dataset.testid)}"]`;
      if (element.dataset.qa) return `${tag}[data-qa="${escape(element.dataset.qa)}"]`;
      if (element.hasAttribute("name")) return `${tag}[name="${escape(element.getAttribute("name") || "")}"]`;
      if (tag === "a" && element.getAttribute("href")) return `a[href="${escape(element.getAttribute("href")) || ""}"]`;
      if (element.hasAttribute("aria-label")) return `${tag}[aria-label="${escape(element.getAttribute("aria-label") || "")}"]`;

      const parts: string[] = [];
      let node: HTMLElement | null = element;
      let depth = 0;
      while (node && node instanceof HTMLElement && depth < 5) {
        let part = node.tagName.toLowerCase();
        if (node.id) {
          parts.unshift(`#${escape(node.id)}`);
          break;
        }
        if (node.dataset.testid) {
          part += `[data-testid="${escape(node.dataset.testid)}"]`;
          parts.unshift(part);
          break;
        }
        if (node.dataset.qa) {
          part += `[data-qa="${escape(node.dataset.qa)}"]`;
          parts.unshift(part);
          break;
        }
        if (node.hasAttribute("name")) {
          part += `[name="${escape(node.getAttribute("name") || "")}"]`;
        } else if (node.parentElement) {
          const currentNode = node;
          const parent = currentNode.parentElement as HTMLElement;
          const siblings = Array.from(parent.children).filter((child) => child.tagName === currentNode.tagName);
          if (siblings.length > 1) {
            part += `:nth-of-type(${siblings.indexOf(currentNode) + 1})`;
          }
        }
        parts.unshift(part);
        node = node.parentElement;
        depth += 1;
      }
      return parts.join(" > ");
    };

    const candidates = Array.from(document.querySelectorAll([
      "[data-testid]",
      "[data-qa]",
      "[data-user-email]",
      "h1",
      "h2",
      "h3",
      "button",
      "a",
      "label",
      "input",
      "textarea",
      "select",
      "[role='alert']",
      "[role='dialog']",
      "[aria-label]",
    ].join(",")));

    const elements: Array<{ selector: string; tag: string; text: string; bounds: SnapshotBounds }> = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      const selector = selectorFor(candidate);
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);
      const text = normalize(candidate.innerText || candidate.textContent || candidate.getAttribute("aria-label") || candidate.getAttribute("value") || "");
      const rect = candidate.getBoundingClientRect();
      elements.push({
        selector,
        tag: candidate.tagName.toLowerCase(),
        text,
        bounds: {
          x: Math.round((window.scrollX + rect.left) * 10) / 10,
          y: Math.round((window.scrollY + rect.top) * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        },
      });
      if (elements.length >= 80) break;
    }

    return {
      capturedAt: new Date().toISOString(),
      url: window.location.href,
      title: document.title,
      bodyText: normalize(document.body?.innerText || ""),
      page: {
        width: Math.max(
          document.documentElement?.scrollWidth || 0,
          document.body?.scrollWidth || 0,
          window.innerWidth || 0
        ),
        height: Math.max(
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0,
          window.innerHeight || 0
        ),
      },
      elements,
    };
  });

  return {
    ...snapshot,
    bodyHash: textHash(snapshot.bodyText),
  };
}

function compareSnapshotData(
  baseline: Partial<SnapshotPayload> | null,
  current: Partial<SnapshotPayload>,
  { baselineScreenshotHash = "", currentScreenshotHash = "" }: { baselineScreenshotHash?: string; currentScreenshotHash?: string } = {},
): SnapshotComparison {
  const baselineElements = (Array.isArray(baseline?.elements) ? baseline.elements : []) as SnapshotElement[];
  const currentElements = (Array.isArray(current?.elements) ? current.elements : []) as SnapshotElement[];
  const baselineMap = new Map(baselineElements.map((item) => [item.selector, item]));
  const currentMap = new Map(currentElements.map((item) => [item.selector, item]));

  const missingSelectors: string[] = [];
  const changedSelectors: ChangedSelectorEntry[] = [];
  for (const item of baselineElements) {
    const next = currentMap.get(item.selector);
    if (!next) {
      missingSelectors.push(item.selector);
      continue;
    }
    if (normalizeText(item.text) !== normalizeText(next.text)) {
      changedSelectors.push({
        selector: item.selector,
        before: item.text,
        after: next.text,
      });
    }
  }

  const newSelectors = currentElements
    .filter((item) => !baselineMap.has(item.selector))
    .map((item) => item.selector);

  const titleChanged = normalizeText(baseline?.title) !== normalizeText(current?.title);
  const bodyTextChanged = normalizeText(baseline?.bodyText) !== normalizeText(current?.bodyText);
  const screenshotChanged = Boolean(baselineScreenshotHash && currentScreenshotHash && baselineScreenshotHash !== currentScreenshotHash);
  const status = missingSelectors.length || changedSelectors.length || newSelectors.length || titleChanged || bodyTextChanged || screenshotChanged
    ? "changed"
    : "match";

  return {
    status,
    summary: {
      missingSelectors: missingSelectors.length,
      changedSelectors: changedSelectors.length,
      newSelectors: newSelectors.length,
      titleChanged,
      bodyTextChanged,
      screenshotChanged,
    },
    missingSelectors,
    changedSelectors,
    newSelectors,
    titleChanged,
    bodyTextChanged,
    screenshotChanged,
  };
}

function isPreNavigationStep(step: FlowStep): boolean {
  const action = String(step?.action || "");
  return action === "clear-storage";
}

function expandFlowSteps(steps: FlowStep[], stack: string[] = []): FlowStep[] {
  const expanded: FlowStep[] = [];
  for (const step of steps) {
    if (step && typeof step === "object" && String(step.action || "") === "use-flow") {
      const flowName = String(step.name || step.flow || "").trim();
      assertCondition(Boolean(flowName), "use-flow steps require a flow name.");
      if (stack.includes(flowName)) {
        throw new Error(`Detected recursive flow reference: ${[...stack, flowName].join(" -> ")}`);
      }
      const nested = loadNamedFlow(flowName);
      expanded.push(...expandFlowSteps(nested, [...stack, flowName]));
      continue;
    }
    expanded.push(step);
  }
  return expanded;
}

function readFlowDirectory(dirPath: string, source: FlowSource): FlowDirectoryEntry[] {
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

function listNamedFlows(): FlowDirectoryEntry[] {
  ensureDir(FLOW_DIR);
  const map = new Map<string, FlowDirectoryEntry>();
  for (const entry of readFlowDirectory(REPO_FLOW_DIR, "repo")) {
    map.set(entry.name, entry);
  }
  for (const entry of readFlowDirectory(FLOW_DIR, "local")) {
    map.set(entry.name, entry);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function resolveNamedFlow(name: string): ResolvedFlow {
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

function loadNamedFlow(name: string): FlowStep[] {
  return resolveNamedFlow(name).steps;
}

function saveNamedFlow(name: string, steps: FlowStep[]): void {
  assertFlowName(name);
  writeJson(flowPath(name), steps);
}

function saveRepoFlow(name: string, steps: FlowStep[]): void {
  assertFlowName(name);
  writeJson(repoFlowPath(name), steps);
}

function recordSession(sessionName: string, patch: Partial<SessionState>): void {
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

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    const mod = await import("playwright");
    return mod;
  } catch {
    return null;
  }
}

async function withPage<T>(
  sessionName: string,
  url: string,
  callback: ({ page, context }: { page: PlaywrightPage; context: PlaywrightContext }) => Promise<T>,
): Promise<T> {
  const playwright = await loadPlaywright();
  if (!playwright) {
    throw new Error("Playwright is not installed. Run `bun install` and `bunx playwright install chromium`.");
  }

  ensureDir(SESSION_DIR);
  const userDataDir = sessionProfileDir(sessionName);

  let context: PlaywrightContext;
  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, { headless: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (/machport|permission denied|sandbox|Target page, context or browser has been closed/i.test(message)) {
      throw new Error("Unable to launch Chromium in the current sandboxed environment. Run the same command in a normal local shell after `bunx playwright install chromium`.");
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

async function runStep(page: PlaywrightPage, step: FlowStep, sessionName: string): Promise<StepResult> {
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
  if (action === "clear-storage") {
    const scope = String(step.scope || "both");
    const key = step.key === undefined || step.key === null ? "" : String(step.key);
    await page.evaluate(({ scope, key }: { scope: string; key: string }) => {
      const clearBucket = (storage: Storage) => {
        if (key) storage.removeItem(key);
        else storage.clear();
      };
      if (scope === "local" || scope === "both") clearBucket(window.localStorage);
      if (scope === "session" || scope === "both") clearBucket(window.sessionStorage);
    }, { scope, key });
    return { action, scope, key: key || "*", status: "ok" };
  }
  if (action === "use-flow") {
    return { action, name: step.name || step.flow, status: "expanded" };
  }

  return { action, status: "unsupported" };
}

async function executeFlow({
  sessionName,
  url,
  steps,
  recordName,
  authenticated = false,
}: {
  sessionName: string;
  url: string;
  steps: FlowStep[];
  recordName: string;
  authenticated?: boolean;
}): Promise<StepResult[]> {
  const expandedSteps = expandFlowSteps(steps);
  const preNavigationSteps: FlowStep[] = [];
  const postNavigationSteps: FlowStep[] = [];
  for (const step of expandedSteps) {
    if (!postNavigationSteps.length && isPreNavigationStep(step)) preNavigationSteps.push(step);
    else postNavigationSteps.push(step);
  }

  const results = await withPage(sessionName, "", async ({ page }: { page: PlaywrightPage }) => {
    const entries: StepResult[] = [];
    if (preNavigationSteps.length) {
      if (url) {
        const origin = new URL(url).origin;
        await page.goto(origin, { waitUntil: "networkidle" });
      }
      for (const step of preNavigationSteps) {
        entries.push(await runStep(page, step, sessionName));
      }
    }
    if (url) {
      entries.push(await runStep(page, { action: "goto", url }, sessionName));
    }
    for (const step of postNavigationSteps) {
      entries.push(await runStep(page, step, sessionName));
    }
    return entries;
  });
  recordSession(sessionName, {
    lastCommand: recordName,
    lastUrl: url,
    lastFlow: recordName,
    authenticated,
    output: `${expandedSteps.length} steps`,
  });
  return results;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const parsed = parseGlobalArgs(process.argv.slice(2));
  const { command, rest, session } = parsed;

  if (command === "doctor") {
    const playwrightInstalled = fs.existsSync(path.resolve(process.cwd(), "node_modules", "playwright"));
    console.log("codex-stack browse runtime");
    console.log(`- playwright package: ${playwrightInstalled ? "installed" : "missing"}`);
    console.log(`- state file: ${STATE_PATH}`);
    console.log(`- session root: ${SESSION_DIR}`);
    console.log(`- flow root: ${FLOW_DIR}`);
    console.log(`- snapshot root: ${SNAPSHOT_DIR}`);
    console.log(`- artifact root: ${ARTIFACT_DIR}`);
    console.log("- session model: persistent browser profile per named session");
    console.log("- commands: sessions, flows, save-flow, save-repo-flow, import-flow, import-repo-flow, export-flow, show-flow, delete-flow, snapshot, compare-snapshot, text, html, links, screenshot, eval, click, fill, wait, press, assert-visible, assert-text, assert-url, assert-count, flow, run-flow, login");
    console.log(`- repo flow root: ${REPO_FLOW_DIR}`);
    console.log("- flow search order: local .codex-stack flow overrides checked-in repo flow with the same name");
    console.log("- interchange formats: json, yaml, markdown (fenced yaml/json)");
    console.log("- browser install: run `bunx playwright install chromium` after bun install");
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
    assertFlowSteps(steps, name);
    saveNamedFlow(name, steps);
    console.log(`saved flow ${name}`);
    return;
  }

  if (command === "save-repo-flow") {
    const [name, jsonSteps] = rest;
    if (!name || !jsonSteps) usage();
    const steps = parseFlow(jsonSteps);
    assertCondition(Boolean(steps), "Invalid JSON steps. Example: [{\"action\":\"click\",\"selector\":\"button\"}]");
    assertFlowSteps(steps, name);
    saveRepoFlow(name, steps);
    console.log(`saved repo flow ${name}`);
    return;
  }

  if (command === "import-flow" || command === "import-repo-flow") {
    const [name, sourcePath] = rest;
    if (!name || !sourcePath) usage();
    const loaded = loadFlowDocument(sourcePath);
    if (command === "import-repo-flow") {
      saveRepoFlow(name, loaded.steps);
    } else {
      saveNamedFlow(name, loaded.steps);
    }
    console.log(`imported ${command === "import-repo-flow" ? "repo " : ""}flow ${name} from ${loaded.absolute} (${loaded.format})`);
    return;
  }

  if (command === "export-flow") {
    const [name, targetPath] = rest;
    if (!name || !targetPath) usage();
    const flow = resolveNamedFlow(name);
    const exported = exportFlowDocument(name, targetPath, flow);
    console.log(`exported flow ${name} to ${exported.absolute} (${exported.format})`);
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

  if (command === "snapshot") {
    const [url, explicitName] = rest;
    if (!url) usage();
    const snapshotName = explicitName ? slugify(explicitName) : defaultSnapshotName(url);
    ensureDir(SNAPSHOT_DIR);
    const baselineJson = snapshotJsonPath(snapshotName);
    const baselineScreenshot = snapshotScreenshotPath(snapshotName);
    const payload = await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
      const snapshot = await captureSnapshotPayload(page);
      await page.screenshot({ path: baselineScreenshot, fullPage: true });
      return snapshot;
    });
    const baseline = {
      ...payload,
      name: snapshotName,
      screenshotPath: path.relative(process.cwd(), baselineScreenshot),
      screenshotHash: fileHash(baselineScreenshot),
    };
    writeJson(baselineJson, baseline);
    recordSession(session, {
      lastCommand: "snapshot",
      lastUrl: url,
      output: path.relative(process.cwd(), baselineJson),
    });
    printJson({
      status: "saved",
      name: snapshotName,
      snapshot: path.relative(process.cwd(), baselineJson),
      screenshot: path.relative(process.cwd(), baselineScreenshot),
      selectors: baseline.elements.length,
      title: baseline.title,
      url: baseline.url,
    });
    return;
  }

  if (command === "compare-snapshot") {
    const [url, explicitName] = rest;
    if (!url || !explicitName) usage();
    const snapshotName = slugify(explicitName);
    const baselineJson = snapshotJsonPath(snapshotName);
    assertCondition(fs.existsSync(baselineJson), `Unknown snapshot baseline: ${snapshotName}. Run \`browse snapshot ${url} ${snapshotName}\` first.`);
    ensureDir(ARTIFACT_DIR);
    const stamp = `${Date.now()}`;
    const artifactJson = snapshotArtifactPath(snapshotName, stamp, "json");
    const artifactScreenshot = snapshotArtifactPath(snapshotName, stamp, "png");
    const baseline = readJson<SnapshotPayload | null>(baselineJson, null);
    assertCondition(Boolean(baseline), `Unable to read snapshot baseline: ${baselineJson}`);
    const baselineSnapshot = baseline as SnapshotPayload;
    const current = await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
      const payload = await captureSnapshotPayload(page);
      await page.screenshot({ path: artifactScreenshot, fullPage: true });
      return payload;
    });
    const currentSnapshot = {
      ...current,
      name: snapshotName,
      screenshotPath: path.relative(process.cwd(), artifactScreenshot),
      screenshotHash: fileHash(artifactScreenshot),
    };
    writeJson(artifactJson, currentSnapshot);
    const comparison = compareSnapshotData(baselineSnapshot, currentSnapshot, {
      baselineScreenshotHash: baselineSnapshot.screenshotHash || fileHash(snapshotScreenshotPath(snapshotName)),
      currentScreenshotHash: currentSnapshot.screenshotHash,
    });
    recordSession(session, {
      lastCommand: "compare-snapshot",
      lastUrl: url,
      output: `${comparison.status}:${snapshotName}`,
    });
    printJson({
      status: comparison.status,
      name: snapshotName,
      baseline: path.relative(process.cwd(), baselineJson),
      current: path.relative(process.cwd(), artifactJson),
      screenshot: path.relative(process.cwd(), artifactScreenshot),
      comparison,
    });
    return;
  }

  if (command === "text") {
    const url = rest[0];
    if (!url) usage();
    const text = await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => page.locator("body").innerText());
    recordSession(session, { lastCommand: "text", lastUrl: url, output: `${text.length} chars` });
    console.log(text);
    return;
  }

  if (command === "html") {
    const [url, selector] = rest;
    if (!url) usage();
    const html = await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => (selector ? page.locator(selector).first().innerHTML() : page.content()));
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
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => page.screenshot({ path: outPath, fullPage: true }));
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
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
      await page.locator(selector).first().click();
    });
    recordSession(session, { lastCommand: "click", lastUrl: url, output: selector });
    console.log(`clicked ${selector}`);
    return;
  }

  if (command === "fill") {
    const [url, selector, value] = rest;
    if (!url || !selector || value === undefined) usage();
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
      await page.locator(selector).first().fill(value);
    });
    recordSession(session, { lastCommand: "fill", lastUrl: url, output: selector });
    console.log(`filled ${selector}`);
    return;
  }

  if (command === "wait") {
    const [url, target] = rest;
    if (!url) usage();
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
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
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
      await page.locator(selector).first().press(key);
    });
    recordSession(session, { lastCommand: "press", lastUrl: url, output: `${selector}:${key}` });
    console.log(`pressed ${key} on ${selector}`);
    return;
  }

  if (command === "assert-visible") {
    const [url, selector] = rest;
    if (!url || !selector) usage();
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
      await page.locator(selector).first().waitFor({ state: "visible" });
    });
    recordSession(session, { lastCommand: "assert-visible", lastUrl: url, output: selector });
    console.log(`asserted visible ${selector}`);
    return;
  }

  if (command === "assert-text") {
    const [url, selector, expected] = rest;
    if (!url || !selector || expected === undefined) usage();
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
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
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
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
    await withPage(session, url, async ({ page }: { page: PlaywrightPage }) => {
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
    assertFlowSteps(steps, "inline flow");
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

main().catch((error: unknown) => {
  console.error(cleanError(error));
  process.exit(1);
});

function cleanError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
