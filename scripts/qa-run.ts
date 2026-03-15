#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { readSessionBundle } from "../browse/src/session-bundle.ts";
import { inferChangedRoutes, type RouteCandidate } from "./qa-diff.ts";
import {
  isDecisionExpired,
  isDecisionExpiringSoon,
  matchDecision,
  readDecisionRecords,
  type QaDecisionCategory,
  type QaDecisionKind,
  type QaDecisionRecord,
  type QaDecisionTarget,
} from "./qa-decisions.ts";
import { writeQaTrendArtifacts } from "./qa-trends.ts";
import { computeBaselineFreshness, computeVisualRisk, type BaselineFreshness, type VisualRiskSummary } from "./visual-risk.ts";

type QaMode = "quick" | "full" | "regression" | string;
type FindingSeverity = "critical" | "high" | "medium" | "low";
type FindingCategory = "functional" | "visual" | "ux" | "content" | "console" | "performance" | "accessibility" | "qa-system";
type ReportStatus = "critical" | "warning" | "pass";
type SnapshotCommand = "snapshot" | "compare-snapshot";
type AccessibilityImpact = "critical" | "serious" | "moderate" | "minor";

interface QaArgs {
  url: string;
  flows: string[];
  snapshot: string;
  updateSnapshot: boolean;
  session: string;
  device: string;
  sessionBundle: string;
  mode: QaMode;
  baseRef: string;
  a11y: boolean;
  a11yScopes: string[];
  a11yImpact: AccessibilityImpact;
  perf: boolean;
  perfBudgets: string[];
  perfWaitMs: number;
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
  capturedAt?: string;
  url?: string;
  origin?: string;
  routePath?: string;
  device?: string;
  page?: {
    width?: number;
    height?: number;
  };
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
  baselineFreshness?: BaselineFreshness | null;
  visualPack?: VisualPackRef | null;
}

interface AccessibilityViolation {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  selectors: string[];
  nodeCount: number;
}

interface QaAccessibilitySummary {
  enabled: boolean;
  minimumImpact: AccessibilityImpact;
  scopeSelectors: string[];
  violationCount: number;
  passCount: number;
  incompleteCount: number;
  topRules: string[];
  violations: AccessibilityViolation[];
  artifactJson?: string;
  artifactMarkdown?: string;
}

interface PerformanceMetrics {
  ttfb: number | null;
  domContentLoaded: number | null;
  loadEvent: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  jsHeapUsed: number | null;
  resourceCount: number;
  failedResourceCount: number;
}

interface PerformanceBudgetResult {
  metric: string;
  label: string;
  threshold: number;
  unit: string;
  severity: "high" | "medium";
  raw: string;
  value: number | null;
  passed: boolean;
  detail: string;
}

interface QaPerformanceSummary {
  enabled: boolean;
  waitMs: number;
  metrics: PerformanceMetrics;
  budgets: PerformanceBudgetResult[];
  budgetViolationCount: number;
  topViolations: string[];
  artifactJson?: string;
  artifactMarkdown?: string;
}

interface PublishedArtifacts {
  dir: string;
  json: string;
  markdown: string;
  annotation: string;
  screenshot: string;
  current: string;
  baseline: string;
  accessibilityJson?: string;
  accessibilityMarkdown?: string;
  performanceJson?: string;
  performanceMarkdown?: string;
  visualPack?: VisualPackRef | null;
}

interface QaArtifacts {
  json?: string;
  markdown?: string;
  latestJson?: string;
  latestMarkdown?: string;
  annotation?: string;
  accessibilityJson?: string;
  accessibilityMarkdown?: string;
  performanceJson?: string;
  performanceMarkdown?: string;
  visualPack?: VisualPackRef | null;
  trendsJson?: string;
  trendsMarkdown?: string;
  published?: PublishedArtifacts;
}

interface QaDecisionSummary {
  totalDecisions: number;
  appliedCount: number;
  approvedCount: number;
  suppressedCount: number;
  refreshRequiredCount: number;
  expiredCount: number;
  unresolvedCount: number;
  expiringSoonCount: number;
}

interface QaAppliedDecision {
  id: string;
  decision: string;
  category: QaDecisionCategory;
  kind: QaDecisionKind;
  snapshot: string;
  routePath: string;
  device: string;
  reason: string;
  author: string;
  createdAt: string;
  reviewAfter?: string;
  expiresAt?: string;
  file: string;
  matchedFindings: string[];
  effect: "downgraded" | "suppressed" | "noted";
  originalSeverity?: FindingSeverity;
  resultingSeverity?: FindingSeverity;
}

interface QaExpiredDecision {
  id: string;
  decision: string;
  category: QaDecisionCategory;
  kind: QaDecisionKind;
  snapshot: string;
  routePath: string;
  device: string;
  reason: string;
  author: string;
  createdAt: string;
  expiresAt?: string;
  file: string;
  matchedFindings: string[];
}

interface QaUnresolvedRegression {
  category: QaDecisionCategory;
  kind: QaDecisionKind;
  title: string;
  severity: FindingSeverity;
  snapshot: string;
  routePath: string;
  device: string;
  selectors: string[];
  ruleId: string;
  metric: string;
  decisionStatus?: string;
  decisionFile?: string;
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
  accessibility: QaAccessibilitySummary | null;
  performance: QaPerformanceSummary | null;
  visualRisk: VisualRiskSummary;
  decisionSummary: QaDecisionSummary;
  appliedDecisions: QaAppliedDecision[];
  expiredDecisions: QaExpiredDecision[];
  unresolvedRegressions: QaUnresolvedRegression[];
  artifacts: QaArtifacts;
}

interface TriageCandidate {
  findingIndex: number;
  target: QaDecisionTarget;
  title: string;
  severity: FindingSeverity;
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

interface AccessibilityCommandResult {
  url?: string;
  finalUrl?: string;
  title?: string;
  minimumImpact?: string;
  scopeSelectors?: string[];
  violationCount?: number;
  passCount?: number;
  incompleteCount?: number;
  topRules?: string[];
  violations?: AccessibilityViolation[];
  status?: string;
}

interface PerformanceCommandResult {
  url?: string;
  finalUrl?: string;
  title?: string;
  waitMs?: number;
  metrics?: Partial<PerformanceMetrics>;
  budgets?: PerformanceBudgetResult[];
  budgetViolationCount?: number;
  topViolations?: string[];
  status?: string;
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
  accessibility?: QaAccessibilitySummary | null;
  performance?: QaPerformanceSummary | null;
}

const QA_DIR = path.resolve(process.cwd(), ".codex-stack", "qa");
const QA_ANNOTATION_DIR = path.join(QA_DIR, "annotations");
const BROWSE_CLI = path.resolve(process.cwd(), "browse", "src", "cli.ts");
const BUN_RUNTIME = process.execPath || "bun";

function usage(): never {
  console.log(`qa-run

Usage:
  bun scripts/qa-run.ts <url> [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--device <desktop|tablet|mobile>] [--session-bundle <path>] [--mode <quick|full|regression|diff-aware>] [--base-ref <ref>] [--a11y] [--a11y-scope <selector>] [--a11y-impact <critical|serious|moderate|minor>] [--perf] [--perf-budget <metric=value>] [--perf-wait-ms <n>] [--publish-dir <path>] [--json]
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
    device: "desktop",
    sessionBundle: "",
    mode: "full",
    baseRef: process.env.CODEX_STACK_QA_BASE_REF || "origin/main",
    a11y: false,
    a11yScopes: [],
    a11yImpact: "serious",
    perf: false,
    perfBudgets: [],
    perfWaitMs: 250,
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
    } else if (arg === "--device") {
      out.device = copy.shift() || out.device;
    } else if (arg === "--session-bundle") {
      out.sessionBundle = copy.shift() || "";
    } else if (arg === "--mode") {
      out.mode = copy.shift() || out.mode;
    } else if (arg === "--base-ref") {
      out.baseRef = copy.shift() || out.baseRef;
    } else if (arg === "--a11y") {
      out.a11y = true;
    } else if (arg === "--a11y-scope") {
      out.a11yScopes.push(copy.shift() || "");
    } else if (arg === "--a11y-impact") {
      const raw = String(copy.shift() || out.a11yImpact).trim().toLowerCase();
      if (raw === "critical" || raw === "serious" || raw === "moderate" || raw === "minor") {
        out.a11yImpact = raw;
      }
    } else if (arg === "--perf") {
      out.perf = true;
    } else if (arg === "--perf-budget") {
      out.perfBudgets.push(copy.shift() || "");
    } else if (arg === "--perf-wait-ms") {
      const raw = Number.parseInt(copy.shift() || "", 10);
      out.perfWaitMs = Number.isFinite(raw) && raw >= 0 ? raw : out.perfWaitMs;
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
  out.a11yScopes = [...new Set(out.a11yScopes.filter(Boolean))];
  out.perfBudgets = [...new Set(out.perfBudgets.filter(Boolean))];
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

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function asAccessibilityViolation(value: unknown): AccessibilityViolation | null {
  const obj = asObject(value);
  if (!obj) return null;
  const id = asString(obj.id);
  const help = asString(obj.help);
  if (!id && !help) return null;
  return {
    id,
    impact: asString(obj.impact),
    description: asString(obj.description),
    help,
    helpUrl: asString(obj.helpUrl),
    selectors: asStringArray(obj.selectors),
    nodeCount: asNumber(obj.nodeCount),
  };
}

function asAccessibilityResult(value: unknown): QaAccessibilitySummary | null {
  const obj = asObject(value);
  if (!obj) return null;
  const violations = Array.isArray(obj.violations)
    ? obj.violations.map(asAccessibilityViolation).filter((item): item is AccessibilityViolation => Boolean(item))
    : [];
  return {
    enabled: true,
    minimumImpact: (() => {
      const raw = asString(obj.minimumImpact).toLowerCase();
      if (raw === "critical" || raw === "serious" || raw === "moderate" || raw === "minor") return raw;
      return "serious";
    })(),
    scopeSelectors: asStringArray(obj.scopeSelectors),
    violationCount: typeof obj.violationCount === "number" ? obj.violationCount : violations.length,
    passCount: asNumber(obj.passCount),
    incompleteCount: asNumber(obj.incompleteCount),
    topRules: asStringArray(obj.topRules),
    violations,
  };
}

function asPerformanceMetrics(value: unknown): PerformanceMetrics {
  const obj = asObject(value);
  return {
    ttfb: asNullableNumber(obj?.ttfb),
    domContentLoaded: asNullableNumber(obj?.domContentLoaded),
    loadEvent: asNullableNumber(obj?.loadEvent),
    fcp: asNullableNumber(obj?.fcp),
    lcp: asNullableNumber(obj?.lcp),
    cls: asNullableNumber(obj?.cls),
    jsHeapUsed: asNullableNumber(obj?.jsHeapUsed),
    resourceCount: typeof obj?.resourceCount === "number" ? obj.resourceCount : 0,
    failedResourceCount: typeof obj?.failedResourceCount === "number" ? obj.failedResourceCount : 0,
  };
}

function asPerformanceBudgetResult(value: unknown): PerformanceBudgetResult | null {
  const obj = asObject(value);
  if (!obj) return null;
  const metric = asString(obj.metric);
  if (!metric) return null;
  const severity = asString(obj.severity) === "high" ? "high" : "medium";
  return {
    metric,
    label: asString(obj.label) || metric,
    threshold: typeof obj.threshold === "number" ? obj.threshold : 0,
    unit: asString(obj.unit),
    severity,
    raw: asString(obj.raw) || metric,
    value: asNullableNumber(obj.value),
    passed: obj.passed !== false,
    detail: asString(obj.detail),
  };
}

function asPerformanceResult(value: unknown): QaPerformanceSummary | null {
  const obj = asObject(value);
  if (!obj) return null;
  const budgets = Array.isArray(obj.budgets)
    ? obj.budgets.map(asPerformanceBudgetResult).filter((item): item is PerformanceBudgetResult => Boolean(item))
    : [];
  return {
    enabled: true,
    waitMs: typeof obj.waitMs === "number" ? obj.waitMs : 250,
    metrics: asPerformanceMetrics(obj.metrics),
    budgets,
    budgetViolationCount: typeof obj.budgetViolationCount === "number"
      ? obj.budgetViolationCount
      : budgets.filter((item) => !item.passed).length,
    topViolations: asStringArray(obj.topViolations),
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

function routePathFromUrl(rawUrl: string): string {
  const cleaned = cleanSubject(rawUrl);
  if (!cleaned) return "/";
  try {
    const parsed = new URL(cleaned);
    return `${parsed.pathname || "/"}${parsed.search || ""}` || "/";
  } catch {
    return "/";
  }
}

function downgradeSeverity(severity: FindingSeverity): FindingSeverity {
  if (severity === "critical") return "high";
  if (severity === "high") return "medium";
  if (severity === "medium") return "low";
  return "low";
}

function parseDecisionCategory(value: string): QaDecisionCategory | null {
  const normalized = cleanSubject(value).toLowerCase();
  if (normalized === "visual" || normalized === "accessibility" || normalized === "performance") return normalized;
  return null;
}

function parseDecisionKind(value: string): QaDecisionKind | null {
  const normalized = cleanSubject(value).toLowerCase();
  if (
    normalized === "snapshot-drift"
    || normalized === "missing-selectors"
    || normalized === "stale-baseline"
    || normalized === "accessibility-rule"
    || normalized === "performance-budget"
  ) {
    return normalized;
  }
  return null;
}

function decisionTargetFromFinding(finding: QaFinding): QaDecisionTarget | null {
  const category = parseDecisionCategory(String(finding.category || ""));
  const kind = parseDecisionKind(String(finding.evidence.decisionKind || ""));
  if (!category || !kind) return null;
  return {
    category,
    kind,
    snapshot: cleanSubject(finding.evidence.snapshot),
    routePath: cleanSubject(finding.evidence.route || "/") || "/",
    device: cleanSubject(finding.evidence.device || "desktop") || "desktop",
    selectors: String(finding.evidence.selectors || "")
      .split(",")
      .map((item) => cleanSubject(item))
      .filter(Boolean),
    ruleId: cleanSubject(finding.evidence.rule),
    metric: cleanSubject(finding.evidence.metric).toLowerCase(),
    title: cleanSubject(finding.evidence.decisionTitle || finding.title),
    findingKey: cleanSubject(finding.evidence.findingKey),
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => cleanSubject(item)).filter(Boolean))];
}

function decisionRef(record: QaDecisionRecord): Omit<QaAppliedDecision, "matchedFindings" | "effect" | "originalSeverity" | "resultingSeverity"> {
  return {
    id: record.id,
    decision: record.decision,
    category: record.category,
    kind: record.kind,
    snapshot: record.snapshot,
    routePath: record.routePath,
    device: record.device,
    reason: record.reason,
    author: record.author,
    createdAt: record.createdAt,
    reviewAfter: record.reviewAfter,
    expiresAt: record.expiresAt,
    file: record.file,
  };
}

function expiredDecisionRef(record: QaDecisionRecord): QaExpiredDecision {
  return {
    ...decisionRef(record),
    matchedFindings: [],
  };
}

function unresolvedRegression(candidate: TriageCandidate, finding: QaFinding, decision?: QaDecisionRecord): QaUnresolvedRegression {
  return {
    category: candidate.target.category,
    kind: candidate.target.kind,
    title: candidate.title,
    severity: candidate.severity,
    snapshot: candidate.target.snapshot,
    routePath: candidate.target.routePath,
    device: candidate.target.device,
    selectors: candidate.target.selectors || [],
    ruleId: candidate.target.ruleId || "",
    metric: candidate.target.metric || "",
    decisionStatus: decision?.decision,
    decisionFile: decision?.file,
  };
}

function applyDecisionTriage(findings: QaFinding[]): {
  findings: QaFinding[];
  decisionSummary: QaDecisionSummary;
  appliedDecisions: QaAppliedDecision[];
  expiredDecisions: QaExpiredDecision[];
  unresolvedRegressions: QaUnresolvedRegression[];
} {
  const records = readDecisionRecords();
  const now = Date.now();
  const activeRecords = records.filter((record) => !isDecisionExpired(record, now));
  const expiringSoonCount = activeRecords.filter((record) => isDecisionExpiringSoon(record, now)).length;
  const candidates: TriageCandidate[] = findings
    .map((item, index) => {
      const target = decisionTargetFromFinding(item);
      if (!target) return null;
      return {
        findingIndex: index,
        target,
        title: cleanSubject(item.title),
        severity: item.severity,
      };
    })
    .filter((item): item is TriageCandidate => Boolean(item));

  const nextFindings = findings.map((item) => ({ ...item, evidence: { ...item.evidence } }));
  const suppressed = new Set<number>();
  const applied = new Map<string, QaAppliedDecision>();
  const expired = new Map<string, QaExpiredDecision>();
  const unresolved: QaUnresolvedRegression[] = [];

  for (const candidate of candidates) {
    const matchingExpired = records.filter((record) => isDecisionExpired(record, now) && matchDecision(record, candidate.target));
    for (const record of matchingExpired) {
      const entry = expired.get(record.id) || expiredDecisionRef(record);
      entry.matchedFindings = uniqueStrings([...entry.matchedFindings, candidate.title]);
      expired.set(record.id, entry);
    }

    const matches = activeRecords
      .filter((record) => matchDecision(record, candidate.target))
      .sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0));

    if (!matches.length) {
      unresolved.push(unresolvedRegression(candidate, nextFindings[candidate.findingIndex]));
      continue;
    }

    const decision = matches[0];
    const finding = nextFindings[candidate.findingIndex];
    const originalSeverity = finding.severity;
    let resultingSeverity = originalSeverity;
    let effect: QaAppliedDecision["effect"] = "noted";

    finding.evidence.decision = decision.decision;
    finding.evidence.decisionFile = decision.file;
    finding.evidence.decisionAuthor = decision.author;

    if (decision.decision === "suppress") {
      suppressed.add(candidate.findingIndex);
      effect = "suppressed";
    } else if (decision.decision === "approve-current") {
      resultingSeverity = downgradeSeverity(finding.severity);
      finding.severity = resultingSeverity;
      effect = "downgraded";
    } else {
      unresolved.push(unresolvedRegression(candidate, finding, decision));
    }

    const entry = applied.get(decision.id) || {
      ...decisionRef(decision),
      matchedFindings: [],
      effect,
      originalSeverity,
      resultingSeverity,
    };
    entry.effect = effect;
    entry.originalSeverity = entry.originalSeverity || originalSeverity;
    entry.resultingSeverity = effect === "suppressed" ? entry.resultingSeverity : resultingSeverity;
    entry.matchedFindings = uniqueStrings([...entry.matchedFindings, candidate.title]);
    applied.set(decision.id, entry);
  }

  const finalFindings = nextFindings.filter((_, index) => !suppressed.has(index));
  const appliedDecisions = [...applied.values()];
  const expiredDecisions = [...expired.values()];
  const decisionSummary: QaDecisionSummary = {
    totalDecisions: records.length,
    appliedCount: appliedDecisions.length,
    approvedCount: appliedDecisions.filter((item) => item.decision === "approve-current").length,
    suppressedCount: appliedDecisions.filter((item) => item.decision === "suppress").length,
    refreshRequiredCount: appliedDecisions.filter((item) => item.decision === "refresh-required").length,
    expiredCount: expiredDecisions.length,
    unresolvedCount: unresolved.length,
    expiringSoonCount,
  };

  return {
    findings: finalFindings,
    decisionSummary,
    appliedDecisions,
    expiredDecisions,
    unresolvedRegressions: unresolved,
  };
}

function formatMetric(metric: string, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  if (metric === "cls") return String(Number(value.toFixed(3)));
  if (metric === "jsHeapUsed") {
    if (value >= 1024 ** 2) return `${Number((value / (1024 ** 2)).toFixed(2))} MB`;
    if (value >= 1024) return `${Number((value / 1024).toFixed(1))} KB`;
    return `${Math.round(value)} B`;
  }
  if (metric === "resourceCount" || metric === "failedResourceCount") return String(Math.round(value));
  return `${Math.round(value)} ms`;
}

function buildAccessibilityMarkdown(accessibility: QaAccessibilitySummary | null): string {
  if (!accessibility?.enabled) {
    return "# Accessibility Audit\n\nAccessibility checks were not enabled for this run.\n";
  }
  const violationLines = accessibility.violations.length
    ? accessibility.violations.map((item) => (
      `- ${String(item.impact || "unknown").toUpperCase()} ${item.id || item.help}: ${item.description || item.help}${item.selectors.length ? ` | selectors: ${item.selectors.join(", ")}` : ""}${item.helpUrl ? ` | help: ${item.helpUrl}` : ""}`
    )).join("\n")
    : "- No accessibility violations above the configured impact threshold.";
  return `# Accessibility Audit

- Minimum impact: ${accessibility.minimumImpact}
- Scope selectors: ${accessibility.scopeSelectors.length ? accessibility.scopeSelectors.join(", ") : "document"}
- Violations: ${accessibility.violationCount}
- Passes: ${accessibility.passCount}
- Incomplete: ${accessibility.incompleteCount}
- Top rules: ${accessibility.topRules.length ? accessibility.topRules.join(", ") : "none"}

## Violations

${violationLines}
`;
}

function buildPerformanceMarkdown(performance: QaPerformanceSummary | null): string {
  if (!performance?.enabled) {
    return "# Performance Audit\n\nPerformance checks were not enabled for this run.\n";
  }
  const metrics = performance.metrics;
  const budgetLines = performance.budgets.length
    ? performance.budgets.map((item) => (
      `- ${item.label}: ${formatMetric(item.metric, item.value)} vs ${formatMetric(item.metric, item.threshold)} (${item.passed ? "pass" : item.severity})`
    )).join("\n")
    : "- No performance budgets were configured.";
  return `# Performance Audit

- Wait after load: ${performance.waitMs} ms
- Budget violations: ${performance.budgetViolationCount}
- Top violations: ${performance.topViolations.length ? performance.topViolations.join("; ") : "none"}
- TTFB: ${formatMetric("ttfb", metrics.ttfb)}
- DOMContentLoaded: ${formatMetric("domContentLoaded", metrics.domContentLoaded)}
- Load event: ${formatMetric("loadEvent", metrics.loadEvent)}
- FCP: ${formatMetric("fcp", metrics.fcp)}
- LCP: ${formatMetric("lcp", metrics.lcp)}
- CLS: ${formatMetric("cls", metrics.cls)}
- JS heap used: ${formatMetric("jsHeapUsed", metrics.jsHeapUsed)}
- Resource count: ${formatMetric("resourceCount", metrics.resourceCount)}
- Failed resource count: ${formatMetric("failedResourceCount", metrics.failedResourceCount)}

## Budgets

${budgetLines}
`;
}

function collectAccessibilityEvidence(args: QaArgs): QaAccessibilitySummary | null {
  if (!args.a11y) return null;
  const commandArgs = ["a11y", args.url, "--session", args.session, "--device", args.device, "--impact", args.a11yImpact];
  for (const selector of args.a11yScopes) {
    commandArgs.push("--scope", selector);
  }
  const result = runBrowse(commandArgs);
  if (!result.ok || !result.parsed) {
    throw new Error(cleanSubject(result.stderr || result.stdout || "browse a11y did not produce a JSON report."));
  }
  return asAccessibilityResult(result.parsed);
}

function collectPerformanceEvidence(args: QaArgs): QaPerformanceSummary | null {
  if (!args.perf) return null;
  const commandArgs = ["perf", args.url, "--session", args.session, "--device", args.device, "--wait-ms", String(args.perfWaitMs)];
  for (const budget of args.perfBudgets) {
    commandArgs.push("--budget", budget);
  }
  const result = runBrowse(commandArgs);
  if (!result.ok || !result.parsed) {
    throw new Error(cleanSubject(result.stderr || result.stdout || "browse perf did not produce a JSON report."));
  }
  return asPerformanceResult(result.parsed);
}

function routePathForSnapshot(snapshot: SnapshotDocument | null, fallbackUrl: string): string {
  const explicit = String(snapshot?.routePath || "").trim();
  if (explicit) return explicit;
  const rawUrl = String(snapshot?.url || fallbackUrl || "").trim();
  if (!rawUrl) return "/";
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.pathname || "/"}${parsed.search || ""}` || "/";
  } catch {
    return "/";
  }
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
        report.snapshotResult.baselineFreshness
          ? `- Baseline freshness: ${report.snapshotResult.baselineFreshness.stale ? "stale" : "fresh"} (${report.snapshotResult.baselineFreshness.ageDays}d old at ${report.snapshotResult.baselineFreshness.routePath} on ${report.snapshotResult.baselineFreshness.device})`
          : "",
        report.snapshotResult.screenshot ? `- Screenshot: ${report.snapshotResult.screenshot}` : "",
        report.snapshotResult.annotation ? `- Annotation: ${report.snapshotResult.annotation}` : "",
        report.snapshotResult.visualPack?.index ? `- Visual pack: ${report.snapshotResult.visualPack.index}` : "",
        report.snapshotResult.visualPack?.manifest ? `- Visual manifest: ${report.snapshotResult.visualPack.manifest}` : "",
        report.snapshotResult.visualPack?.imageDiff ? `- Image diff score: ${report.snapshotResult.visualPack.imageDiff.score}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "- Snapshot: none";
  const accessibilityLines = report.accessibility?.enabled
    ? [
        `- Minimum impact: ${report.accessibility.minimumImpact}`,
        `- Scope selectors: ${report.accessibility.scopeSelectors.length ? report.accessibility.scopeSelectors.join(", ") : "document"}`,
        `- Violations: ${report.accessibility.violationCount}`,
        `- Passes: ${report.accessibility.passCount}`,
        `- Incomplete: ${report.accessibility.incompleteCount}`,
        report.accessibility.topRules.length ? `- Top rules: ${report.accessibility.topRules.join(", ")}` : "",
        report.artifacts.accessibilityJson ? `- Accessibility JSON: ${report.artifacts.accessibilityJson}` : "",
        report.artifacts.accessibilityMarkdown ? `- Accessibility Markdown: ${report.artifacts.accessibilityMarkdown}` : "",
      ].filter(Boolean).join("\n")
    : "- Accessibility: not enabled";
  const performanceLines = report.performance?.enabled
    ? [
        `- Wait after load: ${report.performance.waitMs} ms`,
        `- Budget violations: ${report.performance.budgetViolationCount}`,
        `- Top violations: ${report.performance.topViolations.length ? report.performance.topViolations.join("; ") : "none"}`,
        `- TTFB: ${formatMetric("ttfb", report.performance.metrics.ttfb)}`,
        `- DOMContentLoaded: ${formatMetric("domContentLoaded", report.performance.metrics.domContentLoaded)}`,
        `- Load event: ${formatMetric("loadEvent", report.performance.metrics.loadEvent)}`,
        `- FCP: ${formatMetric("fcp", report.performance.metrics.fcp)}`,
        `- LCP: ${formatMetric("lcp", report.performance.metrics.lcp)}`,
        `- CLS: ${formatMetric("cls", report.performance.metrics.cls)}`,
        `- JS heap used: ${formatMetric("jsHeapUsed", report.performance.metrics.jsHeapUsed)}`,
        `- Resource count: ${formatMetric("resourceCount", report.performance.metrics.resourceCount)}`,
        `- Failed resource count: ${formatMetric("failedResourceCount", report.performance.metrics.failedResourceCount)}`,
        report.artifacts.performanceJson ? `- Performance JSON: ${report.artifacts.performanceJson}` : "",
        report.artifacts.performanceMarkdown ? `- Performance Markdown: ${report.artifacts.performanceMarkdown}` : "",
      ].filter(Boolean).join("\n")
    : "- Performance: not enabled";
  const decisionSummaryLines = [
    `- Decisions loaded: ${report.decisionSummary.totalDecisions}`,
    `- Applied decisions: ${report.decisionSummary.appliedCount}`,
    `- Approved regressions: ${report.decisionSummary.approvedCount}`,
    `- Suppressed findings: ${report.decisionSummary.suppressedCount}`,
    `- Refresh required decisions: ${report.decisionSummary.refreshRequiredCount}`,
    `- Expired decisions: ${report.decisionSummary.expiredCount}`,
    `- Unresolved regressions: ${report.decisionSummary.unresolvedCount}`,
    `- Decisions expiring soon: ${report.decisionSummary.expiringSoonCount}`,
  ].join("\n");
  const appliedDecisionLines = report.appliedDecisions.length
    ? report.appliedDecisions
        .map((item) => `- ${item.decision} ${item.category}/${item.kind} @ ${item.routePath} (${item.device}) • ${item.reason} • ${item.file}`)
        .join("\n")
    : "- none";
  const expiredDecisionLines = report.expiredDecisions.length
    ? report.expiredDecisions
        .map((item) => `- ${item.decision} ${item.category}/${item.kind} @ ${item.routePath} (${item.device}) expired ${item.expiresAt || "previously"} • ${item.file}`)
        .join("\n")
    : "- none";
  const unresolvedLines = report.unresolvedRegressions.length
    ? report.unresolvedRegressions
        .map((item) => `- ${item.severity.toUpperCase()} ${item.category}/${item.kind}: ${item.title} @ ${item.routePath} (${item.device})${item.decisionStatus ? ` • decision=${item.decisionStatus}` : ""}`)
        .join("\n")
    : "- none";

  return `# QA Report

- URL: ${report.url || "fixture"}
- Mode: ${report.mode}
- Session: ${report.session}
- Generated: ${report.generatedAt}
- Status: ${report.status}
- Health score: ${report.healthScore}
- Recommendation: ${report.recommendation}
- Visual risk: ${report.visualRisk.level.toUpperCase()} (${report.visualRisk.score}/100)

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

## Accessibility

${accessibilityLines}

## Performance

${performanceLines}

## Regression triage

${decisionSummaryLines}

### Applied decisions

${appliedDecisionLines}

### Expired decisions

${expiredDecisionLines}

### Unresolved regressions

${unresolvedLines}
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
    const saved = runBrowse(["snapshot", args.url, args.snapshot, "--session", args.session, "--device", args.device]);
    return {
      kind: "snapshot",
      command: "snapshot",
      result: saved.parsed ? asSnapshotCommandResult(saved.parsed) : { status: saved.ok ? "saved" : "failed" },
      ok: saved.ok,
      stderr: saved.stderr,
    };
  }

  const compared = runBrowse(["compare-snapshot", args.url, args.snapshot, "--session", args.session, "--device", args.device]);
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
    const result = runBrowse(["run-flow", args.url, flowName, "--session", args.session, "--device", args.device]);
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
    const result = runBrowse(["probe", item.url, "--session", args.session, "--device", args.device]);
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
  accessibility,
  performance,
}: {
  args: QaArgs;
  snapshotEvidence: SnapshotEvidence | null;
  flowEvidence: FlowEvidence[];
  routeEvidence: RouteProbeEvidence[];
  diffSummary: QaDiffSummary | null;
  accessibility: QaAccessibilitySummary | null;
  performance: QaPerformanceSummary | null;
}): QaReport {
  const findings: QaFinding[] = [];
  const targetRoutePath = routePathFromUrl(args.url);
  const targetDevice = cleanSubject(args.device || "desktop") || "desktop";
  const baselineDocument = snapshotEvidence
    ? loadSnapshotDocument(snapshotEvidence.result.baseline || snapshotEvidence.result.snapshot || "")
    : null;
  const baselineFreshness = snapshotEvidence
    ? computeBaselineFreshness({
        snapshot: args.snapshot || baselineDocument?.name || "snapshot",
        routePath: routePathForSnapshot(baselineDocument, args.url),
        device: String(baselineDocument?.device || "desktop"),
        capturedAt: baselineDocument?.capturedAt,
      })
    : null;

  for (const flow of flowEvidence) {
    if (!flow.ok) {
      findings.push(
        finding(
          "critical",
          "functional",
          `Flow failed: ${flow.name}`,
          flow.stderr || `The ${flow.name} flow exited with a non-zero status.`,
          { flow: flow.name, route: targetRoutePath, device: targetDevice },
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
              route: baselineFreshness?.routePath || targetRoutePath,
              device: baselineFreshness?.device || targetDevice,
              selectors: (comparison.missingSelectors || []).join(", "),
              decisionKind: "missing-selectors",
              decisionTitle: "Expected UI selectors are missing",
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
              route: baselineFreshness?.routePath || targetRoutePath,
              device: baselineFreshness?.device || targetDevice,
              selectors: uniqueStrings([
                ...(comparison.changedSelectors || []).map((item) => cleanSubject(item.selector)),
                ...(comparison.newSelectors || []),
              ]).join(", "),
              decisionKind: "snapshot-drift",
              decisionTitle: "Snapshot drift detected",
              screenshot: snapshotResult.screenshot || "",
              current: snapshotResult.current || "",
            },
          ),
        );
      }
    }
  }

  if (baselineFreshness?.stale) {
    const severity: FindingSeverity = baselineFreshness.ageDays >= baselineFreshness.staleAfterDays * 2 ? "medium" : "low";
    findings.push(
      finding(
        severity,
        "visual",
        "Snapshot baseline is stale",
        `The saved baseline for ${baselineFreshness.snapshot} is ${baselineFreshness.ageDays} days old. Refresh it intentionally if the current UI is now the expected state.`,
        {
          snapshot: baselineFreshness.snapshot,
          route: baselineFreshness.routePath,
          device: baselineFreshness.device,
          decisionKind: "stale-baseline",
          decisionTitle: "Snapshot baseline is stale",
          capturedAt: baselineFreshness.capturedAt,
        },
      ),
    );
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
            device: targetDevice,
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
            device: targetDevice,
            files: route.files.join(", "),
            status: route.httpStatus !== null ? String(route.httpStatus) : "",
          },
        ),
      );
    }
  }

  if (accessibility?.enabled) {
    for (const violation of accessibility.violations) {
      const severity: FindingSeverity = violation.impact === "critical" || violation.impact === "serious"
        ? "high"
        : violation.impact === "moderate"
          ? "medium"
          : "low";
      findings.push(
        finding(
          severity,
          "accessibility",
          `Accessibility violation: ${violation.id || violation.help}`,
          `${violation.help || violation.description}${violation.nodeCount ? ` (${violation.nodeCount} affected node${violation.nodeCount === 1 ? "" : "s"})` : ""}`,
          {
            rule: violation.id,
            impact: violation.impact,
            route: targetRoutePath,
            device: targetDevice,
            decisionKind: "accessibility-rule",
            decisionTitle: violation.id || violation.help,
            selectors: violation.selectors.join(", "),
            helpUrl: violation.helpUrl,
          },
        ),
      );
    }
  }

  if (performance?.enabled) {
    for (const budget of performance.budgets.filter((item) => !item.passed)) {
      findings.push(
        finding(
          budget.severity,
          "performance",
          `Performance budget exceeded: ${budget.label}`,
          budget.detail,
          {
            metric: budget.metric,
            route: targetRoutePath,
            device: targetDevice,
            decisionKind: "performance-budget",
            decisionTitle: budget.label || budget.metric,
            threshold: String(budget.threshold),
            value: budget.value === null ? "n/a" : String(budget.value),
          },
        ),
      );
    }
    if (!performance.budgets.length && performance.metrics.failedResourceCount > 0) {
      findings.push(
        finding(
          "medium",
          "performance",
          "Page failed to load resources",
          `${performance.metrics.failedResourceCount} resource request(s) failed during the performance capture.`,
          {
            failedResourceCount: String(performance.metrics.failedResourceCount),
            route: targetRoutePath,
            device: targetDevice,
            decisionKind: "performance-budget",
            decisionTitle: "failedResourceCount",
            metric: "failedResourceCount",
          },
        ),
      );
    }
  }

  const triaged = applyDecisionTriage(findings);
  const healthScore = scoreFindings(triaged.findings);
  const status = statusFromFindings(triaged.findings);
  const generatedAt = new Date().toISOString();
  const snapshotResult = snapshotEvidence
    ? {
        name: args.snapshot,
        status: snapshotEvidence.result.status || (snapshotEvidence.ok ? "ok" : "failed"),
        baseline: snapshotEvidence.result.baseline || snapshotEvidence.result.snapshot || "",
        current: snapshotEvidence.result.current || "",
        screenshot: snapshotEvidence.result.screenshot || "",
        annotation: "",
        baselineFreshness,
        visualPack: snapshotEvidence.result.visualPack || null,
      }
    : null;
  const visualRisk = computeVisualRisk({
    snapshotResults: snapshotResult ? [snapshotResult] : [],
  });
  return {
    generatedAt,
    url: args.url,
    mode: args.mode,
    session: args.session,
    status,
    healthScore,
    recommendation: recommendation(status, healthScore),
    findings: triaged.findings,
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
    snapshotResult,
    accessibility,
    performance,
    visualRisk,
    decisionSummary: triaged.decisionSummary,
    appliedDecisions: triaged.appliedDecisions,
    expiredDecisions: triaged.expiredDecisions,
    unresolvedRegressions: triaged.unresolvedRegressions,
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

  if (report.accessibility) {
    if (report.accessibility.artifactJson && pathMap[report.accessibility.artifactJson]) report.accessibility.artifactJson = pathMap[report.accessibility.artifactJson];
    if (report.accessibility.artifactMarkdown && pathMap[report.accessibility.artifactMarkdown]) report.accessibility.artifactMarkdown = pathMap[report.accessibility.artifactMarkdown];
  }
  if (report.performance) {
    if (report.performance.artifactJson && pathMap[report.performance.artifactJson]) report.performance.artifactJson = pathMap[report.performance.artifactJson];
    if (report.performance.artifactMarkdown && pathMap[report.performance.artifactMarkdown]) report.performance.artifactMarkdown = pathMap[report.performance.artifactMarkdown];
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
    [report.artifacts.accessibilityJson || "", path.join(outputDir, "a11y.json")],
    [report.artifacts.accessibilityMarkdown || "", path.join(outputDir, "a11y.md")],
    [report.artifacts.performanceJson || "", path.join(outputDir, "performance.json")],
    [report.artifacts.performanceMarkdown || "", path.join(outputDir, "performance.md")],
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
      accessibilityJson: pathMap[report.artifacts.accessibilityJson || ""] || "",
      accessibilityMarkdown: pathMap[report.artifacts.accessibilityMarkdown || ""] || "",
      performanceJson: pathMap[report.artifacts.performanceJson || ""] || "",
      performanceMarkdown: pathMap[report.artifacts.performanceMarkdown || ""] || "",
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
  if (report.accessibility?.enabled) {
    const accessibilityJsonPath = path.join(QA_DIR, `${stamp}-a11y.json`);
    const accessibilityMarkdownPath = path.join(QA_DIR, `${stamp}-a11y.md`);
    report.artifacts.accessibilityJson = relative(accessibilityJsonPath);
    report.artifacts.accessibilityMarkdown = relative(accessibilityMarkdownPath);
    report.accessibility.artifactJson = report.artifacts.accessibilityJson;
    report.accessibility.artifactMarkdown = report.artifacts.accessibilityMarkdown;
    writeFile(accessibilityJsonPath, JSON.stringify(report.accessibility, null, 2));
    writeFile(accessibilityMarkdownPath, buildAccessibilityMarkdown(report.accessibility));
  }
  if (report.performance?.enabled) {
    const performanceJsonPath = path.join(QA_DIR, `${stamp}-performance.json`);
    const performanceMarkdownPath = path.join(QA_DIR, `${stamp}-performance.md`);
    report.artifacts.performanceJson = relative(performanceJsonPath);
    report.artifacts.performanceMarkdown = relative(performanceMarkdownPath);
    report.performance.artifactJson = report.artifacts.performanceJson;
    report.performance.artifactMarkdown = report.artifacts.performanceMarkdown;
    writeFile(performanceJsonPath, JSON.stringify(report.performance, null, 2));
    writeFile(performanceMarkdownPath, buildPerformanceMarkdown(report.performance));
  }

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
    accessibility: fixture.accessibility || null,
    performance: fixture.performance || null,
  });
} else {
  const snapshotEvidence = collectSnapshotEvidence(args);
  const flowEvidence = collectFlowEvidence(args);
  const { routeEvidence, diffSummary } = collectRouteEvidence(args);
  const accessibility = collectAccessibilityEvidence(args);
  const performance = collectPerformanceEvidence(args);
  report = buildReport({ args, snapshotEvidence, flowEvidence, routeEvidence, diffSummary, accessibility, performance });
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
