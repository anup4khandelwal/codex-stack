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

interface ReviewSummary {
  status: string;
  branch: string;
  baseRef: string;
  filesChanged: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  blocking?: boolean;
}

interface ParsedArgs {
  input: string;
  markdownOut: string;
  summaryOut: string;
  failOnCritical: boolean;
  json: boolean;
}

function usage(): never {
  console.log(`render-pr-review

Usage:
  bun scripts/render-pr-review.ts --input <review.json> [--markdown-out <path>] [--summary-out <path>] [--fail-on-critical] [--json]
`);
  process.exit(0);
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    input: "",
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

function renderMarkdown(review: ReviewReport, summary: ReviewSummary): string {
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
`;
}

const args = parseArgs(process.argv.slice(2));
const review = readJson(args.input);
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
summary.blocking = summary.criticalCount > 0;
const markdown = renderMarkdown(review, summary);

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
