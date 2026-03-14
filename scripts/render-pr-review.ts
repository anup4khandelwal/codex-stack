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
    };
  };
}

interface PreviewReport {
  status?: string;
  url?: string;
  runUrl?: string;
  recommendation?: string;
  readiness?: {
    status?: string;
    attempts?: number;
    httpStatus?: number | null;
  };
  qa?: PreviewQaReport;
  deploy?: {
    screenshotManifest?: string;
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
      }>;
    };
  };
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
  markdownOut: string;
  summaryOut: string;
  failOnCritical: boolean;
  json: boolean;
}

function usage(): never {
  console.log(`render-pr-review

Usage:
  bun scripts/render-pr-review.ts --input <review.json> [--preview-input <preview.json>] [--markdown-out <path>] [--summary-out <path>] [--fail-on-critical] [--json]
`);
  process.exit(0);
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    input: "",
    previewInput: "",
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
      item.annotation ? `annotation=${item.annotation}` : "",
      item.screenshot ? `screenshot=${item.screenshot}` : "",
      item.report ? `report=${item.report}` : "",
    ].filter(Boolean);
    return `- ${bits.join(", ")}`;
  });
}

function renderPreviewSection(preview: PreviewReport | null, summary: ReviewSummary): string {
  if (!preview) return "";
  const findings = Array.isArray(preview.qa?.findings) ? preview.qa?.findings : [];
  const published = preview.qa?.artifacts?.published || {};
  const snapshot = preview.qa?.snapshotResult;
  return `
## Preview QA

- Included: yes
- Status: ${preview.status || "unknown"}
- Readiness: ${preview.readiness?.status || "unknown"}${preview.readiness?.attempts ? ` after ${preview.readiness.attempts} attempt(s)` : ""}
- Health score: ${preview.qa?.healthScore ?? "n/a"}
- Block merge: ${summary.previewBlocking ? "yes" : "no"}
- Recommendation: ${preview.recommendation || preview.qa?.recommendation || "n/a"}
${preview.url ? `- Preview URL: ${preview.url}` : ""}
${preview.runUrl ? `- Workflow run: ${preview.runUrl}` : ""}
${published.markdown ? `- QA report: \`${published.markdown}\`` : ""}
${published.annotation ? `- Annotation: \`${published.annotation}\`` : ""}
${published.screenshot ? `- Screenshot: \`${published.screenshot}\`` : ""}
${preview.deploy?.screenshotManifest ? `- Screenshot manifest: \`${preview.deploy.screenshotManifest}\`` : ""}
${snapshot?.status ? `- Snapshot: ${snapshot.status}${snapshot.name ? ` (${snapshot.name})` : ""}` : ""}

### Preview findings

${previewFindingLines(findings).join("\n")}

### Deploy checks

${deployCheckLines(preview).join("\n")}

### Deploy snapshots

${deploySnapshotLines(preview).join("\n")}
`;
}

function renderMarkdown(review: ReviewReport, summary: ReviewSummary, preview: PreviewReport | null): string {
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
${renderPreviewSection(preview, summary)}`;
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
const markdown = renderMarkdown(review, summary, preview);

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
