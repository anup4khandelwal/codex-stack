#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  buildContext,
  parseDeployArgs,
  resolveDeployUrl,
  runDeployVerification,
  type DeployArgs,
  type DeployContext,
  type DeployReport,
  type ReadinessResult,
} from "./deploy-verify.ts";
import type { VisualRiskSummary } from "./visual-risk.ts";

type PreviewStatus = "pass" | "warning" | "critical" | "error";

interface PreviewArgs {
  deploy: DeployArgs;
  markdownOut: string;
  jsonOut: string;
  commentOut: string;
  json: boolean;
}

interface PreviewQaCompat {
  status?: string;
  healthScore?: number;
  recommendation?: string;
  findings?: DeployReport["qa"]["findings"];
  flowResults?: DeployReport["qa"]["flowResults"];
  snapshotResult?: {
    name?: string;
    status?: string;
    screenshot?: string;
    annotation?: string;
  } | null;
  artifacts?: DeployReport["qa"]["artifacts"];
}

interface PreviewReport {
  marker: string;
  generatedAt: string;
  status: PreviewStatus;
  url: string;
  urlSource: DeployReport["urlSource"];
  urlTemplate?: string;
  context: DeployContext;
  readiness: ReadinessResult;
  qa: PreviewQaCompat;
  visualRisk: VisualRiskSummary;
  artifactRoot: string;
  visualPack?: DeployReport["visualPack"];
  runUrl: string;
  recommendation: string;
  deploy: DeployReport;
}

function usage(): never {
  console.log(`preview-verify

Usage:
  bun scripts/preview-verify.ts [--url <url> | --url-template <template>] [--pr <number>] [--branch <ref>] [--sha <sha>] [--repo <owner/name>] [--path <path>] [--device <desktop|tablet|mobile>] [--flow <name>] [--snapshot <name>] [--session <name>] [--session-bundle <path>] [--publish-dir <path>] [--markdown-out <path>] [--json-out <path>] [--comment-out <path>] [--wait-timeout <seconds>] [--wait-interval <seconds>] [--strict-console] [--strict-http] [--fixture <path>] [--qa-fixture <path>] [--readiness-fixture <path>] [--json]
`);
  process.exit(0);
}

function relative(targetPath: string): string {
  return path.relative(process.cwd(), targetPath) || path.basename(targetPath);
}

function writeFile(targetPath: string, content: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
}

function parseArgs(argv: string[]): PreviewArgs {
  if (argv.includes("--help") || argv.includes("-h")) usage();
  const deploy = parseDeployArgs(argv);
  return {
    deploy,
    markdownOut: deploy.markdownOut,
    jsonOut: deploy.jsonOut,
    commentOut: deploy.commentOut,
    json: deploy.json,
  };
}

function buildCompatQa(report: DeployReport): PreviewQaCompat {
  const firstSnapshot = report.qa.snapshotResults[0];
  return {
    status: report.qa.status,
    healthScore: report.qa.healthScore,
    recommendation: report.qa.recommendation,
    findings: report.qa.findings,
    flowResults: report.qa.flowResults,
    snapshotResult: firstSnapshot
      ? {
          name: firstSnapshot.name,
          status: firstSnapshot.status,
          screenshot: firstSnapshot.screenshot,
          annotation: firstSnapshot.annotation,
        }
      : null,
    artifacts: report.qa.artifacts,
  };
}

function renderFindingLines(findings: DeployReport["qa"]["findings"]): string[] {
  if (!findings.length) return ["- No findings."];
  return findings
    .slice(0, 8)
    .map((item) => `- ${String(item.severity || "info").toUpperCase()}${item.category ? `/${String(item.category).toUpperCase()}` : ""}: ${item.title || "Finding"}${item.detail ? ` - ${item.detail}` : ""}`);
}

function renderFlowLines(flowResults: DeployReport["qa"]["flowResults"]): string[] {
  if (!flowResults.length) return ["- No flows configured."];
  return flowResults.map((item) => `- ${item.name || "flow"}: ${item.status || "unknown"}${item.steps ? ` (${item.steps} steps)` : ""}`);
}

function renderDeployLines(report: DeployReport): string[] {
  if (!report.pathResults.length) return ["- No deploy page checks recorded."];
  return report.pathResults.map((entry) => {
    const parts = [
      `${entry.path} @ ${entry.device}`,
      `status=${entry.status}`,
      entry.httpStatus !== null ? `http=${entry.httpStatus}` : "http=n/a",
      entry.console.errors.length ? `consoleErrors=${entry.console.errors.length}` : "",
      entry.console.warnings.length ? `consoleWarnings=${entry.console.warnings.length}` : "",
      entry.screenshot ? `screenshot=${entry.screenshot}` : "",
    ].filter(Boolean);
    return `- ${parts.join(", ")}`;
  });
}

function renderSnapshotLines(report: DeployReport): string[] {
  if (!report.qa.snapshotResults.length) return ["- No snapshot checks configured."];
  return report.qa.snapshotResults.map((entry) => {
    const parts = [
      `${entry.name} @ ${entry.targetPath} (${entry.device})`,
      `status=${entry.status}`,
      entry.annotation ? `annotation=${entry.annotation}` : "",
      entry.screenshot ? `screenshot=${entry.screenshot}` : "",
      entry.report ? `report=${entry.report}` : "",
    ].filter(Boolean);
    return `- ${parts.join(", ")}`;
  });
}

function renderMarkdown(report: PreviewReport): string {
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
    `- Visual risk: ${report.visualRisk.level.toUpperCase()} (${report.visualRisk.score}/100)`,
    `- Health score: ${report.qa.healthScore ?? "n/a"}`,
    `- Recommendation: ${report.recommendation}`,
    report.runUrl ? `- Workflow run: ${report.runUrl}` : "",
    "",
    "## Preview findings",
    "",
    ...renderFindingLines(report.qa.findings || []),
    "",
    "## Flow results",
    "",
    ...renderFlowLines(report.qa.flowResults || []),
    "",
    "## Deploy checks",
    "",
    ...renderDeployLines(report.deploy),
    "",
    "## Snapshot results",
    "",
    ...renderSnapshotLines(report.deploy),
    "",
    "## Artifacts",
    "",
    `- Artifact root: \`${relative(report.artifactRoot)}\``,
    report.deploy.screenshotManifest ? `- Screenshot manifest: \`${report.deploy.screenshotManifest}\`` : "",
    report.visualPack?.index ? `- Visual pack: \`${report.visualPack.index}\`` : "",
    report.visualPack?.manifest ? `- Visual manifest: \`${report.visualPack.manifest}\`` : "",
    report.visualRisk.topDrivers.length ? `- Visual risk drivers: ${report.visualRisk.topDrivers.join("; ")}` : "",
    published.markdown ? `- QA report: \`${published.markdown}\`` : "",
    published.json ? `- QA json: \`${published.json}\`` : "",
    published.annotation ? `- Annotation: \`${published.annotation}\`` : "",
    published.screenshot ? `- Screenshot: \`${published.screenshot}\`` : "",
  ];

  if (snapshot) {
    lines.push(
      "",
      "## Primary snapshot",
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
  const deploy = await runDeployVerification(args.deploy);
  const context = buildContext(args.deploy);
  const resolved = resolveDeployUrl(args.deploy, context);
  const report: PreviewReport = {
    marker: "<!-- codex-stack:preview-verify -->",
    generatedAt: new Date().toISOString(),
    status: deploy.status,
    url: resolved.url,
    urlSource: deploy.urlSource,
    urlTemplate: deploy.urlTemplate,
    context,
    readiness: deploy.readiness,
    qa: buildCompatQa(deploy),
    visualRisk: deploy.visualRisk,
    artifactRoot: deploy.artifactRoot,
    visualPack: deploy.visualPack,
    runUrl: deploy.runUrl,
    recommendation: deploy.recommendation,
    deploy,
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
