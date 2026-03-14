#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

type QaMode = "quick" | "full" | "regression" | string;
type FindingSeverity = "critical" | "warning" | "info";
type ReportStatus = "critical" | "warning" | "pass";
type SnapshotCommand = "snapshot" | "compare-snapshot";

interface QaArgs {
  url: string;
  flows: string[];
  snapshot: string;
  updateSnapshot: boolean;
  session: string;
  mode: QaMode;
  json: boolean;
  fixture: string;
  publishDir: string;
}

interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SnapshotElement {
  selector?: string;
  bounds?: Partial<RectBounds>;
}

interface SnapshotDocument {
  name?: string;
  elements?: SnapshotElement[];
  screenshotPath?: string;
}

interface ChangedSelectorEntry {
  selector?: string;
}

interface SnapshotComparison {
  missingSelectors?: string[];
  changedSelectors?: ChangedSelectorEntry[];
  newSelectors?: string[];
  bodyTextChanged?: boolean;
  titleChanged?: boolean;
  screenshotChanged?: boolean;
}

interface SnapshotCommandResult {
  status?: string;
  baseline?: string;
  snapshot?: string;
  current?: string;
  screenshot?: string;
  comparison?: SnapshotComparison;
}

interface SnapshotEvidence {
  kind: "snapshot";
  command: SnapshotCommand;
  result: SnapshotCommandResult;
  ok: boolean;
  stderr: string;
}

interface FlowEvidence {
  name: string;
  ok: boolean;
  status: "pass" | "failed";
  steps: number;
  stderr: string;
  raw?: unknown;
}

interface QaFinding {
  severity: FindingSeverity;
  title: string;
  detail: string;
  evidence: Record<string, string>;
}

interface QaFlowResult {
  name: string;
  status: "pass" | "failed";
  steps: number;
}

interface QaSnapshotSummary {
  name: string;
  status: string;
  baseline: string;
  current: string;
  screenshot: string;
  annotation: string;
}

interface PublishedArtifacts {
  dir: string;
  json: string;
  markdown: string;
  annotation: string;
  screenshot: string;
  current: string;
  baseline: string;
}

interface QaArtifacts {
  json?: string;
  markdown?: string;
  latestJson?: string;
  latestMarkdown?: string;
  annotation?: string;
  published?: PublishedArtifacts;
}

interface QaReport {
  generatedAt: string;
  url: string;
  mode: QaMode;
  session: string;
  status: ReportStatus;
  healthScore: number;
  recommendation: string;
  findings: QaFinding[];
  flowResults: QaFlowResult[];
  snapshotResult: QaSnapshotSummary | null;
  artifacts: QaArtifacts;
}

interface AnnotationMarker {
  selector: string;
  kind: "missing" | "changed" | "new";
  color: string;
  label: string;
  bounds: RectBounds;
}

interface AnnotationArtifact {
  annotation: string;
  screenshot: string;
  markers: number;
}

interface BrowseResult {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
  parsed: unknown;
}

interface QaFixtureSnapshot extends SnapshotCommandResult {
  name?: string;
  ok?: boolean;
  command?: SnapshotCommand;
  result?: SnapshotCommandResult;
  stderr?: string;
}

interface QaFixtureFlow {
  name: string;
  ok?: boolean;
  steps?: number;
  stderr?: string;
}

interface QaFixture {
  url?: string;
  snapshot?: QaFixtureSnapshot;
  flows?: QaFixtureFlow[];
}

const QA_DIR = path.resolve(process.cwd(), ".codex-stack", "qa");
const QA_ANNOTATION_DIR = path.join(QA_DIR, "annotations");
const BROWSE_CLI = path.resolve(process.cwd(), "browse", "src", "cli.ts");
const BUN_RUNTIME = process.execPath || "bun";

function usage(): never {
  console.log(`qa-run

Usage:
  bun scripts/qa-run.ts <url> [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--mode <quick|full|regression>] [--publish-dir <path>] [--json]
  bun scripts/qa-run.ts --fixture <path> [--publish-dir <path>] [--json]
`);
  process.exit(0);
}

function parseArgs(argv: string[]): QaArgs {
  const out: QaArgs = {
    url: "",
    flows: [],
    snapshot: "",
    updateSnapshot: false,
    session: "qa",
    mode: "full",
    json: false,
    fixture: "",
    publishDir: "",
  };

  const copy = [...argv];
  if (copy[0] && !copy[0].startsWith("--")) {
    out.url = copy.shift() || "";
  }

  while (copy.length) {
    const arg = copy.shift();
    if (arg === "--flow") {
      out.flows.push(copy.shift() || "");
    } else if (arg === "--snapshot") {
      out.snapshot = copy.shift() || "";
    } else if (arg === "--update-snapshot") {
      out.updateSnapshot = true;
    } else if (arg === "--session") {
      out.session = copy.shift() || out.session;
    } else if (arg === "--mode") {
      out.mode = copy.shift() || out.mode;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--fixture") {
      out.fixture = copy.shift() || "";
    } else if (arg === "--publish-dir") {
      out.publishDir = copy.shift() || "";
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }

  out.flows = [...new Set(out.flows.filter(Boolean))];
  if (!out.fixture && !out.url) {
    usage();
  }
  return out;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "qa";
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asChangedSelectorEntries(value: unknown): ChangedSelectorEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({ selector: asString(item.selector) }));
}

function asSnapshotComparison(value: unknown): SnapshotComparison {
  const obj = asObject(value);
  return {
    missingSelectors: asStringArray(obj?.missingSelectors),
    changedSelectors: asChangedSelectorEntries(obj?.changedSelectors),
    newSelectors: asStringArray(obj?.newSelectors),
    bodyTextChanged: Boolean(obj?.bodyTextChanged),
    titleChanged: Boolean(obj?.titleChanged),
    screenshotChanged: Boolean(obj?.screenshotChanged),
  };
}

function asSnapshotCommandResult(value: unknown): SnapshotCommandResult {
  const obj = asObject(value);
  return {
    status: asString(obj?.status),
    baseline: asString(obj?.baseline),
    snapshot: asString(obj?.snapshot),
    current: asString(obj?.current),
    screenshot: asString(obj?.screenshot),
    comparison: obj?.comparison ? asSnapshotComparison(obj.comparison) : undefined,
  };
}

function asFlowStepCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function runBrowse(args: string[]): BrowseResult {
  const result = spawnSync(BUN_RUNTIME, [BROWSE_CLI, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  let parsed: unknown = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
  }
  return {
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
    stdout,
    stderr,
    parsed,
  };
}

function finding(
  severity: FindingSeverity,
  title: string,
  detail: string,
  evidence: Record<string, string> = {},
): QaFinding {
  return { severity, title, detail, evidence };
}

function scoreFindings(findings: QaFinding[]): number {
  let score = 100;
  for (const item of findings) {
    if (item.severity === "critical") score -= 40;
    else if (item.severity === "warning") score -= 15;
  }
  return Math.max(0, score);
}

function statusFromFindings(findings: QaFinding[]): ReportStatus {
  if (findings.some((item) => item.severity === "critical")) return "critical";
  if (findings.some((item) => item.severity === "warning")) return "warning";
  return "pass";
}

function recommendation(status: ReportStatus, healthScore: number): string {
  if (status === "critical") {
    return "Do not ship. Fix the broken flow or restore the expected UI state before merge.";
  }
  if (status === "warning") {
    return healthScore >= 80
      ? "Manual QA review required. The flow mostly works, but visible UI drift was detected."
      : "Hold the release until the snapshot drift is explained or the baseline is refreshed intentionally.";
  }
  return "QA checks passed. Keep the snapshot baseline fresh when intentional UI changes land.";
}

function buildMarkdown(report: QaReport): string {
  const findingLines = report.findings.length
    ? report.findings
        .map((item) => {
          const evidence = Object.entries(item.evidence)
            .map(([key, value]) => `${key}=${value}`)
            .join(", ") || "none";
          return `### ${item.severity.toUpperCase()}: ${item.title}\n\n${item.detail}\n\nEvidence: ${evidence}`;
        })
        .join("\n\n")
    : "No findings.";
  const flowLines = report.flowResults.length
    ? report.flowResults.map((item) => `- ${item.name}: ${item.status}`).join("\n")
    : "- none";
  const snapshotLine = report.snapshotResult
    ? [
        `- Snapshot: ${report.snapshotResult.status} (${report.snapshotResult.name})`,
        report.snapshotResult.screenshot ? `- Screenshot: ${report.snapshotResult.screenshot}` : "",
        report.snapshotResult.annotation ? `- Annotation: ${report.snapshotResult.annotation}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "- Snapshot: none";

  return `# QA Report

- URL: ${report.url || "fixture"}
- Mode: ${report.mode}
- Session: ${report.session}
- Generated: ${report.generatedAt}
- Status: ${report.status}
- Health score: ${report.healthScore}
- Recommendation: ${report.recommendation}

## Findings

${findingLines}

## Flow results

${flowLines}

## Snapshot

${snapshotLine}
`;
}

function relative(filePath: string): string {
  return path.relative(process.cwd(), filePath) || path.basename(filePath);
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function resolveMaybeRelative(filePath: string): string {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function escapeXml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadSnapshotDocument(refOrObject: string | SnapshotDocument | null | undefined): SnapshotDocument | null {
  if (!refOrObject) return null;
  if (typeof refOrObject === "object") return refOrObject;
  const resolved = resolveMaybeRelative(refOrObject);
  return resolved && fs.existsSync(resolved) ? readJson<SnapshotDocument | null>(resolved, null) : null;
}

function pngDimensions(filePath: string): { width: number; height: number } {
  const resolved = resolveMaybeRelative(filePath);
  if (!resolved || !fs.existsSync(resolved)) return { width: 1, height: 1 };
  const buffer = fs.readFileSync(resolved);
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return { width: 1, height: 1 };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function screenshotDataUri(filePath: string): string {
  const resolved = resolveMaybeRelative(filePath);
  if (!resolved || !fs.existsSync(resolved)) return "";
  return `data:image/png;base64,${fs.readFileSync(resolved).toString("base64")}`;
}

function normalizeBounds(bounds: Partial<RectBounds> | undefined): RectBounds | null {
  if (!bounds) return null;
  return {
    x: asNumber(bounds.x),
    y: asNumber(bounds.y),
    width: asNumber(bounds.width),
    height: asNumber(bounds.height),
  };
}

function selectorBounds(snapshot: SnapshotDocument | null, selector: string): RectBounds | null {
  const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];
  const match = elements.find((item) => item?.selector === selector);
  return normalizeBounds(match?.bounds);
}

function annotationMarkers(
  comparison: SnapshotComparison | undefined,
  baselineSnapshot: SnapshotDocument | null,
  currentSnapshot: SnapshotDocument | null,
): AnnotationMarker[] {
  const markers: AnnotationMarker[] = [];
  for (const selector of comparison?.missingSelectors || []) {
    const bounds = selectorBounds(baselineSnapshot, selector);
    if (!bounds) continue;
    markers.push({
      selector,
      kind: "missing",
      color: "#d73a49",
      label: `Missing: ${selector}`,
      bounds,
    });
  }

  for (const item of comparison?.changedSelectors || []) {
    const selector = item.selector || "";
    const bounds = selectorBounds(currentSnapshot, selector) || selectorBounds(baselineSnapshot, selector);
    if (!selector || !bounds) continue;
    markers.push({
      selector,
      kind: "changed",
      color: "#fb8500",
      label: `Changed: ${selector}`,
      bounds,
    });
  }

  for (const selector of comparison?.newSelectors || []) {
    const bounds = selectorBounds(currentSnapshot, selector);
    if (!bounds) continue;
    markers.push({
      selector,
      kind: "new",
      color: "#2563eb",
      label: `New: ${selector}`,
      bounds,
    });
  }

  return markers;
}

function renderAnnotationSvg({
  screenshotPath,
  markers,
  title,
}: {
  screenshotPath: string;
  markers: AnnotationMarker[];
  title: string;
}): string {
  const screenshot = resolveMaybeRelative(screenshotPath);
  if (!screenshot || !fs.existsSync(screenshot)) return "";
  const { width, height } = pngDimensions(screenshot);
  const imageHref = screenshotDataUri(screenshot);
  const topPadding = 56;
  const markerSvg = markers
    .map((marker, index) => {
      const x = marker.bounds.x;
      const y = marker.bounds.y + topPadding;
      const w = Math.max(4, marker.bounds.width);
      const h = Math.max(4, marker.bounds.height);
      const labelY = Math.max(20, y - 6);
      return [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${marker.color}" stroke-width="3"/>`,
        `<rect x="${x}" y="${Math.max(4, labelY - 18)}" width="${Math.min(width - x, Math.max(80, marker.label.length * 7))}" height="18" fill="${marker.color}" opacity="0.92"/>`,
        `<text x="${x + 6}" y="${labelY - 5}" font-family="monospace" font-size="11" fill="#ffffff">${escapeXml(`${index + 1}. ${marker.label}`)}</text>`,
      ].join("");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + topPadding}" viewBox="0 0 ${width} ${height + topPadding}">
  <rect width="${width}" height="${height + topPadding}" fill="#0f172a"/>
  <text x="16" y="24" font-family="monospace" font-size="14" fill="#ffffff">${escapeXml(title)}</text>
  <text x="16" y="44" font-family="monospace" font-size="11" fill="#cbd5e1">${escapeXml(markers.length ? `${markers.length} annotated issue(s)` : "No element-level annotations available")}</text>
  <image href="${imageHref}" x="0" y="${topPadding}" width="${width}" height="${height}"/>
  ${markerSvg}
</svg>
`;
}

function createAnnotatedSnapshotArtifact(report: QaReport, snapshotEvidence: SnapshotEvidence | null): AnnotationArtifact | null {
  if (!snapshotEvidence?.ok) return null;
  if (snapshotEvidence.command !== "compare-snapshot") return null;
  const result = snapshotEvidence.result;
  const comparison = result.comparison;
  const baselineSnapshot = loadSnapshotDocument(result.baseline);
  const currentSnapshot = loadSnapshotDocument(result.current);
  const markers = annotationMarkers(comparison, baselineSnapshot, currentSnapshot);
  const screenshotPath = result.screenshot || currentSnapshot?.screenshotPath || "";
  if (!screenshotPath) return null;

  ensureDir(QA_ANNOTATION_DIR);
  const annotationPath = path.join(QA_ANNOTATION_DIR, `${timestampSlug()}-${slugify(report.url || report.snapshotResult?.name || "qa")}.svg`);
  const svg = renderAnnotationSvg({
    screenshotPath,
    markers,
    title: `QA annotation • ${report.snapshotResult?.name || "snapshot"}`,
  });
  if (!svg) return null;
  writeFile(annotationPath, svg);

  return {
    annotation: relative(annotationPath),
    screenshot: result.screenshot || "",
    markers: markers.length,
  };
}

function collectSnapshotEvidence(args: QaArgs): SnapshotEvidence | null {
  if (!args.snapshot) return null;
  if (args.updateSnapshot) {
    const saved = runBrowse(["snapshot", args.url, args.snapshot, "--session", args.session]);
    return {
      kind: "snapshot",
      command: "snapshot",
      result: saved.parsed ? asSnapshotCommandResult(saved.parsed) : { status: saved.ok ? "saved" : "failed" },
      ok: saved.ok,
      stderr: saved.stderr,
    };
  }

  const compared = runBrowse(["compare-snapshot", args.url, args.snapshot, "--session", args.session]);
  return {
    kind: "snapshot",
    command: "compare-snapshot",
    result: compared.parsed ? asSnapshotCommandResult(compared.parsed) : { status: compared.ok ? "unknown" : "failed" },
    ok: compared.ok,
    stderr: compared.stderr,
  };
}

function collectFlowEvidence(args: QaArgs): FlowEvidence[] {
  return args.flows.map((flowName) => {
    const result = runBrowse(["run-flow", args.url, flowName, "--session", args.session]);
    return {
      name: flowName,
      ok: result.ok,
      status: result.ok ? "pass" : "failed",
      steps: asFlowStepCount(result.parsed),
      stderr: result.stderr,
      raw: result.parsed || result.stdout,
    };
  });
}

function buildReport({
  args,
  snapshotEvidence,
  flowEvidence,
}: {
  args: QaArgs;
  snapshotEvidence: SnapshotEvidence | null;
  flowEvidence: FlowEvidence[];
}): QaReport {
  const findings: QaFinding[] = [];

  for (const flow of flowEvidence) {
    if (!flow.ok) {
      findings.push(
        finding(
          "critical",
          `Flow failed: ${flow.name}`,
          flow.stderr || `The ${flow.name} flow exited with a non-zero status.`,
          { flow: flow.name },
        ),
      );
    }
  }

  if (snapshotEvidence) {
    const snapshotResult = snapshotEvidence.result;
    if (!snapshotEvidence.ok) {
      findings.push(
        finding(
          "critical",
          `Snapshot command failed: ${snapshotEvidence.command}`,
          snapshotEvidence.stderr || "The snapshot command failed before producing evidence.",
          { snapshot: args.snapshot },
        ),
      );
    } else if (snapshotEvidence.command === "compare-snapshot" && snapshotResult.comparison) {
      const comparison = snapshotResult.comparison;
      if ((comparison.missingSelectors || []).length) {
        findings.push(
          finding(
            "critical",
            "Expected UI selectors are missing",
            `The live page no longer contains ${(comparison.missingSelectors || []).length} selectors from the baseline.`,
            {
              snapshot: args.snapshot,
              baseline: snapshotResult.baseline || "",
              current: snapshotResult.current || "",
            },
          ),
        );
      }
      if (
        (comparison.changedSelectors || []).length ||
        comparison.bodyTextChanged ||
        comparison.titleChanged ||
        comparison.screenshotChanged ||
        (comparison.newSelectors || []).length
      ) {
        findings.push(
          finding(
            "warning",
            "Snapshot drift detected",
            `The page differs from the saved baseline for ${args.snapshot}.`,
            {
              snapshot: args.snapshot,
              screenshot: snapshotResult.screenshot || "",
              current: snapshotResult.current || "",
            },
          ),
        );
      }
    }
  }

  const healthScore = scoreFindings(findings);
  const status = statusFromFindings(findings);
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    url: args.url,
    mode: args.mode,
    session: args.session,
    status,
    healthScore,
    recommendation: recommendation(status, healthScore),
    findings,
    flowResults: flowEvidence.map((item) => ({ name: item.name, status: item.status, steps: item.steps })),
    snapshotResult: snapshotEvidence
      ? {
          name: args.snapshot,
          status: snapshotEvidence.result.status || (snapshotEvidence.ok ? "ok" : "failed"),
          baseline: snapshotEvidence.result.baseline || snapshotEvidence.result.snapshot || "",
          current: snapshotEvidence.result.current || "",
          screenshot: snapshotEvidence.result.screenshot || "",
          annotation: "",
        }
      : null,
    artifacts: {},
  };
}

function attachSnapshotAnnotation(report: QaReport, snapshotEvidence: SnapshotEvidence | null): QaReport {
  const artifact = createAnnotatedSnapshotArtifact(report, snapshotEvidence);
  if (!artifact) return report;

  if (report.snapshotResult) {
    report.snapshotResult.annotation = artifact.annotation;
  }
  for (const item of report.findings) {
    if (item.evidence.snapshot) {
      item.evidence.annotation = artifact.annotation;
      item.evidence.screenshot = item.evidence.screenshot || artifact.screenshot;
    }
  }
  report.artifacts.annotation = artifact.annotation;
  return report;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function copyIfExists(sourcePath: string, targetPath: string): string {
  const resolvedSource = resolveMaybeRelative(sourcePath);
  if (!resolvedSource || !fs.existsSync(resolvedSource)) return "";
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(resolvedSource, targetPath);
  return targetPath;
}

function rewriteEvidencePaths(report: QaReport, pathMap: Record<string, string>): void {
  if (report.snapshotResult) {
    if (pathMap[report.snapshotResult.baseline]) report.snapshotResult.baseline = pathMap[report.snapshotResult.baseline];
    if (pathMap[report.snapshotResult.current]) report.snapshotResult.current = pathMap[report.snapshotResult.current];
    if (pathMap[report.snapshotResult.screenshot]) report.snapshotResult.screenshot = pathMap[report.snapshotResult.screenshot];
    if (pathMap[report.snapshotResult.annotation]) report.snapshotResult.annotation = pathMap[report.snapshotResult.annotation];
  }

  for (const item of report.findings) {
    for (const [key, value] of Object.entries(item.evidence)) {
      if (pathMap[value]) {
        item.evidence[key] = pathMap[value];
      }
    }
  }
}

function publishArtifacts(report: QaReport, publishDir: string): QaReport {
  const outputDir = path.resolve(process.cwd(), publishDir);
  ensureDir(outputDir);

  const published = clone(report);
  const pathMap: Record<string, string> = {};
  const annotationSource = report.snapshotResult?.annotation || report.artifacts.annotation || "";
  const copyTargets: Array<[string, string]> = [
    [report.artifacts.json || "", path.join(outputDir, "report.json")],
    [report.artifacts.markdown || "", path.join(outputDir, "report.md")],
    [annotationSource, path.join(outputDir, "annotation.svg")],
    [report.snapshotResult?.screenshot || "", path.join(outputDir, "screenshot.png")],
    [report.snapshotResult?.current || "", path.join(outputDir, "current.json")],
    [report.snapshotResult?.baseline || "", path.join(outputDir, "baseline.json")],
  ];

  for (const [source, target] of copyTargets) {
    if (!source) continue;
    const copied = copyIfExists(source, target);
    if (copied) {
      pathMap[source] = relative(copied);
    }
  }

  rewriteEvidencePaths(published, pathMap);
  const publishedJsonPath = path.join(outputDir, "report.json");
  const publishedMarkdownPath = path.join(outputDir, "report.md");
  published.artifacts = {
    ...published.artifacts,
    published: {
      dir: relative(outputDir),
      json: relative(publishedJsonPath),
      markdown: relative(publishedMarkdownPath),
      annotation: pathMap[annotationSource] || "",
      screenshot: pathMap[report.snapshotResult?.screenshot || ""] || "",
      current: pathMap[report.snapshotResult?.current || ""] || "",
      baseline: pathMap[report.snapshotResult?.baseline || ""] || "",
    },
  };

  writeFile(publishedJsonPath, JSON.stringify(published, null, 2));
  writeFile(publishedMarkdownPath, buildMarkdown(published));
  return published;
}

function writeArtifacts(report: QaReport): QaReport {
  ensureDir(QA_DIR);
  const stamp = `${timestampSlug()}-${slugify(report.url || report.snapshotResult?.name || "fixture")}`;
  const jsonPath = path.join(QA_DIR, `${stamp}.json`);
  const markdownPath = path.join(QA_DIR, `${stamp}.md`);
  const latestJsonPath = path.join(QA_DIR, "latest.json");
  const latestMarkdownPath = path.join(QA_DIR, "latest.md");

  report.artifacts = {
    ...report.artifacts,
    json: relative(jsonPath),
    markdown: relative(markdownPath),
    latestJson: relative(latestJsonPath),
    latestMarkdown: relative(latestMarkdownPath),
  };

  const markdown = buildMarkdown(report);
  writeFile(jsonPath, JSON.stringify(report, null, 2));
  writeFile(markdownPath, markdown);
  writeFile(latestJsonPath, JSON.stringify(report, null, 2));
  writeFile(latestMarkdownPath, markdown);
  return report;
}

function loadFixture(filePath: string): QaFixture {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8")) as QaFixture;
}

function snapshotEvidenceFromFixture(snapshot: QaFixtureSnapshot, snapshotName: string): SnapshotEvidence {
  return {
    kind: "snapshot",
    ok: snapshot.ok !== false,
    command: snapshot.command || "compare-snapshot",
    result: snapshot.result ? asSnapshotCommandResult(snapshot.result) : asSnapshotCommandResult(snapshot),
    stderr: snapshot.stderr || "",
  };
}

const args = parseArgs(process.argv.slice(2));
let report: QaReport;
let fixture: QaFixture | null = null;

if (args.fixture) {
  fixture = loadFixture(args.fixture);
  report = buildReport({
    args: {
      ...args,
      url: fixture.url || args.url,
      snapshot: fixture.snapshot?.name || args.snapshot,
    },
    snapshotEvidence: fixture.snapshot
      ? snapshotEvidenceFromFixture(fixture.snapshot, fixture.snapshot.name || args.snapshot)
      : null,
    flowEvidence: Array.isArray(fixture.flows)
      ? fixture.flows.map((item) => ({
          name: item.name,
          ok: item.ok !== false,
          status: item.ok === false ? "failed" : "pass",
          steps: item.steps || 0,
          stderr: item.stderr || "",
        }))
      : [],
  });
} else {
  const snapshotEvidence = collectSnapshotEvidence(args);
  const flowEvidence = collectFlowEvidence(args);
  report = buildReport({ args, snapshotEvidence, flowEvidence });
  report = attachSnapshotAnnotation(report, snapshotEvidence);
}

if (fixture?.snapshot) {
  report = attachSnapshotAnnotation(report, snapshotEvidenceFromFixture(fixture.snapshot, fixture.snapshot.name || args.snapshot));
}

report = writeArtifacts(report);
if (args.publishDir) {
  report = publishArtifacts(report, args.publishDir);
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(buildMarkdown(report));
}
