#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { readSessionBundle } from "../browse/src/session-bundle.ts";
import { inferChangedRoutes, type RouteCandidate } from "./qa-diff.ts";
import { writeQaTrendArtifacts } from "./qa-trends.ts";

type QaMode = "quick" | "full" | "regression" | string;
type FindingSeverity = "critical" | "high" | "medium" | "low";
type FindingCategory = "functional" | "visual" | "ux" | "content" | "console" | "performance" | "accessibility" | "qa-system";
type ReportStatus = "critical" | "warning" | "pass";
type SnapshotCommand = "snapshot" | "compare-snapshot";

interface QaArgs {
  url: string;
  flows: string[];
  snapshot: string;
  updateSnapshot: boolean;
  session: string;
  sessionBundle: string;
  mode: QaMode;
  baseRef: string;
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

interface VisualPackRef {
  dir: string;
  index: string;
  manifest: string;
  annotation?: string;
  baselineJson?: string;
  currentJson?: string;
  baselineScreenshot?: string;
  currentScreenshot?: string;
  diffImage?: string;
  imageDiff?: {
    comparedPixels: number;
    changedPixels: number;
    diffRatio: number;
    score: number;
    dimensionsMatch: boolean;
    baseline: { width: number; height: number };
    current: { width: number; height: number };
  } | null;
}

interface SnapshotCommandResult {
  status?: string;
  baseline?: string;
  snapshot?: string;
  current?: string;
  screenshot?: string;
  comparison?: SnapshotComparison;
  visualPack?: VisualPackRef;
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

interface RouteProbeEvidence {
  route: string;
  url: string;
  ok: boolean;
  status: "pass" | "failed" | "skipped";
  httpStatus: number | null;
  title: string;
  bodyLength: number;
  files: string[];
  dynamic: boolean;
  reason: string;
}

interface QaFinding {
  severity: FindingSeverity;
  category: FindingCategory;
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
  visualPack?: VisualPackRef | null;
}

interface PublishedArtifacts {
  dir: string;
  json: string;
  markdown: string;
  annotation: string;
  screenshot: string;
  current: string;
  baseline: string;
  visualPack?: VisualPackRef | null;
}

interface QaArtifacts {
  json?: string;
  markdown?: string;
  latestJson?: string;
  latestMarkdown?: string;
  annotation?: string;
  visualPack?: VisualPackRef | null;
  trendsJson?: string;
  trendsMarkdown?: string;
  published?: PublishedArtifacts;
}

interface QaRouteResult {
  route: string;
  url: string;
  status: "pass" | "failed" | "skipped";
  httpStatus: number | null;
  title: string;
  bodyLength: number;
  files: string[];
  dynamic: boolean;
  reason: string;
}

interface QaDiffSummary {
  baseRef: string;
  changedFiles: string[];
  candidateRoutes: Array<{
    route: string;
    url: string;
    files: string[];
    framework: string;
    dynamic: boolean;
    unresolvedReason: string;
  }>;
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
  routeResults: QaRouteResult[];
  diffSummary: QaDiffSummary | null;
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

interface ProbeCommandResult {
  url?: string;
  finalUrl?: string;
  title?: string;
  status?: number | null;
  ok?: boolean;
  bodyLength?: number;
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
  bun scripts/qa-run.ts <url> [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--session-bundle <path>] [--mode <quick|full|regression|diff-aware>] [--base-ref <ref>] [--publish-dir <path>] [--json]
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
    sessionBundle: "",
    mode: "full",
    baseRef: process.env.CODEX_STACK_QA_BASE_REF || "origin/main",
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
    } else if (arg === "--session-bundle") {
      out.sessionBundle = copy.shift() || "";
    } else if (arg === "--mode") {
      out.mode = copy.shift() || out.mode;
    } else if (arg === "--base-ref") {
      out.baseRef = copy.shift() || out.baseRef;
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

function asVisualPackRef(value: unknown): VisualPackRef | undefined {
  const obj = asObject(value);
  if (!obj) return undefined;
  const dir = asString(obj.dir);
  const index = asString(obj.index);
  const manifest = asString(obj.manifest);
  if (!dir && !index && !manifest) return undefined;
  return {
    dir,
    index,
    manifest,
    annotation: asString(obj.annotation),
    baselineJson: asString(obj.baselineJson),
    currentJson: asString(obj.currentJson),
    baselineScreenshot: asString(obj.baselineScreenshot),
    currentScreenshot: asString(obj.currentScreenshot),
    diffImage: asString(obj.diffImage),
    imageDiff: asObject(obj.imageDiff) ? {
      comparedPixels: asNumber(asObject(obj.imageDiff)?.comparedPixels),
      changedPixels: asNumber(asObject(obj.imageDiff)?.changedPixels),
      diffRatio: asNumber(asObject(obj.imageDiff)?.diffRatio),
      score: asNumber(asObject(obj.imageDiff)?.score),
      dimensionsMatch: Boolean(asObject(obj.imageDiff)?.dimensionsMatch),
      baseline: {
        width: asNumber(asObject(asObject(obj.imageDiff)?.baseline)?.width),
        height: asNumber(asObject(asObject(obj.imageDiff)?.baseline)?.height),
      },
      current: {
        width: asNumber(asObject(asObject(obj.imageDiff)?.current)?.width),
        height: asNumber(asObject(asObject(obj.imageDiff)?.current)?.height),
      },
    } : null,
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
    visualPack: obj?.visualPack ? asVisualPackRef(obj.visualPack) : undefined,
  };
}

function asProbeCommandResult(value: unknown): ProbeCommandResult {
  const obj = asObject(value);
  return {
    url: asString(obj?.url),
    finalUrl: asString(obj?.finalUrl),
    title: asString(obj?.title),
    status: typeof obj?.status === "number" ? obj.status : null,
    ok: obj?.ok === undefined ? true : Boolean(obj?.ok),
    bodyLength: typeof obj?.bodyLength === "number" ? obj.bodyLength : 0,
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
  category: FindingCategory,
  title: string,
  detail: string,
  evidence: Record<string, string> = {},
): QaFinding {
  return { severity, category, title, detail, evidence };
}

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolveSessionBundle(sessionBundlePath: string, session: string): string {
  const absolute = path.resolve(process.cwd(), sessionBundlePath);
  try {
    readSessionBundle(absolute, session);
  } catch {
    throw new Error("Invalid session bundle. Export a fresh bundle with `bun src/cli.ts browse export-session <path>` and retry.");
  }
  return absolute;
}

function prepareSessionBundle(args: QaArgs): string {
  if (!args.sessionBundle) return "";
  const resolved = resolveSessionBundle(args.sessionBundle, args.session);
  if (args.fixture) return resolved;
  const imported = runBrowse(["import-session", resolved, "--session", args.session]);
  if (!imported.ok) {
    throw new Error(cleanSubject(imported.stderr || imported.stdout || "Unable to import the session bundle into the QA browser session."));
  }
  return resolved;
}

function scoreFindings(findings: QaFinding[]): number {
  let score = 100;
  for (const item of findings) {
    if (item.severity === "critical") score -= 40;
    else if (item.severity === "high") score -= 25;
    else if (item.severity === "medium") score -= 12;
    else if (item.severity === "low") score -= 5;
  }
  return Math.max(0, score);
}

function statusFromFindings(findings: QaFinding[]): ReportStatus {
  if (findings.some((item) => item.severity === "critical")) return "critical";
  if (findings.some((item) => item.severity === "high" || item.severity === "medium")) return "warning";
  return "pass";
}

function recommendation(status: ReportStatus, healthScore: number): string {
  if (status === "critical") {
    return "Do not ship. Fix the broken flow or restore the expected UI state before merge.";
  }
  if (status === "warning") {
    return healthScore >= 80
      ? "Manual QA review required. The core checks passed, but there is non-blocking regression evidence to review."
      : "Hold the release until the regression evidence is explained or the baseline is refreshed intentionally.";
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
          return `### ${item.severity.toUpperCase()} • ${item.category}: ${item.title}\n\n${item.detail}\n\nEvidence: ${evidence}`;
        })
        .join("\n\n")
    : "No findings.";
  const flowLines = report.flowResults.length
    ? report.flowResults.map((item) => `- ${item.name}: ${item.status}`).join("\n")
    : "- none";
  const routeLines = report.routeResults.length
    ? report.routeResults
        .map((item) => {
          const statusBits = [
            item.status,
            item.httpStatus !== null ? `http=${item.httpStatus}` : "",
            item.title ? `title=${item.title}` : "",
            item.reason ? `reason=${item.reason}` : "",
          ]
            .filter(Boolean)
            .join(", ");
          return `- ${item.route || item.url || "route"}: ${statusBits}`;
        })
        .join("\n")
    : "- none";
  const diffLines = report.diffSummary
    ? [
        `- Base ref: ${report.diffSummary.baseRef}`,
        report.diffSummary.changedFiles.length ? `- Changed files: ${report.diffSummary.changedFiles.join(", ")}` : "- Changed files: none",
        report.diffSummary.candidateRoutes.length
          ? `- Candidate routes: ${report.diffSummary.candidateRoutes.map((item) => `${item.route}${item.dynamic ? " (dynamic)" : ""}`).join(", ")}`
          : "- Candidate routes: none",
      ].join("\n")
    : "- Diff-aware inference: not used";
  const snapshotLine = report.snapshotResult
    ? [
        `- Snapshot: ${report.snapshotResult.status} (${report.snapshotResult.name})`,
        report.snapshotResult.screenshot ? `- Screenshot: ${report.snapshotResult.screenshot}` : "",
        report.snapshotResult.annotation ? `- Annotation: ${report.snapshotResult.annotation}` : "",
        report.snapshotResult.visualPack?.index ? `- Visual pack: ${report.snapshotResult.visualPack.index}` : "",
        report.snapshotResult.visualPack?.manifest ? `- Visual manifest: ${report.snapshotResult.visualPack.manifest}` : "",
        report.snapshotResult.visualPack?.imageDiff ? `- Image diff score: ${report.snapshotResult.visualPack.imageDiff.score}` : "",
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

## Route results

${routeLines}

## Diff-aware inference

${diffLines}

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

function mergeCandidateFiles(candidates: RouteCandidate[]): Map<string, RouteProbeEvidence> {
  const grouped = new Map<string, RouteProbeEvidence>();
  for (const candidate of candidates) {
    const key = `${candidate.route}:${candidate.url || candidate.unresolvedReason || "manual"}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.files.push(candidate.file);
      continue;
    }
    grouped.set(key, {
      route: candidate.route,
      url: candidate.url,
      ok: !candidate.dynamic,
      status: candidate.dynamic ? "skipped" : "pass",
      httpStatus: null,
      title: "",
      bodyLength: 0,
      files: [candidate.file],
      dynamic: candidate.dynamic,
      reason: candidate.unresolvedReason,
    });
  }
  return grouped;
}

function collectRouteEvidence(args: QaArgs): { routeEvidence: RouteProbeEvidence[]; diffSummary: QaDiffSummary | null } {
  if (args.mode !== "diff-aware") {
    return { routeEvidence: [], diffSummary: null };
  }

  const inferred = inferChangedRoutes({
    cwd: process.cwd(),
    baseRef: args.baseRef,
    baseUrl: args.url,
  });
  const grouped = mergeCandidateFiles(inferred.candidates);
  const routeEvidence = [...grouped.values()];

  for (const item of routeEvidence) {
    if (!item.url || item.dynamic) continue;
    const result = runBrowse(["probe", item.url, "--session", args.session]);
    if (!result.ok) {
      item.ok = false;
      item.status = "failed";
      item.reason = result.stderr || "probe failed";
      continue;
    }
    const parsed = asProbeCommandResult(result.parsed);
    item.httpStatus = parsed.status ?? null;
    item.title = parsed.title || "";
    item.bodyLength = parsed.bodyLength || 0;
    item.ok = parsed.ok !== false && ((parsed.status ?? null) === null || (parsed.status ?? 0) < 400);
    item.status = item.ok ? "pass" : "failed";
    if (!item.ok && !item.reason) {
      item.reason = parsed.status ? `http-${parsed.status}` : "probe failed";
    }
  }

  return {
    routeEvidence,
    diffSummary: {
      baseRef: inferred.baseRef,
      changedFiles: inferred.changedFiles,
      candidateRoutes: routeEvidence.map((item) => ({
        route: item.route,
        url: item.url,
        files: item.files,
        framework: inferred.candidates.find((candidate) => candidate.route === item.route)?.framework || "",
        dynamic: item.dynamic,
        unresolvedReason: item.reason,
      })),
    },
  };
}

function buildReport({
  args,
  snapshotEvidence,
  flowEvidence,
  routeEvidence,
  diffSummary,
}: {
  args: QaArgs;
  snapshotEvidence: SnapshotEvidence | null;
  flowEvidence: FlowEvidence[];
  routeEvidence: RouteProbeEvidence[];
  diffSummary: QaDiffSummary | null;
}): QaReport {
  const findings: QaFinding[] = [];

  for (const flow of flowEvidence) {
    if (!flow.ok) {
      findings.push(
        finding(
          "critical",
          "functional",
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
          "qa-system",
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
            "visual",
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
            "medium",
            "visual",
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

  for (const route of routeEvidence) {
    if (route.dynamic) {
      findings.push(
        finding(
          "low",
          "qa-system",
          `Manual verification required for ${route.route}`,
          "The changed route contains dynamic segments, so codex-stack could not derive a stable preview URL automatically.",
          {
            route: route.route,
            files: route.files.join(", "),
          },
        ),
      );
      continue;
    }
    if (!route.ok) {
      findings.push(
        finding(
          "high",
          "functional",
          `Route probe failed for ${route.route}`,
          route.reason || `The inferred route ${route.route} did not return a healthy response.`,
          {
            route: route.route,
            url: route.url,
            files: route.files.join(", "),
            status: route.httpStatus !== null ? String(route.httpStatus) : "",
          },
        ),
      );
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
    routeResults: routeEvidence.map((item) => ({
      route: item.route,
      url: item.url,
      status: item.status,
      httpStatus: item.httpStatus,
      title: item.title,
      bodyLength: item.bodyLength,
      files: item.files,
      dynamic: item.dynamic,
      reason: item.reason,
    })),
    diffSummary,
    snapshotResult: snapshotEvidence
      ? {
          name: args.snapshot,
          status: snapshotEvidence.result.status || (snapshotEvidence.ok ? "ok" : "failed"),
          baseline: snapshotEvidence.result.baseline || snapshotEvidence.result.snapshot || "",
          current: snapshotEvidence.result.current || "",
          screenshot: snapshotEvidence.result.screenshot || "",
          annotation: "",
          visualPack: snapshotEvidence.result.visualPack || null,
        }
      : null,
    artifacts: snapshotEvidence?.result.visualPack ? { visualPack: snapshotEvidence.result.visualPack } : {},
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
      if (report.snapshotResult?.visualPack?.index) {
        item.evidence.visualPack = report.snapshotResult.visualPack.index;
      }
      if (report.snapshotResult?.visualPack?.diffImage) {
        item.evidence.diffImage = report.snapshotResult.visualPack.diffImage;
      }
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

function copyTree(sourceDir: string, targetDir: string): void {
  const resolvedSource = resolveMaybeRelative(sourceDir);
  if (!resolvedSource || !fs.existsSync(resolvedSource)) return;
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(resolvedSource, { withFileTypes: true })) {
    const sourcePath = path.join(resolvedSource, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

function rewriteEvidencePaths(report: QaReport, pathMap: Record<string, string>): void {
  if (report.snapshotResult) {
    if (pathMap[report.snapshotResult.baseline]) report.snapshotResult.baseline = pathMap[report.snapshotResult.baseline];
    if (pathMap[report.snapshotResult.current]) report.snapshotResult.current = pathMap[report.snapshotResult.current];
    if (pathMap[report.snapshotResult.screenshot]) report.snapshotResult.screenshot = pathMap[report.snapshotResult.screenshot];
    if (pathMap[report.snapshotResult.annotation]) report.snapshotResult.annotation = pathMap[report.snapshotResult.annotation];
    if (report.snapshotResult.visualPack) {
      if (pathMap[report.snapshotResult.visualPack.dir]) report.snapshotResult.visualPack.dir = pathMap[report.snapshotResult.visualPack.dir];
      if (pathMap[report.snapshotResult.visualPack.index]) report.snapshotResult.visualPack.index = pathMap[report.snapshotResult.visualPack.index];
      if (pathMap[report.snapshotResult.visualPack.manifest]) report.snapshotResult.visualPack.manifest = pathMap[report.snapshotResult.visualPack.manifest];
      if (report.snapshotResult.visualPack.annotation && pathMap[report.snapshotResult.visualPack.annotation]) report.snapshotResult.visualPack.annotation = pathMap[report.snapshotResult.visualPack.annotation];
      if (report.snapshotResult.visualPack.baselineJson && pathMap[report.snapshotResult.visualPack.baselineJson]) report.snapshotResult.visualPack.baselineJson = pathMap[report.snapshotResult.visualPack.baselineJson];
      if (report.snapshotResult.visualPack.currentJson && pathMap[report.snapshotResult.visualPack.currentJson]) report.snapshotResult.visualPack.currentJson = pathMap[report.snapshotResult.visualPack.currentJson];
      if (report.snapshotResult.visualPack.baselineScreenshot && pathMap[report.snapshotResult.visualPack.baselineScreenshot]) report.snapshotResult.visualPack.baselineScreenshot = pathMap[report.snapshotResult.visualPack.baselineScreenshot];
      if (report.snapshotResult.visualPack.currentScreenshot && pathMap[report.snapshotResult.visualPack.currentScreenshot]) report.snapshotResult.visualPack.currentScreenshot = pathMap[report.snapshotResult.visualPack.currentScreenshot];
      if (report.snapshotResult.visualPack.diffImage && pathMap[report.snapshotResult.visualPack.diffImage]) report.snapshotResult.visualPack.diffImage = pathMap[report.snapshotResult.visualPack.diffImage];
    }
  }

  if (report.artifacts.visualPack) {
    if (pathMap[report.artifacts.visualPack.dir]) report.artifacts.visualPack.dir = pathMap[report.artifacts.visualPack.dir];
    if (pathMap[report.artifacts.visualPack.index]) report.artifacts.visualPack.index = pathMap[report.artifacts.visualPack.index];
    if (pathMap[report.artifacts.visualPack.manifest]) report.artifacts.visualPack.manifest = pathMap[report.artifacts.visualPack.manifest];
    if (report.artifacts.visualPack.annotation && pathMap[report.artifacts.visualPack.annotation]) report.artifacts.visualPack.annotation = pathMap[report.artifacts.visualPack.annotation];
    if (report.artifacts.visualPack.baselineJson && pathMap[report.artifacts.visualPack.baselineJson]) report.artifacts.visualPack.baselineJson = pathMap[report.artifacts.visualPack.baselineJson];
    if (report.artifacts.visualPack.currentJson && pathMap[report.artifacts.visualPack.currentJson]) report.artifacts.visualPack.currentJson = pathMap[report.artifacts.visualPack.currentJson];
    if (report.artifacts.visualPack.baselineScreenshot && pathMap[report.artifacts.visualPack.baselineScreenshot]) report.artifacts.visualPack.baselineScreenshot = pathMap[report.artifacts.visualPack.baselineScreenshot];
    if (report.artifacts.visualPack.currentScreenshot && pathMap[report.artifacts.visualPack.currentScreenshot]) report.artifacts.visualPack.currentScreenshot = pathMap[report.artifacts.visualPack.currentScreenshot];
    if (report.artifacts.visualPack.diffImage && pathMap[report.artifacts.visualPack.diffImage]) report.artifacts.visualPack.diffImage = pathMap[report.artifacts.visualPack.diffImage];
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

  const sourceVisualPack = report.snapshotResult?.visualPack || report.artifacts.visualPack || null;
  let publishedVisualPack: VisualPackRef | null = null;
  if (sourceVisualPack?.dir) {
    const visualDir = path.join(outputDir, "visual");
    copyTree(sourceVisualPack.dir, visualDir);
    publishedVisualPack = {
      dir: relative(visualDir),
      index: fs.existsSync(path.join(visualDir, "index.html")) ? relative(path.join(visualDir, "index.html")) : "",
      manifest: fs.existsSync(path.join(visualDir, "manifest.json")) ? relative(path.join(visualDir, "manifest.json")) : "",
      annotation: fs.existsSync(path.join(visualDir, "annotation.svg")) ? relative(path.join(visualDir, "annotation.svg")) : "",
      baselineJson: fs.existsSync(path.join(visualDir, "baseline.json")) ? relative(path.join(visualDir, "baseline.json")) : "",
      currentJson: fs.existsSync(path.join(visualDir, "current.json")) ? relative(path.join(visualDir, "current.json")) : "",
      baselineScreenshot: fs.existsSync(path.join(visualDir, "baseline.png")) ? relative(path.join(visualDir, "baseline.png")) : "",
      currentScreenshot: fs.existsSync(path.join(visualDir, "current.png")) ? relative(path.join(visualDir, "current.png")) : "",
      diffImage: fs.existsSync(path.join(visualDir, "diff.png")) ? relative(path.join(visualDir, "diff.png")) : "",
      imageDiff: sourceVisualPack.imageDiff || null,
    };
    pathMap[sourceVisualPack.dir] = publishedVisualPack.dir;
    pathMap[sourceVisualPack.index] = publishedVisualPack.index;
    pathMap[sourceVisualPack.manifest] = publishedVisualPack.manifest;
    if (sourceVisualPack.annotation && publishedVisualPack.annotation) pathMap[sourceVisualPack.annotation] = publishedVisualPack.annotation;
    if (sourceVisualPack.baselineJson && publishedVisualPack.baselineJson) pathMap[sourceVisualPack.baselineJson] = publishedVisualPack.baselineJson;
    if (sourceVisualPack.currentJson && publishedVisualPack.currentJson) pathMap[sourceVisualPack.currentJson] = publishedVisualPack.currentJson;
    if (sourceVisualPack.baselineScreenshot && publishedVisualPack.baselineScreenshot) pathMap[sourceVisualPack.baselineScreenshot] = publishedVisualPack.baselineScreenshot;
    if (sourceVisualPack.currentScreenshot && publishedVisualPack.currentScreenshot) pathMap[sourceVisualPack.currentScreenshot] = publishedVisualPack.currentScreenshot;
    if (sourceVisualPack.diffImage && publishedVisualPack.diffImage) pathMap[sourceVisualPack.diffImage] = publishedVisualPack.diffImage;
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
      visualPack: publishedVisualPack,
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
prepareSessionBundle(args);
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
    routeEvidence: [],
    diffSummary: null,
  });
} else {
  const snapshotEvidence = collectSnapshotEvidence(args);
  const flowEvidence = collectFlowEvidence(args);
  const { routeEvidence, diffSummary } = collectRouteEvidence(args);
  report = buildReport({ args, snapshotEvidence, flowEvidence, routeEvidence, diffSummary });
  report = attachSnapshotAnnotation(report, snapshotEvidence);
}

if (fixture?.snapshot) {
  report = attachSnapshotAnnotation(report, snapshotEvidenceFromFixture(fixture.snapshot, fixture.snapshot.name || args.snapshot));
}

report = writeArtifacts(report);
const trendArtifacts = writeQaTrendArtifacts({ dir: QA_DIR });
report.artifacts = {
  ...report.artifacts,
  trendsJson: path.relative(process.cwd(), trendArtifacts.jsonPath),
  trendsMarkdown: path.relative(process.cwd(), trendArtifacts.markdownPath),
};
if (report.artifacts.json) {
  fs.writeFileSync(path.resolve(process.cwd(), report.artifacts.json), JSON.stringify(report, null, 2));
}
if (report.artifacts.markdown) {
  fs.writeFileSync(path.resolve(process.cwd(), report.artifacts.markdown), buildMarkdown(report));
}
if (report.artifacts.latestJson) {
  fs.writeFileSync(path.resolve(process.cwd(), report.artifacts.latestJson), JSON.stringify(report, null, 2));
}
if (report.artifacts.latestMarkdown) {
  fs.writeFileSync(path.resolve(process.cwd(), report.artifacts.latestMarkdown), buildMarkdown(report));
}
if (args.publishDir) {
  report = publishArtifacts(report, args.publishDir);
}

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(buildMarkdown(report));
}
