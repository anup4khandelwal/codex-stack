#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, spawnSync } from "node:child_process";

type PreviewStatus = "pass" | "warning" | "critical" | "error";
type UrlSource = "direct" | "template";
type ReadinessStatus = "ready" | "timeout" | "error";

interface ParsedArgs {
  url: string;
  urlTemplate: string;
  pr: string;
  branch: string;
  sha: string;
  repo: string;
  flows: string[];
  snapshot: string;
  session: string;
  publishDir: string;
  markdownOut: string;
  jsonOut: string;
  commentOut: string;
  json: boolean;
  waitTimeout: number;
  waitInterval: number;
  qaFixture: string;
  readinessFixture: string;
}

interface PreviewContext {
  repo: string;
  owner: string;
  repoName: string;
  pr: string;
  branch: string;
  branchSlug: string;
  sha: string;
  shortSha: string;
}

interface ReadinessResult {
  status: ReadinessStatus;
  attempts: number;
  httpStatus: number | null;
  checkedUrl: string;
  detail: string;
}

interface QaFlowResult {
  name?: string;
  status?: string;
  steps?: number;
}

interface QaFinding {
  severity?: string;
  title?: string;
  detail?: string;
}

interface QaReport {
  status?: string;
  healthScore?: number;
  recommendation?: string;
  findings?: QaFinding[];
  flowResults?: QaFlowResult[];
  snapshotResult?: {
    name?: string;
    status?: string;
    screenshot?: string;
    annotation?: string;
  };
  artifacts?: {
    markdown?: string;
    json?: string;
    annotation?: string;
    screenshot?: string;
    published?: {
      markdown?: string;
      json?: string;
      annotation?: string;
      screenshot?: string;
    };
  };
}

interface PreviewReport {
  marker: string;
  generatedAt: string;
  status: PreviewStatus;
  url: string;
  urlSource: UrlSource;
  urlTemplate?: string;
  context: PreviewContext;
  readiness: ReadinessResult;
  qa: QaReport;
  artifactRoot: string;
  runUrl: string;
  recommendation: string;
}

function usage(): never {
  console.log(`preview-verify

Usage:
  bun scripts/preview-verify.ts [--url <url> | --url-template <template>] [--pr <number>] [--branch <ref>] [--sha <sha>] [--repo <owner/name>] [--flow <name>] [--snapshot <name>] [--session <name>] [--publish-dir <path>] [--markdown-out <path>] [--json-out <path>] [--comment-out <path>] [--wait-timeout <seconds>] [--wait-interval <seconds>] [--qa-fixture <path>] [--readiness-fixture <path>] [--json]
`);
  process.exit(0);
}

function cleanSubject(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
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
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "preview";
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

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    url: "",
    urlTemplate: cleanSubject(process.env.CODEX_STACK_PREVIEW_URL_TEMPLATE || ""),
    pr: cleanSubject(process.env.PR_NUMBER || process.env.GITHUB_PR_NUMBER || ""),
    branch: cleanSubject(process.env.GITHUB_HEAD_REF || run("git branch --show-current", true)),
    sha: cleanSubject(process.env.GITHUB_SHA || run("git rev-parse HEAD", true)),
    repo: cleanSubject(process.env.GITHUB_REPOSITORY || ""),
    flows: parseListValue(process.env.CODEX_STACK_PREVIEW_FLOW || ""),
    snapshot: cleanSubject(process.env.CODEX_STACK_PREVIEW_SNAPSHOT || ""),
    session: "",
    publishDir: "",
    markdownOut: "",
    jsonOut: "",
    commentOut: "",
    json: false,
    waitTimeout: parsePositiveInteger(process.env.CODEX_STACK_PREVIEW_WAIT_TIMEOUT || "", 180),
    waitInterval: parsePositiveInteger(process.env.CODEX_STACK_PREVIEW_WAIT_INTERVAL || "", 10),
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
    } else if (arg === "--flow") {
      const values = parseListValue(argv[i + 1] || "");
      args.flows.push(...values);
      i += 1;
    } else if (arg === "--snapshot") {
      args.snapshot = cleanSubject(argv[i + 1] || "");
      i += 1;
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

  args.flows = [...new Set(args.flows.filter(Boolean))];
  if (!args.url && !args.urlTemplate) {
    throw new Error("Provide either --url or --url-template.");
  }
  return args;
}

function buildContext(args: ParsedArgs): PreviewContext {
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

function resolvePreviewUrl(args: ParsedArgs, context: PreviewContext): { url: string; source: UrlSource; template: string } {
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
    throw new Error(`Unable to fully resolve preview URL from template: ${template}`);
  }

  return { url: resolved, source: "template", template };
}

function defaultSession(context: PreviewContext): string {
  if (context.pr) return `preview-pr-${context.pr}`;
  if (context.branchSlug) return `preview-${context.branchSlug}`;
  return "preview";
}

function defaultPublishDir(context: PreviewContext): string {
  if (context.pr) return path.resolve(process.cwd(), ".codex-stack", "preview", `pr-${context.pr}`);
  return path.resolve(process.cwd(), ".codex-stack", "preview", context.branchSlug || "preview");
}

async function waitForPreview(url: string, timeoutSeconds: number, intervalSeconds: number): Promise<ReadinessResult> {
  const deadline = Date.now() + (timeoutSeconds * 1000);
  let attempts = 0;
  let lastHttpStatus: number | null = null;
  let lastDetail = "Preview did not become ready before the timeout expired.";

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
          detail: `Preview responded with HTTP ${response.status}.`,
        };
      }
      lastDetail = `Preview responded with HTTP ${response.status}.`;
    } catch (error: unknown) {
      lastHttpStatus = null;
      lastDetail = error instanceof Error ? error.message : String(error);
    }

    if (Date.now() + (intervalSeconds * 1000) > deadline) {
      break;
    }
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

function waitForPreviewFromFixture(url: string, fixturePath: string): ReadinessResult {
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
  let lastDetail = "Preview did not become ready before the fixture ended.";
  for (let index = 0; index < attempts.length; index += 1) {
    const entry = attempts[index];
    const statusCode = typeof entry === "number" ? entry : Number(entry?.status || 0);
    const detail = typeof entry === "number" ? `Preview responded with HTTP ${entry}.` : cleanSubject(entry?.detail || `Preview responded with HTTP ${statusCode}.`);
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

function runQa(url: string, args: ParsedArgs, context: PreviewContext, publishDir: string): QaReport {
  const qaArgs = [path.resolve(process.cwd(), "scripts", "qa-run.ts")];
  if (args.qaFixture) {
    qaArgs.push("--fixture", args.qaFixture);
  } else {
    qaArgs.push(url);
  }
  qaArgs.push("--session", args.session || defaultSession(context), "--publish-dir", publishDir, "--json");
  for (const flow of args.flows) {
    qaArgs.push("--flow", flow);
  }
  if (args.snapshot) {
    qaArgs.push("--snapshot", args.snapshot);
  }

  const result = spawnSync(process.execPath || "bun", qaArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = String(result.stdout || "").trim();
  if ((result.status ?? 1) !== 0 || !stdout) {
    const stderr = cleanSubject(String(result.stderr || "").trim());
    throw new Error(stderr || "qa-run did not produce a JSON report.");
  }
  return JSON.parse(stdout) as QaReport;
}

function recommendation(status: PreviewStatus, qa: QaReport, readiness: ReadinessResult): string {
  if (status === "error") {
    return `Preview verification failed before QA could complete: ${readiness.detail}`;
  }
  if (qa.recommendation) return qa.recommendation;
  if (status === "critical") return "Do not merge until the preview environment matches the expected flow and snapshot.";
  if (status === "warning") return "Resolve the preview drift or explain it before merge.";
  return "Preview verification passed.";
}

function renderFindingLines(findings: QaFinding[]): string[] {
  if (!findings.length) return ["- No findings."];
  return findings.slice(0, 8).map((item) => `- ${String(item.severity || "info").toUpperCase()}: ${item.title || "Finding"}${item.detail ? ` - ${item.detail}` : ""}`);
}

function renderFlowLines(flowResults: QaFlowResult[]): string[] {
  if (!flowResults.length) return ["- No flows configured."];
  return flowResults.map((item) => `- ${item.name || "flow"}: ${item.status || "unknown"}${item.steps ? ` (${item.steps} steps)` : ""}`);
}

function relative(targetPath: string): string {
  return path.relative(process.cwd(), targetPath) || path.basename(targetPath);
}

function actionsRunUrl(context: PreviewContext): string {
  const serverUrl = cleanSubject(process.env.GITHUB_SERVER_URL || "https://github.com");
  const runId = cleanSubject(process.env.GITHUB_RUN_ID || "");
  if (!context.repo || !runId) return "";
  return `${serverUrl}/${context.repo}/actions/runs/${runId}`;
}

function renderMarkdown(report: PreviewReport): string {
  const findings = Array.isArray(report.qa.findings) ? report.qa.findings : [];
  const flowResults = Array.isArray(report.qa.flowResults) ? report.qa.flowResults : [];
  const published = report.qa.artifacts?.published || {};
  const snapshot = report.qa.snapshotResult;
  const lines = [
    report.marker,
    "# codex-stack preview verification",
    "",
    `- Repo: ${report.context.repo || "local"}`,
    `- PR: ${report.context.pr || "n/a"}`,
    `- Branch: ${report.context.branch || "n/a"}`,
    `- SHA: ${report.context.shortSha || "n/a"}`,
    `- Preview URL: ${report.url}`,
    `- URL source: ${report.urlSource}`,
    `- Readiness: ${report.readiness.status} after ${report.readiness.attempts} attempt(s)`,
    report.readiness.httpStatus ? `- Last HTTP status: ${report.readiness.httpStatus}` : "",
    `- Overall status: ${report.status}`,
    `- Health score: ${report.qa.healthScore ?? "n/a"}`,
    `- Recommendation: ${report.recommendation}`,
    report.runUrl ? `- Workflow run: ${report.runUrl}` : "",
    "",
    "## Findings",
    "",
    ...renderFindingLines(findings),
    "",
    "## Flow results",
    "",
    ...renderFlowLines(flowResults),
    "",
    "## Artifacts",
    "",
    `- Artifact root: \`${relative(report.artifactRoot)}\``,
    published.markdown ? `- QA report: \`${published.markdown}\`` : "",
    published.json ? `- QA json: \`${published.json}\`` : "",
    published.annotation ? `- Annotation: \`${published.annotation}\`` : "",
    published.screenshot ? `- Screenshot: \`${published.screenshot}\`` : "",
  ];

  if (snapshot) {
    lines.push(
      "",
      "## Snapshot",
      "",
      `- Snapshot: ${snapshot.name || "n/a"} (${snapshot.status || "unknown"})`,
    );
    if (snapshot.annotation) lines.push(`- Annotation path: \`${snapshot.annotation}\``);
    if (snapshot.screenshot) lines.push(`- Screenshot path: \`${snapshot.screenshot}\``);
  }

  return lines.filter(Boolean).join("\n") + "\n";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const context = buildContext(args);
  const resolved = resolvePreviewUrl(args, context);
  const publishDir = args.publishDir || defaultPublishDir(context);

  const readiness = args.readinessFixture
    ? waitForPreviewFromFixture(resolved.url, args.readinessFixture)
    : await waitForPreview(resolved.url, args.waitTimeout, args.waitInterval);
  let qa: QaReport = {};
  let status: PreviewStatus = "error";

  if (readiness.status === "ready") {
    qa = runQa(resolved.url, args, context, publishDir);
    const qaStatus = cleanSubject(qa.status || "");
    if (qaStatus === "critical") status = "critical";
    else if (qaStatus === "warning") status = "warning";
    else status = "pass";
  }

  const report: PreviewReport = {
    marker: "<!-- codex-stack:preview-verify -->",
    generatedAt: new Date().toISOString(),
    status,
    url: resolved.url,
    urlSource: resolved.source,
    urlTemplate: resolved.template || undefined,
    context,
    readiness,
    qa,
    artifactRoot: publishDir,
    runUrl: actionsRunUrl(context),
    recommendation: recommendation(status, qa, readiness),
  };

  const markdown = renderMarkdown(report);
  if (args.markdownOut) writeFile(args.markdownOut, markdown);
  if (args.commentOut) writeFile(args.commentOut, markdown);
  if (args.jsonOut) writeFile(args.jsonOut, JSON.stringify(report, null, 2));

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(markdown);
  }
}

await main();
