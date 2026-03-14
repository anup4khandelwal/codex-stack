#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, spawnSync } from "node:child_process";

type DeployStatus = "pass" | "warning" | "critical" | "error";
type UrlSource = "direct" | "template";
type ReadinessStatus = "ready" | "timeout" | "error";
type DeviceName = "desktop" | "tablet" | "mobile";
type PlaywrightModule = any;
type PlaywrightContext = Record<string, any>;
type PlaywrightPage = Record<string, any>;
type QaStatus = "pass" | "warning" | "critical";

export interface DeployArgs {
  url: string;
  urlTemplate: string;
  pr: string;
  branch: string;
  sha: string;
  repo: string;
  paths: string[];
  devices: DeviceName[];
  flows: string[];
  snapshots: string[];
  updateSnapshot: boolean;
  session: string;
  publishDir: string;
  markdownOut: string;
  jsonOut: string;
  commentOut: string;
  json: boolean;
  waitTimeout: number;
  waitInterval: number;
  strictConsole: boolean;
  strictHttp: boolean;
  fixture: string;
  qaFixture: string;
  readinessFixture: string;
}

export interface DeployContext {
  repo: string;
  owner: string;
  repoName: string;
  pr: string;
  branch: string;
  branchSlug: string;
  sha: string;
  shortSha: string;
}

export interface ReadinessResult {
  status: ReadinessStatus;
  attempts: number;
  httpStatus: number | null;
  checkedUrl: string;
  detail: string;
}

interface VerifyTarget {
  routePath: string;
  device: DeviceName;
  url: string;
  screenshotFileName: string;
}

interface ConsoleSummary {
  errors: string[];
  warnings: string[];
}

export interface DeployPathResult {
  path: string;
  device: DeviceName;
  url: string;
  finalUrl: string;
  title: string;
  httpStatus: number | null;
  console: ConsoleSummary;
  screenshot: string;
  status: DeployStatus;
  detail: string;
}

interface QaFinding {
  severity?: string;
  category?: string;
  title?: string;
  detail?: string;
}

interface QaFlowResult {
  name?: string;
  status?: string;
  steps?: number;
}

interface QaPublishedArtifacts {
  markdown?: string;
  json?: string;
  annotation?: string;
  screenshot?: string;
}

interface QaArtifacts {
  markdown?: string;
  json?: string;
  annotation?: string;
  screenshot?: string;
  published?: QaPublishedArtifacts;
}

interface QaSnapshotReport {
  name?: string;
  status?: string;
  annotation?: string;
  screenshot?: string;
}

interface QaRunReport {
  status?: string;
  healthScore?: number;
  recommendation?: string;
  findings?: QaFinding[];
  flowResults?: QaFlowResult[];
  snapshotResult?: QaSnapshotReport | null;
  artifacts?: QaArtifacts;
}

export interface DeploySnapshotResult {
  name: string;
  targetPath: string;
  device: DeviceName;
  status: string;
  report: string;
  annotation: string;
  screenshot: string;
}

export interface DeployQaSummary {
  status: QaStatus;
  healthScore: number;
  recommendation: string;
  findings: QaFinding[];
  flowResults: QaFlowResult[];
  snapshotResults: DeploySnapshotResult[];
  artifacts: QaArtifacts;
}

interface ScreenshotManifestEntry {
  path: string;
  device: DeviceName;
  url: string;
  status: DeployStatus;
  screenshot: string;
}

export interface DeployReport {
  marker: string;
  generatedAt: string;
  status: DeployStatus;
  url: string;
  urlSource: UrlSource;
  urlTemplate?: string;
  context: DeployContext;
  readiness: ReadinessResult;
  checks: {
    paths: string[];
    devices: DeviceName[];
    strictConsole: boolean;
    strictHttp: boolean;
    session: string;
  };
  pathResults: DeployPathResult[];
  qa: DeployQaSummary;
  artifactRoot: string;
  screenshotManifest: string;
  runUrl: string;
  recommendation: string;
}

interface DeployFixturePage {
  path?: string;
  device?: string;
  finalUrl?: string;
  title?: string;
  httpStatus?: number | null;
  consoleErrors?: string[];
  consoleWarnings?: string[];
  screenshot?: string;
  detail?: string;
}

interface DeployFixture {
  pages?: DeployFixturePage[];
}

const BUN_RUNTIME = process.execPath || "bun";
const BROWSE_SESSION_DIR = path.resolve(process.cwd(), ".codex-stack", "browse", "sessions");
const BROWSE_ARTIFACT_DIR = path.resolve(process.cwd(), ".codex-stack", "browse", "artifacts");
const DEVICE_PRESETS: Record<DeviceName, { width: number; height: number }> = {
  desktop: { width: 1440, height: 960 },
  tablet: { width: 834, height: 1194 },
  mobile: { width: 390, height: 844 },
};

function usage(): never {
  console.log(`deploy-verify

Usage:
  bun scripts/deploy-verify.ts [--url <url> | --url-template <template>] [--pr <number>] [--branch <ref>] [--sha <sha>] [--repo <owner/name>] [--path <path>] [--device <desktop|tablet|mobile>] [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--publish-dir <path>] [--markdown-out <path>] [--json-out <path>] [--comment-out <path>] [--strict-console] [--strict-http] [--wait-timeout <seconds>] [--wait-interval <seconds>] [--fixture <path>] [--qa-fixture <path>] [--readiness-fixture <path>] [--json]
`);
  process.exit(0);
}

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function quote(value: string): string {
  return JSON.stringify(String(value));
}

function run(cmd: string, allowFailure = false): string {
  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return typeof output === "string" ? output.trim() : "";
  } catch (error: unknown) {
    if (allowFailure) return "";
    const stderr = typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr || "")
      : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(cleanSubject(stderr || message));
  }
}

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "deploy";
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetPath: string, content: string): void {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseListValue(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((item) => cleanSubject(item))
    .filter(Boolean);
}

function parseDevice(value: string): DeviceName {
  const normalized = cleanSubject(value).toLowerCase();
  if (normalized === "desktop" || normalized === "tablet" || normalized === "mobile") {
    return normalized;
  }
  throw new Error(`Unknown device preset: ${JSON.stringify(value)}. Use desktop, tablet, or mobile.`);
}

export function parseDeployArgs(argv: string[]): DeployArgs {
  const args: DeployArgs = {
    url: "",
    urlTemplate: cleanSubject(process.env.CODEX_STACK_PREVIEW_URL_TEMPLATE || ""),
    pr: cleanSubject(process.env.PR_NUMBER || process.env.GITHUB_PR_NUMBER || ""),
    branch: cleanSubject(process.env.GITHUB_HEAD_REF || run("git branch --show-current", true)),
    sha: cleanSubject(process.env.GITHUB_SHA || run("git rev-parse HEAD", true)),
    repo: cleanSubject(process.env.GITHUB_REPOSITORY || ""),
    paths: [],
    devices: [],
    flows: [],
    snapshots: [],
    updateSnapshot: false,
    session: "",
    publishDir: "",
    markdownOut: "",
    jsonOut: "",
    commentOut: "",
    json: false,
    waitTimeout: parsePositiveInteger(process.env.CODEX_STACK_PREVIEW_WAIT_TIMEOUT || "", 180),
    waitInterval: parsePositiveInteger(process.env.CODEX_STACK_PREVIEW_WAIT_INTERVAL || "", 10),
    strictConsole: false,
    strictHttp: false,
    fixture: "",
    qaFixture: "",
    readinessFixture: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") {
      args.url = cleanSubject(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--url-template") {
      args.urlTemplate = cleanSubject(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--pr") {
      args.pr = cleanSubject(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--branch") {
      args.branch = cleanSubject(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--sha") {
      args.sha = cleanSubject(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--repo") {
      args.repo = cleanSubject(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--path") {
      args.paths.push(cleanSubject(argv[i + 1] || ""));
      i += 1;
    } else if (arg === "--device") {
      args.devices.push(parseDevice(argv[i + 1] || ""));
      i += 1;
    } else if (arg === "--flow") {
      args.flows.push(...parseListValue(argv[i + 1] || ""));
      i += 1;
    } else if (arg === "--snapshot") {
      args.snapshots.push(...parseListValue(argv[i + 1] || ""));
      i += 1;
    } else if (arg === "--update-snapshot") {
      args.updateSnapshot = true;
    } else if (arg === "--session") {
      args.session = cleanSubject(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--publish-dir") {
      args.publishDir = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--markdown-out") {
      args.markdownOut = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--json-out") {
      args.jsonOut = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--comment-out") {
      args.commentOut = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--wait-timeout") {
      args.waitTimeout = parsePositiveInteger(argv[i + 1] || "", args.waitTimeout);
      i += 1;
    } else if (arg === "--wait-interval") {
      args.waitInterval = parsePositiveInteger(argv[i + 1] || "", args.waitInterval);
      i += 1;
    } else if (arg === "--strict-console") {
      args.strictConsole = true;
    } else if (arg === "--strict-http") {
      args.strictHttp = true;
    } else if (arg === "--fixture") {
      args.fixture = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--qa-fixture") {
      args.qaFixture = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--readiness-fixture") {
      args.readinessFixture = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }

  args.paths = [...new Set(args.paths.filter(Boolean))];
  args.devices = [...new Set(args.devices.filter(Boolean))];
  args.flows = [...new Set(args.flows.filter(Boolean))];
  args.snapshots = [...new Set(args.snapshots.filter(Boolean))];
  if (!args.url && !args.urlTemplate) {
    throw new Error("Provide either --url or --url-template.");
  }
  if (!args.paths.length) args.paths = ["/"];
  if (!args.devices.length) args.devices = ["desktop"];
  return args;
}

export function buildContext(args: Pick<DeployArgs, "repo" | "pr" | "branch" | "sha">): DeployContext {
  const repo = cleanSubject(args.repo || run("git remote get-url origin", true).match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i)?.[1] || "");
  const [owner = "", repoName = ""] = repo.split("/");
  const sha = cleanSubject(args.sha);
  const branch = cleanSubject(args.branch);
  return {
    repo,
    owner,
    repoName,
    pr: cleanSubject(args.pr),
    branch,
    branchSlug: slugify(branch),
    sha,
    shortSha: sha.slice(0, 7),
  };
}

export function resolveDeployUrl(args: Pick<DeployArgs, "url" | "urlTemplate">, context: DeployContext): { url: string; source: UrlSource; template: string } {
  if (args.url) {
    return { url: args.url, source: "direct", template: "" };
  }

  const template = cleanSubject(args.urlTemplate);
  const replacements: Record<string, string> = {
    repo: context.repo,
    owner: context.owner,
    repo_name: context.repoName,
    pr: context.pr,
    branch: context.branch,
    branch_slug: context.branchSlug,
    sha: context.sha,
    short_sha: context.shortSha,
  };

  const resolved = template.replace(/\{([a-z_]+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : match
  ));

  if (!resolved || /\{[a-z_]+\}/.test(resolved)) {
    throw new Error(`Unable to fully resolve deploy URL from template: ${template}`);
  }

  return { url: resolved, source: "template", template };
}

function defaultSession(context: DeployContext): string {
  if (context.pr) return `deploy-pr-${context.pr}`;
  if (context.branchSlug) return `deploy-${context.branchSlug}`;
  return "deploy";
}

function defaultPublishDir(context: DeployContext): string {
  if (context.pr) return path.resolve(process.cwd(), ".codex-stack", "deploy", `pr-${context.pr}`);
  return path.resolve(process.cwd(), ".codex-stack", "deploy", context.branchSlug || "deploy");
}

export async function waitForDeploy(url: string, timeoutSeconds: number, intervalSeconds: number): Promise<ReadinessResult> {
  const deadline = Date.now() + (timeoutSeconds * 1000);
  let attempts = 0;
  let lastHttpStatus: number | null = null;
  let lastDetail = "Deploy did not become ready before the timeout expired.";

  while (Date.now() <= deadline) {
    attempts += 1;
    try {
      const response = await fetch(url, { redirect: "follow" });
      lastHttpStatus = response.status;
      if (response.status >= 200 && response.status < 400) {
        return {
          status: "ready",
          attempts,
          httpStatus: response.status,
          checkedUrl: url,
          detail: `Deploy responded with HTTP ${response.status}.`,
        };
      }
      lastDetail = `Deploy responded with HTTP ${response.status}.`;
    } catch (error: unknown) {
      lastHttpStatus = null;
      lastDetail = error instanceof Error ? error.message : String(error);
    }

    if (Date.now() + (intervalSeconds * 1000) > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }

  return {
    status: lastHttpStatus === null ? "error" : "timeout",
    attempts,
    httpStatus: lastHttpStatus,
    checkedUrl: url,
    detail: cleanSubject(lastDetail),
  };
}

export function waitForDeployFromFixture(url: string, fixturePath: string): ReadinessResult {
  const parsed = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    attempts?: Array<number | { status?: number; detail?: string }>;
  };
  const attempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
  if (!attempts.length) {
    return {
      status: "error",
      attempts: 0,
      httpStatus: null,
      checkedUrl: url,
      detail: "Readiness fixture did not contain any attempts.",
    };
  }

  let lastStatus: number | null = null;
  let lastDetail = "Deploy did not become ready before the fixture ended.";
  for (let index = 0; index < attempts.length; index += 1) {
    const entry = attempts[index];
    const statusCode = typeof entry === "number" ? entry : Number(entry?.status || 0);
    const detail = typeof entry === "number" ? `Deploy responded with HTTP ${entry}.` : cleanSubject(entry?.detail || `Deploy responded with HTTP ${statusCode}.`);
    lastStatus = Number.isFinite(statusCode) && statusCode > 0 ? statusCode : null;
    lastDetail = detail;
    if (lastStatus !== null && lastStatus >= 200 && lastStatus < 400) {
      return {
        status: "ready",
        attempts: index + 1,
        httpStatus: lastStatus,
        checkedUrl: url,
        detail,
      };
    }
  }

  return {
    status: lastStatus === null ? "error" : "timeout",
    attempts: attempts.length,
    httpStatus: lastStatus,
    checkedUrl: url,
    detail: lastDetail,
  };
}

function ensureLeadingSlash(routePath: string): string {
  const value = cleanSubject(routePath || "/");
  if (!value || value === ".") return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function urlForPath(baseUrl: string, routePath: string): string {
  const normalizedPath = ensureLeadingSlash(routePath);
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(normalizedPath.replace(/^\//, ""), base).toString();
}

function pathSlug(routePath: string): string {
  const normalized = ensureLeadingSlash(routePath);
  if (normalized === "/") return "root";
  return slugify(normalized.replace(/^\//, "").replace(/\//g, "-"));
}

function buildTargets(baseUrl: string, args: DeployArgs): VerifyTarget[] {
  return args.paths.flatMap((routePath) => args.devices.map((device) => ({
    routePath: ensureLeadingSlash(routePath),
    device,
    url: urlForPath(baseUrl, routePath),
    screenshotFileName: `${pathSlug(routePath)}-${device}.png`,
  })));
}

function relative(targetPath: string): string {
  return path.relative(process.cwd(), targetPath) || path.basename(targetPath);
}

function copyFileIfPresent(source: string, destination: string): string {
  if (!source) return "";
  const resolved = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
  if (!fs.existsSync(resolved)) return "";
  ensureDir(path.dirname(destination));
  fs.copyFileSync(resolved, destination);
  return relative(destination);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(cleanSubject(item))).map((item) => cleanSubject(item));
}

function deployStatusPriority(status: string): number {
  if (status === "error") return 4;
  if (status === "critical") return 3;
  if (status === "warning") return 2;
  return 1;
}

function maxStatus(current: DeployStatus, next: string): DeployStatus {
  return deployStatusPriority(next) > deployStatusPriority(current) ? (next as DeployStatus) : current;
}

function qaStatusPriority(status: string): number {
  if (status === "critical") return 3;
  if (status === "warning") return 2;
  return 1;
}

function deriveQaStatus(statuses: string[]): QaStatus {
  if (statuses.some((status) => status === "critical")) return "critical";
  if (statuses.some((status) => status === "warning")) return "warning";
  return "pass";
}

function derivePageStatus({
  httpStatus,
  consoleErrors,
  consoleWarnings,
  strictConsole,
  strictHttp,
}: {
  httpStatus: number | null;
  consoleErrors: string[];
  consoleWarnings: string[];
  strictConsole: boolean;
  strictHttp: boolean;
}): DeployStatus {
  if (httpStatus === null || httpStatus >= 400) {
    return strictHttp ? "critical" : "warning";
  }
  if (consoleErrors.length) {
    return strictConsole ? "critical" : "warning";
  }
  if (consoleWarnings.length) {
    return "warning";
  }
  return "pass";
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

function sessionProfileDir(sessionName: string): string {
  return path.join(BROWSE_SESSION_DIR, sessionName);
}

async function withPersistentContext<T>(sessionName: string, callback: ({ context }: { context: PlaywrightContext }) => Promise<T>): Promise<T> {
  const playwright = await loadPlaywright();
  if (!playwright) {
    throw new Error("Playwright is not installed. Run `bun install` and `bunx playwright install chromium`.");
  }

  ensureDir(BROWSE_SESSION_DIR);
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

  try {
    return await callback({ context });
  } finally {
    await context.close();
  }
}

async function applyDevicePreset(page: PlaywrightPage, device: DeviceName): Promise<void> {
  const preset = DEVICE_PRESETS[device];
  await page.setViewportSize({ width: preset.width, height: preset.height });
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter(Boolean).map((item) => cleanSubject(item)).filter(Boolean))];
}

async function verifyTargetsWithPlaywright(args: DeployArgs, targets: VerifyTarget[], screenshotDir: string): Promise<DeployPathResult[]> {
  ensureDir(BROWSE_ARTIFACT_DIR);
  return withPersistentContext(cleanSubject(args.session) || "deploy", async ({ context }) => {
    const results: DeployPathResult[] = [];
    for (const target of targets) {
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      const consoleWarnings: string[] = [];
      page.on("console", (message: Record<string, unknown>) => {
        const type = cleanSubject(typeof message.type === "function" ? String(message.type()) : "").toLowerCase();
        const text = cleanSubject(typeof message.text === "function" ? String(message.text()) : "");
        if (!text) return;
        if (type === "error" || type === "assert") consoleErrors.push(text);
        else if (type === "warning" || type === "warn") consoleWarnings.push(text);
      });
      page.on("pageerror", (error: unknown) => {
        consoleErrors.push(cleanSubject(error instanceof Error ? error.message : String(error)));
      });

      let httpStatus: number | null = null;
      let finalUrl = target.url;
      let title = "";
      let detail = "Page verification passed.";
      let screenshot = "";
      try {
        await applyDevicePreset(page, target.device);
        const response = await page.goto(target.url, { waitUntil: "networkidle" });
        httpStatus = response ? Number(response.status()) : null;
        finalUrl = cleanSubject(typeof page.url === "function" ? page.url() : target.url) || target.url;
        title = cleanSubject(typeof page.title === "function" ? await page.title() : "");
        const screenshotPath = path.join(screenshotDir, target.screenshotFileName);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        screenshot = relative(screenshotPath);
        if (httpStatus === null) detail = "Navigation completed without an HTTP response object.";
        else if (httpStatus >= 400) detail = `Page responded with HTTP ${httpStatus}.`;
        else if (consoleErrors.length) detail = `${consoleErrors.length} console error(s) captured.`;
        else if (consoleWarnings.length) detail = `${consoleWarnings.length} console warning(s) captured.`;
      } catch (error: unknown) {
        detail = cleanSubject(error instanceof Error ? error.message : String(error));
      } finally {
        await page.close();
      }

      const status = derivePageStatus({
        httpStatus,
        consoleErrors: uniq(consoleErrors),
        consoleWarnings: uniq(consoleWarnings),
        strictConsole: args.strictConsole,
        strictHttp: args.strictHttp,
      });

      results.push({
        path: target.routePath,
        device: target.device,
        url: target.url,
        finalUrl,
        title,
        httpStatus,
        console: {
          errors: uniq(consoleErrors),
          warnings: uniq(consoleWarnings),
        },
        screenshot,
        status,
        detail,
      });
    }
    return results;
  });
}

function verifyTargetsFromFixture(args: DeployArgs, targets: VerifyTarget[], screenshotDir: string): DeployPathResult[] {
  const parsed = JSON.parse(fs.readFileSync(args.fixture, "utf8")) as DeployFixture;
  const pages = Array.isArray(parsed.pages) ? parsed.pages : [];
  return targets.map((target) => {
    const match = pages.find((entry) => ensureLeadingSlash(asString(entry.path, "/")) === target.routePath && parseDevice(asString(entry.device, target.device)) === target.device);
    const consoleErrors = uniq(match?.consoleErrors || []);
    const consoleWarnings = uniq(match?.consoleWarnings || []);
    const destination = path.join(screenshotDir, target.screenshotFileName);
    const screenshot = copyFileIfPresent(asString(match?.screenshot), destination);
    const httpStatus = typeof match?.httpStatus === "number" ? match.httpStatus : null;
    const detail = cleanSubject(match?.detail || (httpStatus !== null ? `Fixture returned HTTP ${httpStatus}.` : "Fixture did not provide an HTTP status."));
    return {
      path: target.routePath,
      device: target.device,
      url: target.url,
      finalUrl: cleanSubject(match?.finalUrl || target.url),
      title: cleanSubject(match?.title || ""),
      httpStatus,
      console: {
        errors: consoleErrors,
        warnings: consoleWarnings,
      },
      screenshot,
      status: derivePageStatus({
        httpStatus,
        consoleErrors,
        consoleWarnings,
        strictConsole: args.strictConsole,
        strictHttp: args.strictHttp,
      }),
      detail,
    };
  });
}

function runQaReport({
  url,
  session,
  publishDir,
  flows,
  snapshot,
  updateSnapshot,
  fixture,
}: {
  url: string;
  session: string;
  publishDir: string;
  flows: string[];
  snapshot: string;
  updateSnapshot: boolean;
  fixture: string;
}): QaRunReport {
  const qaArgs = [path.resolve(process.cwd(), "scripts", "qa-run.ts")];
  if (fixture) {
    qaArgs.push("--fixture", fixture);
  } else {
    qaArgs.push(url);
  }
  qaArgs.push("--session", session, "--publish-dir", publishDir, "--json");
  for (const flow of flows) {
    qaArgs.push("--flow", flow);
  }
  if (snapshot) {
    qaArgs.push("--snapshot", snapshot);
  }
  if (updateSnapshot) {
    qaArgs.push("--update-snapshot");
  }

  const result = spawnSync(BUN_RUNTIME, qaArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = String(result.stdout || "").trim();
  if ((result.status ?? 1) !== 0 || !stdout) {
    const stderr = cleanSubject(String(result.stderr || "").trim());
    throw new Error(stderr || "qa-run did not produce a JSON report.");
  }
  return JSON.parse(stdout) as QaRunReport;
}

function aggregateQa({
  args,
  baseUrl,
  publishDir,
  defaultPath,
  defaultDevice,
}: {
  args: DeployArgs;
  baseUrl: string;
  publishDir: string;
  defaultPath: string;
  defaultDevice: DeviceName;
}): DeployQaSummary {
  const flows = [...args.flows];
  const snapshots = [...args.snapshots];
  if (!flows.length && !snapshots.length) {
    return {
      status: "pass",
      healthScore: 100,
      recommendation: "No flow or snapshot QA checks were configured.",
      findings: [],
      flowResults: [],
      snapshotResults: [],
      artifacts: {},
    };
  }

  const sessionName = cleanSubject(args.session);
  const targetPath = ensureLeadingSlash(defaultPath || "/");
  const targetUrl = urlForPath(baseUrl, targetPath);
  const reports: Array<{ report: QaRunReport; snapshotName: string; publishDir: string; targetPath: string; device: DeviceName }> = [];

  const primarySnapshot = snapshots[0] || "";
  const primaryPublishDir = path.join(publishDir, "qa");
  reports.push({
    report: runQaReport({
      url: targetUrl,
      session: sessionName,
      publishDir: primaryPublishDir,
        flows,
        snapshot: primarySnapshot,
        updateSnapshot: args.updateSnapshot,
        fixture: args.qaFixture,
      }),
    snapshotName: primarySnapshot,
    publishDir: primaryPublishDir,
    targetPath,
    device: defaultDevice,
  });

  for (const snapshot of snapshots.slice(primarySnapshot ? 1 : 0)) {
    const snapshotPublishDir = path.join(publishDir, "qa", slugify(snapshot));
    reports.push({
      report: runQaReport({
        url: targetUrl,
        session: sessionName,
        publishDir: snapshotPublishDir,
        flows: [],
        snapshot,
        updateSnapshot: args.updateSnapshot,
        fixture: args.qaFixture,
      }),
      snapshotName: snapshot,
      publishDir: snapshotPublishDir,
      targetPath,
      device: defaultDevice,
    });
  }

  const statuses = reports.map((entry) => cleanSubject(entry.report.status || "pass") || "pass");
  const findings = reports.flatMap((entry) => Array.isArray(entry.report.findings) ? entry.report.findings : []);
  const flowResults = Array.isArray(reports[0]?.report.flowResults) ? reports[0].report.flowResults || [] : [];
  const snapshotResults = reports
    .filter((entry) => entry.report.snapshotResult)
    .map((entry) => ({
      name: cleanSubject(entry.report.snapshotResult?.name || entry.snapshotName || "snapshot"),
      targetPath: entry.targetPath,
      device: entry.device,
      status: cleanSubject(entry.report.snapshotResult?.status || "unknown"),
      report: cleanSubject(entry.report.artifacts?.published?.markdown || entry.report.artifacts?.markdown || ""),
      annotation: cleanSubject(entry.report.snapshotResult?.annotation || entry.report.artifacts?.published?.annotation || entry.report.artifacts?.annotation || ""),
      screenshot: cleanSubject(entry.report.snapshotResult?.screenshot || entry.report.artifacts?.published?.screenshot || entry.report.artifacts?.screenshot || ""),
    }));
  const healthScore = reports.reduce((lowest, entry) => {
    const next = typeof entry.report.healthScore === "number" ? entry.report.healthScore : 100;
    return Math.min(lowest, next);
  }, 100);

  const recommendation = reports
    .map((entry) => cleanSubject(entry.report.recommendation || ""))
    .find(Boolean) || "Deploy QA checks passed.";

  return {
    status: deriveQaStatus(statuses),
    healthScore,
    recommendation,
    findings,
    flowResults,
    snapshotResults,
    artifacts: reports[0]?.report.artifacts || {},
  };
}

function actionsRunUrl(context: DeployContext): string {
  const serverUrl = cleanSubject(process.env.GITHUB_SERVER_URL || "https://github.com");
  const runId = cleanSubject(process.env.GITHUB_RUN_ID || "");
  if (!context.repo || !runId) return "";
  return `${serverUrl}/${context.repo}/actions/runs/${runId}`;
}

function recommendation(report: {
  status: DeployStatus;
  qa: DeployQaSummary;
  readiness: ReadinessResult;
  pathResults: DeployPathResult[];
}): string {
  if (report.status === "error") {
    return `Deploy verification failed before browser checks could complete: ${report.readiness.detail}`;
  }
  if (report.status === "critical") {
    if (report.qa.status === "critical") return report.qa.recommendation || "Do not merge until the deploy verification issues are fixed.";
    return "Do not merge. The deploy verification found blocking browser or HTTP issues.";
  }
  if (report.status === "warning") {
    if (report.qa.status === "warning") return report.qa.recommendation || "Review the deploy drift before merge.";
    return "Deploy verification found non-blocking browser or console drift. Review the evidence before merge.";
  }
  return report.qa.recommendation && report.qa.recommendation !== "No flow or snapshot QA checks were configured."
    ? report.qa.recommendation
    : "Deploy verification passed.";
}

function renderPageLines(results: DeployPathResult[]): string[] {
  if (!results.length) return ["- No page checks recorded."];
  return results.map((entry) => {
    const bits = [
      `${entry.path} @ ${entry.device}`,
      `status=${entry.status}`,
      entry.httpStatus !== null ? `http=${entry.httpStatus}` : "http=n/a",
      entry.console.errors.length ? `consoleErrors=${entry.console.errors.length}` : "",
      entry.console.warnings.length ? `consoleWarnings=${entry.console.warnings.length}` : "",
      entry.screenshot ? `screenshot=${entry.screenshot}` : "",
    ].filter(Boolean);
    return `- ${bits.join(", ")}`;
  });
}

function renderFlowLines(flowResults: QaFlowResult[]): string[] {
  if (!flowResults.length) return ["- No flows configured."];
  return flowResults.map((item) => `- ${item.name || "flow"}: ${item.status || "unknown"}${item.steps ? ` (${item.steps} steps)` : ""}`);
}

function renderFindingLines(findings: QaFinding[]): string[] {
  if (!findings.length) return ["- No QA findings."];
  return findings.slice(0, 8).map((item) => `- ${String(item.severity || "info").toUpperCase()}${item.category ? `/${String(item.category).toUpperCase()}` : ""}: ${item.title || "Finding"}${item.detail ? ` - ${item.detail}` : ""}`);
}

function renderSnapshotLines(snapshotResults: DeploySnapshotResult[]): string[] {
  if (!snapshotResults.length) return ["- No snapshot checks configured."];
  return snapshotResults.map((item) => {
    const refs = [
      `${item.name} @ ${item.targetPath} (${item.device})`,
      `status=${item.status}`,
      item.report ? `report=${item.report}` : "",
      item.annotation ? `annotation=${item.annotation}` : "",
      item.screenshot ? `screenshot=${item.screenshot}` : "",
    ].filter(Boolean);
    return `- ${refs.join(", ")}`;
  });
}

export function renderDeployMarkdown(report: DeployReport): string {
  const primaryQaArtifacts = report.qa.artifacts?.published || {};
  const lines = [
    report.marker,
    "# codex-stack deploy verification",
    "",
    `- Repo: ${report.context.repo || "local"}`,
    `- PR: ${report.context.pr || "n/a"}`,
    `- Branch: ${report.context.branch || "n/a"}`,
    `- SHA: ${report.context.shortSha || "n/a"}`,
    `- Deploy URL: ${report.url}`,
    `- URL source: ${report.urlSource}`,
    `- Readiness: ${report.readiness.status} after ${report.readiness.attempts} attempt(s)`,
    report.readiness.httpStatus ? `- Last HTTP status: ${report.readiness.httpStatus}` : "",
    `- Overall status: ${report.status}`,
    `- Devices: ${report.checks.devices.join(", ")}`,
    `- Paths: ${report.checks.paths.join(", ")}`,
    `- Strict console errors: ${report.checks.strictConsole ? "yes" : "no"}`,
    `- Strict HTTP errors: ${report.checks.strictHttp ? "yes" : "no"}`,
    `- QA health score: ${report.qa.healthScore}`,
    `- Recommendation: ${report.recommendation}`,
    report.runUrl ? `- Workflow run: ${report.runUrl}` : "",
    "",
    "## Page checks",
    "",
    ...renderPageLines(report.pathResults),
    "",
    "## Flow results",
    "",
    ...renderFlowLines(report.qa.flowResults),
    "",
    "## Snapshot results",
    "",
    ...renderSnapshotLines(report.qa.snapshotResults),
    "",
    "## QA findings",
    "",
    ...renderFindingLines(report.qa.findings),
    "",
    "## Artifacts",
    "",
    `- Artifact root: \`${relative(report.artifactRoot)}\``,
    report.screenshotManifest ? `- Screenshot manifest: \`${report.screenshotManifest}\`` : "",
    primaryQaArtifacts.markdown ? `- QA report: \`${primaryQaArtifacts.markdown}\`` : "",
    primaryQaArtifacts.json ? `- QA json: \`${primaryQaArtifacts.json}\`` : "",
    primaryQaArtifacts.annotation ? `- QA annotation: \`${primaryQaArtifacts.annotation}\`` : "",
    primaryQaArtifacts.screenshot ? `- QA screenshot: \`${primaryQaArtifacts.screenshot}\`` : "",
  ];

  return lines.filter(Boolean).join("\n") + "\n";
}

function writeStandardArtifacts(args: DeployArgs, report: DeployReport, markdown: string): void {
  const defaultJsonPath = path.join(report.artifactRoot, "report.json");
  const defaultMarkdownPath = path.join(report.artifactRoot, "report.md");
  const defaultCommentPath = path.join(report.artifactRoot, "comment.md");
  writeFile(defaultJsonPath, JSON.stringify(report, null, 2));
  writeFile(defaultMarkdownPath, markdown);
  writeFile(defaultCommentPath, markdown);
  if (args.jsonOut && path.resolve(args.jsonOut) !== path.resolve(defaultJsonPath)) {
    writeFile(args.jsonOut, JSON.stringify(report, null, 2));
  }
  if (args.markdownOut && path.resolve(args.markdownOut) !== path.resolve(defaultMarkdownPath)) {
    writeFile(args.markdownOut, markdown);
  }
  if (args.commentOut && path.resolve(args.commentOut) !== path.resolve(defaultCommentPath)) {
    writeFile(args.commentOut, markdown);
  }
}

function writeScreenshotManifest(targetPath: string, results: DeployPathResult[]): string {
  const manifest: ScreenshotManifestEntry[] = results
    .filter((entry) => entry.screenshot)
    .map((entry) => ({
      path: entry.path,
      device: entry.device,
      url: entry.url,
      status: entry.status,
      screenshot: entry.screenshot,
    }));
  writeFile(targetPath, JSON.stringify(manifest, null, 2));
  return relative(targetPath);
}

export async function runDeployVerification(args: DeployArgs): Promise<DeployReport> {
  const context = buildContext(args);
  const resolved = resolveDeployUrl(args, context);
  const session = cleanSubject(args.session) || defaultSession(context);
  const publishDir = args.publishDir || defaultPublishDir(context);
  const screenshotsDir = path.join(publishDir, "screenshots");
  ensureDir(screenshotsDir);

  const readiness = args.readinessFixture
    ? waitForDeployFromFixture(resolved.url, args.readinessFixture)
    : await waitForDeploy(resolved.url, args.waitTimeout, args.waitInterval);

  let pathResults: DeployPathResult[] = [];
  let qa: DeployQaSummary = {
    status: "pass",
    healthScore: 100,
    recommendation: "No flow or snapshot QA checks were configured.",
    findings: [],
    flowResults: [],
    snapshotResults: [],
    artifacts: {},
  };
  let overallStatus: DeployStatus = readiness.status === "ready" ? "pass" : "error";

  if (readiness.status === "ready") {
    const targets = buildTargets(resolved.url, args);
    pathResults = args.fixture
      ? verifyTargetsFromFixture({ ...args, session }, targets, screenshotsDir)
      : await verifyTargetsWithPlaywright({ ...args, session }, targets, screenshotsDir);

    for (const entry of pathResults) {
      overallStatus = maxStatus(overallStatus, entry.status);
    }

    qa = aggregateQa({
      args: { ...args, session, publishDir },
      baseUrl: resolved.url,
      publishDir,
      defaultPath: args.paths[0] || "/",
      defaultDevice: args.devices[0] || "desktop",
    });
    if (qa.status !== "pass") {
      overallStatus = maxStatus(overallStatus, qa.status);
    }
  }

  const report: DeployReport = {
    marker: "<!-- codex-stack:deploy-verify -->",
    generatedAt: new Date().toISOString(),
    status: overallStatus,
    url: resolved.url,
    urlSource: resolved.source,
    urlTemplate: resolved.template || undefined,
    context,
    readiness,
    checks: {
      paths: args.paths.map((item) => ensureLeadingSlash(item)),
      devices: args.devices,
      strictConsole: args.strictConsole,
      strictHttp: args.strictHttp,
      session,
    },
    pathResults,
    qa,
    artifactRoot: publishDir,
    screenshotManifest: "",
    runUrl: actionsRunUrl(context),
    recommendation: "",
  };

  report.screenshotManifest = writeScreenshotManifest(path.join(publishDir, "screenshots.json"), pathResults);
  report.recommendation = recommendation(report);

  const markdown = renderDeployMarkdown(report);
  writeStandardArtifacts(args, report, markdown);
  return report;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseDeployArgs(argv);
  const report = await runDeployVerification(args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(renderDeployMarkdown(report));
  }
}

if (import.meta.main) {
  await main();
}
