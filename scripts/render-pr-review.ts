#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

interface ReviewFinding {
  severity?: string;
  title: string;
  detail: string;
  files?: string[];
}

interface ReviewReport {
  status?: string;
  branch?: string;
  baseRef?: string;
  fileNames?: string[];
  findings?: ReviewFinding[];
}

interface PreviewFinding {
  severity?: string;
  category?: string;
  title?: string;
  detail?: string;
}

interface PreviewQaReport {
  status?: string;
  healthScore?: number;
  recommendation?: string;
  findings?: PreviewFinding[];
  accessibility?: {
    enabled?: boolean;
    violationCount?: number;
    minimumImpact?: string;
    topRules?: string[];
    artifactMarkdown?: string;
  } | null;
  performance?: {
    enabled?: boolean;
    budgetViolationCount?: number;
    topViolations?: string[];
    metrics?: {
      lcp?: number | null;
      cls?: number | null;
      failedResourceCount?: number;
    };
    artifactMarkdown?: string;
  } | null;
  snapshotResult?: {
    name?: string;
    status?: string;
    screenshot?: string;
    annotation?: string;
  };
  artifacts?: {
    published?: {
      markdown?: string;
      json?: string;
      annotation?: string;
      screenshot?: string;
      visualPack?: {
        index?: string;
        manifest?: string;
      } | null;
    };
  };
}

interface PreviewReport {
  status?: string;
  url?: string;
  runUrl?: string;
  recommendation?: string;
  visualRisk?: {
    score?: number;
    level?: string;
    staleBaselines?: number;
    topDrivers?: string[];
  };
  readiness?: {
    status?: string;
    attempts?: number;
    httpStatus?: number | null;
  };
  qa?: PreviewQaReport;
  deploy?: {
    screenshotManifest?: string;
    visualPack?: {
      index?: string;
      manifest?: string;
    } | null;
    pathResults?: Array<{
      path?: string;
      device?: string;
      status?: string;
      httpStatus?: number | null;
      screenshot?: string;
      console?: {
        errors?: string[];
        warnings?: string[];
      };
    }>;
      qa?: {
        snapshotResults?: Array<{
          name?: string;
          targetPath?: string;
          device?: string;
        status?: string;
        report?: string;
        annotation?: string;
        screenshot?: string;
        baselineFreshness?: {
          ageDays?: number;
          stale?: boolean;
        } | null;
        visualPack?: {
          index?: string;
          manifest?: string;
          } | null;
        }>;
      };
  };
}

interface LocalVisualManifest {
  screenshots?: Array<{
    path?: string;
    device?: string;
    status?: string;
    httpStatus?: number | null;
    screenshot?: string;
    consoleErrors?: number;
    consoleWarnings?: number;
  }>;
  snapshots?: Array<{
    name?: string;
    targetPath?: string;
    device?: string;
    status?: string;
    index?: string;
    manifest?: string;
    annotation?: string;
    screenshot?: string;
    diffImage?: string;
    imageDiffScore?: number | null;
    imageDiffRatio?: number | null;
  }>;
}

interface ReviewSummary {
  status: string;
  branch: string;
  baseRef: string;
  filesChanged: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  blocking?: boolean;
  previewIncluded?: boolean;
  previewStatus?: string;
  previewBlocking?: boolean;
}

interface ParsedArgs {
  input: string;
  previewInput: string;
  previewPagesRoot: string;
  markdownOut: string;
  summaryOut: string;
  failOnCritical: boolean;
  json: boolean;
}

function usage(): never {
  console.log(`render-pr-review

Usage:
  bun scripts/render-pr-review.ts --input <review.json> [--preview-input <preview.json>] [--preview-pages-root <url>] [--markdown-out <path>] [--summary-out <path>] [--fail-on-critical] [--json]
`);
  process.exit(0);
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    input: "",
    previewInput: "",
    previewPagesRoot: "",
    markdownOut: "",
    summaryOut: "",
    failOnCritical: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      out.input = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--preview-input") {
      out.previewInput = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--preview-pages-root") {
      out.previewPagesRoot = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--markdown-out") {
      out.markdownOut = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--summary-out") {
      out.summaryOut = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--fail-on-critical") {
      out.failOnCritical = true;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  if (!out.input) {
    throw new Error("--input is required.");
  }
  return out;
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath: string): ReviewReport {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8")) as ReviewReport;
}

function readPreviewJson(filePath: string): PreviewReport {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8")) as PreviewReport;
}

function countBySeverity(findings: ReviewFinding[], severity: string): number {
  return findings.filter((item) => item.severity === severity).length;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function absoluteLink(root: string, relativePath: string): string {
  if (!root || !relativePath) return "";
  return new URL(relativePath.replace(/^\/+/, ""), withTrailingSlash(root)).toString();
}

function readLocalVisualManifest(preview: PreviewReport | null): LocalVisualManifest | null {
  const manifestPath = preview?.deploy?.visualPack?.manifest;
  if (!manifestPath) return null;
  const resolved = path.resolve(process.cwd(), manifestPath);
  if (!fs.existsSync(resolved)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8")) as LocalVisualManifest;
  } catch {
    return null;
  }
}

function findingLines(findings: ReviewFinding[]): string[] {
  if (!findings.length) return ["- No findings."];
  return findings.map((item) => {
    const files = Array.isArray(item.files) && item.files.length ? ` Files: ${item.files.join(", ")}.` : "";
    return `- **${String(item.severity || "info").toUpperCase()}** ${item.title}: ${item.detail}${files}`;
  });
}

function previewFindingLines(findings: PreviewFinding[]): string[] {
  if (!findings.length) return ["- No preview findings."];
  return findings.slice(0, 6).map((item) => {
    const label = `${String(item.severity || "info").toUpperCase()}${item.category ? `/${String(item.category).toUpperCase()}` : ""}`;
    return `- **${label}** ${item.title || "Finding"}${item.detail ? `: ${item.detail}` : ""}`;
  });
}

function deployCheckLines(preview: PreviewReport | null): string[] {
  const pathResults = Array.isArray(preview?.deploy?.pathResults) ? preview?.deploy?.pathResults : [];
  if (!pathResults.length) return ["- No deploy checks recorded."];
  return pathResults.slice(0, 8).map((item) => {
    const bits = [
      `${item.path || "/"} @ ${item.device || "desktop"}`,
      `status=${item.status || "unknown"}`,
      item.httpStatus !== null && item.httpStatus !== undefined ? `http=${item.httpStatus}` : "http=n/a",
      item.console?.errors?.length ? `consoleErrors=${item.console.errors.length}` : "",
      item.console?.warnings?.length ? `consoleWarnings=${item.console.warnings.length}` : "",
      item.screenshot ? `screenshot=${item.screenshot}` : "",
    ].filter(Boolean);
    return `- ${bits.join(", ")}`;
  });
}

function deploySnapshotLines(preview: PreviewReport | null): string[] {
  const snapshotResults = Array.isArray(preview?.deploy?.qa?.snapshotResults) ? preview?.deploy?.qa?.snapshotResults : [];
  if (!snapshotResults.length) return ["- No deploy snapshot evidence."];
  return snapshotResults.slice(0, 6).map((item) => {
    const bits = [
      `${item.name || "snapshot"} @ ${item.targetPath || "/"} (${item.device || "desktop"})`,
      `status=${item.status || "unknown"}`,
      item.baselineFreshness ? `baselineAge=${item.baselineFreshness.ageDays ?? "n/a"}d${item.baselineFreshness.stale ? "-stale" : ""}` : "",
      item.annotation ? `annotation=${item.annotation}` : "",
      item.screenshot ? `screenshot=${item.screenshot}` : "",
      item.report ? `report=${item.report}` : "",
    ].filter(Boolean);
    return `- ${bits.join(", ")}`;
  });
}

function visualBadgeLines(preview: PreviewReport | null, previewPagesRoot: string): string[] {
  const manifest = readLocalVisualManifest(preview);
  if (!manifest) return ["- No hosted visual summary available."];
  const visualPagesRoot = absoluteLink(previewPagesRoot, "visual/");

  const snapshotLines = (manifest.snapshots || [])
    .filter((item) => typeof item.imageDiffScore === "number" || item.status)
    .sort((left, right) => (Number(left.imageDiffScore ?? -1) - Number(right.imageDiffScore ?? -1)))
    .slice(0, 3)
    .map((item) => {
      const hosted = item.index ? absoluteLink(visualPagesRoot, item.index) : "";
      const badgeBits = [
        `\`${item.status || "unknown"}\``,
        typeof item.imageDiffScore === "number" ? `\`score ${item.imageDiffScore}\`` : "",
        typeof item.imageDiffRatio === "number" ? `\`ratio ${item.imageDiffRatio}\`` : "",
      ].filter(Boolean).join(" ");
      return `- ${badgeBits} ${item.name || "snapshot"} @ ${item.targetPath || "/"} (${item.device || "desktop"})${hosted ? ` → ${hosted}` : ""}`;
    });

  const screenshotLines = (manifest.screenshots || [])
    .filter((item) => item.status && item.status !== "pass" && item.screenshot)
    .slice(0, 2)
    .map((item) => {
      const hostedScreenshot = absoluteLink(visualPagesRoot, item.screenshot || "");
      return `- \`${item.status}\` ${item.path || "/"} @ ${item.device || "desktop"}${hostedScreenshot ? ` → ${hostedScreenshot}` : ""}`;
    });

  return [...snapshotLines, ...screenshotLines].slice(0, 5).length
    ? [...snapshotLines, ...screenshotLines].slice(0, 5)
    : ["- No failing visual checks were captured."];
}

function visualImageEmbeds(preview: PreviewReport | null, previewPagesRoot: string): string[] {
  const manifest = readLocalVisualManifest(preview);
  if (!manifest) return [];
  const visualPagesRoot = absoluteLink(previewPagesRoot, "visual/");
  const images: string[] = [];

  for (const item of (manifest.snapshots || [])) {
    const target = item.diffImage || item.screenshot || item.annotation || "";
    if (!target) continue;
    const hosted = absoluteLink(visualPagesRoot, target);
    if (!hosted) continue;
    images.push(`![${item.name || "snapshot"} ${item.device || "desktop"}](${hosted})`);
    if (images.length >= 2) break;
  }

  if (images.length < 2) {
    for (const item of (manifest.screenshots || [])) {
      if (item.status === "pass" || !item.screenshot) continue;
      const hosted = absoluteLink(visualPagesRoot, item.screenshot);
      if (!hosted) continue;
      images.push(`![${item.path || "/"} ${item.device || "desktop"}](${hosted})`);
      if (images.length >= 2) break;
    }
  }

  return images;
}

function renderPreviewSection(preview: PreviewReport | null, summary: ReviewSummary, previewPagesRoot: string): string {
  if (!preview) return "";
  const findings = Array.isArray(preview.qa?.findings) ? preview.qa?.findings : [];
  const published = preview.qa?.artifacts?.published || {};
  const snapshot = preview.qa?.snapshotResult;
  const hostedVisualPack = absoluteLink(previewPagesRoot, "visual/index.html");
  const hostedVisualManifest = absoluteLink(previewPagesRoot, "visual/manifest.json");
  const hostedScreenshotManifest = absoluteLink(previewPagesRoot, "screenshots.json");
  const a11y = preview.qa?.accessibility;
  const perf = preview.qa?.performance;
  return `
## Preview QA

- Included: yes
- Status: ${preview.status || "unknown"}
- Readiness: ${preview.readiness?.status || "unknown"}${preview.readiness?.attempts ? ` after ${preview.readiness.attempts} attempt(s)` : ""}
- Health score: ${preview.qa?.healthScore ?? "n/a"}
- Visual risk: ${preview.visualRisk?.level ? `${String(preview.visualRisk.level).toUpperCase()} (${preview.visualRisk.score ?? "n/a"}/100)` : "n/a"}
- Block merge: ${summary.previewBlocking ? "yes" : "no"}
- Recommendation: ${preview.recommendation || preview.qa?.recommendation || "n/a"}
${preview.url ? `- Preview URL: ${preview.url}` : ""}
${preview.runUrl ? `- Workflow run: ${preview.runUrl}` : ""}
${hostedVisualPack ? `- Hosted visual pack: ${hostedVisualPack}` : ""}
${hostedVisualManifest ? `- Hosted visual manifest: ${hostedVisualManifest}` : ""}
${published.markdown ? `- QA report: \`${published.markdown}\`` : ""}
${published.annotation ? `- Annotation: \`${published.annotation}\`` : ""}
${published.screenshot ? `- Screenshot: \`${published.screenshot}\`` : ""}
${preview.deploy?.screenshotManifest ? `- Screenshot manifest: \`${preview.deploy.screenshotManifest}\`` : ""}
${hostedScreenshotManifest ? `- Hosted screenshot manifest: ${hostedScreenshotManifest}` : ""}
${preview.deploy?.visualPack?.index ? `- Local visual pack: \`${preview.deploy.visualPack.index}\`` : ""}
${snapshot?.status ? `- Snapshot: ${snapshot.status}${snapshot.name ? ` (${snapshot.name})` : ""}` : ""}
${a11y?.enabled ? `- Accessibility: ${a11y.violationCount ?? 0} violations${a11y.minimumImpact ? ` (min impact ${a11y.minimumImpact})` : ""}` : ""}
${perf?.enabled ? `- Performance: ${perf.budgetViolationCount ?? 0} budget violations${typeof perf.metrics?.failedResourceCount === "number" ? `, ${perf.metrics.failedResourceCount} failed resources` : ""}` : ""}

### Preview findings

${previewFindingLines(findings).join("\n")}

### Deploy checks

${deployCheckLines(preview).join("\n")}

### Deploy snapshots

${deploySnapshotLines(preview).join("\n")}

### Visual summary

${visualBadgeLines(preview, previewPagesRoot).join("\n")}

${a11y?.enabled ? `### Accessibility summary

- Violations: ${a11y.violationCount ?? 0}
${a11y.topRules?.length ? `- Top rules: ${a11y.topRules.join(", ")}` : "- Top rules: none"}
${a11y.artifactMarkdown ? `- Report: \`${a11y.artifactMarkdown}\`` : ""}
` : ""}

${perf?.enabled ? `### Performance summary

- Budget violations: ${perf.budgetViolationCount ?? 0}
${perf.topViolations?.length ? `- Top violations: ${perf.topViolations.join("; ")}` : "- Top violations: none"}
- LCP: ${perf.metrics?.lcp ?? "n/a"}
- CLS: ${perf.metrics?.cls ?? "n/a"}
- Failed resources: ${perf.metrics?.failedResourceCount ?? 0}
${perf.artifactMarkdown ? `- Report: \`${perf.artifactMarkdown}\`` : ""}
` : ""}

${preview.visualRisk?.topDrivers?.length ? `### Visual risk drivers

${preview.visualRisk.topDrivers.map((item) => `- ${item}`).join("\n")}
` : ""}

${preview.visualRisk?.staleBaselines ? `### Stale baselines

- ${preview.visualRisk.staleBaselines} stale baseline${preview.visualRisk.staleBaselines === 1 ? "" : "s"} need review or refresh.
` : ""}

${visualImageEmbeds(preview, previewPagesRoot).join("\n\n")}
`;
}

function renderMarkdown(review: ReviewReport, summary: ReviewSummary, preview: PreviewReport | null, previewPagesRoot: string): string {
  return `<!-- codex-stack:pr-review -->
# codex-stack PR review

- Branch: ${review.branch}
- Base: ${review.baseRef}
- Files changed: ${review.fileNames?.length ?? 0}
- Critical findings: ${summary.criticalCount}
- Warnings: ${summary.warningCount}
- Info: ${summary.infoCount}
- Block merge: ${summary.blocking ? "yes" : "no"}

## Findings

${findingLines(review.findings ?? []).join("\n")}
${renderPreviewSection(preview, summary, previewPagesRoot)}`;
}

const args = parseArgs(process.argv.slice(2));
const review = readJson(args.input);
const preview = args.previewInput ? readPreviewJson(args.previewInput) : null;
const findings: ReviewFinding[] = Array.isArray(review.findings) ? review.findings : [];
const summary: ReviewSummary = {
  status: review.status || "ok",
  branch: review.branch || "",
  baseRef: review.baseRef || "",
  filesChanged: Array.isArray(review.fileNames) ? review.fileNames.length : 0,
  criticalCount: countBySeverity(findings, "critical"),
  warningCount: countBySeverity(findings, "warning"),
  infoCount: countBySeverity(findings, "info"),
};
summary.previewIncluded = Boolean(preview);
summary.previewStatus = preview?.status || "";
summary.previewBlocking = ["critical", "error"].includes(String(preview?.status || "").toLowerCase());
summary.blocking = summary.criticalCount > 0 || summary.previewBlocking;
const markdown = renderMarkdown(review, summary, preview, args.previewPagesRoot);

if (args.markdownOut) {
  const target = path.resolve(process.cwd(), args.markdownOut);
  ensureDir(target);
  fs.writeFileSync(target, markdown);
}

if (args.summaryOut) {
  const target = path.resolve(process.cwd(), args.summaryOut);
  ensureDir(target);
  fs.writeFileSync(target, JSON.stringify(summary, null, 2));
}

if (args.json) {
  console.log(JSON.stringify({ summary, markdown }, null, 2));
} else {
  process.stdout.write(markdown);
}

if (args.failOnCritical && summary.blocking) {
  process.exit(2);
}
