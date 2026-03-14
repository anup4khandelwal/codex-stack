#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type FindingSeverity = "critical" | "high" | "medium" | "low" | string;
type FindingCategory = "functional" | "visual" | "ux" | "content" | "console" | "performance" | "accessibility" | "qa-system" | string;
type ReportStatus = "critical" | "warning" | "pass" | string;

interface QaFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  detail: string;
}

interface QaHistoryReport {
  generatedAt?: string;
  url?: string;
  mode?: string;
  status?: ReportStatus;
  healthScore?: number;
  findings?: QaFinding[];
}

interface QaTrendArgs {
  dir: string;
  jsonOut: string;
  markdownOut: string;
  json: boolean;
  limit: number;
}

interface TrendFinding {
  signature: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  detail: string;
  occurrences: number;
}

interface TrendTimelineEntry {
  generatedAt: string;
  status: ReportStatus;
  healthScore: number;
  url: string;
  findings: number;
}

interface QaTrendReport {
  generatedAt: string;
  sourceDir: string;
  totalRuns: number;
  latest: TrendTimelineEntry | null;
  previous: TrendTimelineEntry | null;
  deltaHealthScore: number;
  currentStatusStreak: {
    status: ReportStatus | "unknown";
    length: number;
  };
  statusCounts: Record<string, number>;
  timeline: TrendTimelineEntry[];
  newFindings: TrendFinding[];
  fixedFindings: TrendFinding[];
  recurringFindings: TrendFinding[];
  recurringHotspots: TrendFinding[];
}

const DEFAULT_QA_DIR = path.resolve(process.cwd(), ".codex-stack", "qa");

function usage(): never {
  console.log(`qa-trends

Usage:
  bun scripts/qa-trends.ts [--dir <path>] [--json-out <path>] [--markdown-out <path>] [--limit <n>] [--json]
`);
  process.exit(1);
}

function parseArgs(argv: string[]): QaTrendArgs {
  const args: QaTrendArgs = {
    dir: DEFAULT_QA_DIR,
    jsonOut: path.join(DEFAULT_QA_DIR, "trends.json"),
    markdownOut: path.join(DEFAULT_QA_DIR, "trends.md"),
    json: false,
    limit: 20,
  };

  const copy = [...argv];
  while (copy.length) {
    const item = copy.shift();
    if (!item) continue;
    if (item === "--dir") {
      args.dir = path.resolve(process.cwd(), copy.shift() || args.dir);
      continue;
    }
    if (item === "--json-out") {
      args.jsonOut = path.resolve(process.cwd(), copy.shift() || args.jsonOut);
      continue;
    }
    if (item === "--markdown-out") {
      args.markdownOut = path.resolve(process.cwd(), copy.shift() || args.markdownOut);
      continue;
    }
    if (item === "--limit") {
      args.limit = Math.max(1, Number.parseInt(copy.shift() || "20", 10) || 20);
      continue;
    }
    if (item === "--json") {
      args.json = true;
      continue;
    }
    if (item === "--help" || item === "-h") {
      usage();
    }
    throw new Error(`Unknown arg: ${item}`);
  }

  return args;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function findingSignature(finding: QaFinding): string {
  return JSON.stringify([finding.category || "", finding.severity || "", finding.title || "", finding.detail || ""]);
}

function normalizeFinding(finding: QaFinding, occurrences = 1): TrendFinding {
  return {
    signature: findingSignature(finding),
    severity: String(finding.severity || "low"),
    category: String(finding.category || "qa-system"),
    title: String(finding.title || ""),
    detail: String(finding.detail || ""),
    occurrences,
  };
}

function loadReports(dirPath: string): Array<Required<Pick<QaHistoryReport, "generatedAt" | "status" | "healthScore" | "url">> & { findings: QaFinding[] }> {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith(".json") && name !== "latest.json" && name !== "trends.json")
    .map((name) => {
      const data = JSON.parse(fs.readFileSync(path.join(dirPath, name), "utf8")) as QaHistoryReport;
      return {
        generatedAt: String(data.generatedAt || "1970-01-01T00:00:00.000Z"),
        status: String(data.status || "unknown"),
        healthScore: Number(data.healthScore ?? 0),
        url: String(data.url || ""),
        findings: Array.isArray(data.findings) ? data.findings : [],
      };
    })
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
}

function computeStatusStreak(timeline: TrendTimelineEntry[]): { status: ReportStatus | "unknown"; length: number } {
  if (!timeline.length) return { status: "unknown", length: 0 };
  const latestStatus = timeline[timeline.length - 1]?.status || "unknown";
  let length = 0;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (timeline[index]?.status !== latestStatus) break;
    length += 1;
  }
  return { status: latestStatus, length };
}

function buildTrendReport(dirPath: string, limit: number): QaTrendReport {
  const reports = loadReports(dirPath);
  const timeline: TrendTimelineEntry[] = reports.slice(-limit).map((report) => ({
    generatedAt: report.generatedAt,
    status: report.status,
    healthScore: report.healthScore,
    url: report.url,
    findings: report.findings.length,
  }));

  const latestReport = reports[reports.length - 1] || null;
  const previousReport = reports.length > 1 ? reports[reports.length - 2] : null;
  const latestMap = new Map((latestReport?.findings || []).map((finding) => [findingSignature(finding), normalizeFinding(finding)]));
  const previousMap = new Map((previousReport?.findings || []).map((finding) => [findingSignature(finding), normalizeFinding(finding)]));
  const occurrenceMap = new Map<string, TrendFinding>();

  for (const report of reports) {
    for (const finding of report.findings) {
      const signature = findingSignature(finding);
      const existing = occurrenceMap.get(signature);
      if (existing) {
        existing.occurrences += 1;
      } else {
        occurrenceMap.set(signature, normalizeFinding(finding));
      }
    }
  }

  const newFindings = [...latestMap.entries()]
    .filter(([signature]) => !previousMap.has(signature))
    .map(([, finding]) => finding);
  const fixedFindings = [...previousMap.entries()]
    .filter(([signature]) => !latestMap.has(signature))
    .map(([, finding]) => finding);
  const recurringFindings = [...latestMap.entries()]
    .filter(([signature]) => previousMap.has(signature))
    .map(([signature, finding]) => ({ ...finding, occurrences: occurrenceMap.get(signature)?.occurrences || 1 }));
  const recurringHotspots = [...occurrenceMap.values()]
    .filter((finding) => finding.occurrences > 1)
    .sort((left, right) => right.occurrences - left.occurrences || left.title.localeCompare(right.title))
    .slice(0, 10);

  const statusCounts: Record<string, number> = {};
  for (const report of reports) {
    statusCounts[report.status] = (statusCounts[report.status] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceDir: path.relative(process.cwd(), dirPath) || ".",
    totalRuns: reports.length,
    latest: latestReport
      ? {
          generatedAt: latestReport.generatedAt,
          status: latestReport.status,
          healthScore: latestReport.healthScore,
          url: latestReport.url,
          findings: latestReport.findings.length,
        }
      : null,
    previous: previousReport
      ? {
          generatedAt: previousReport.generatedAt,
          status: previousReport.status,
          healthScore: previousReport.healthScore,
          url: previousReport.url,
          findings: previousReport.findings.length,
        }
      : null,
    deltaHealthScore: latestReport && previousReport ? latestReport.healthScore - previousReport.healthScore : 0,
    currentStatusStreak: computeStatusStreak(timeline),
    statusCounts,
    timeline,
    newFindings,
    fixedFindings,
    recurringFindings,
    recurringHotspots,
  };
}

function renderFindingList(title: string, findings: TrendFinding[]): string {
  if (!findings.length) return `## ${title}\n\nNone.\n`;
  const lines = findings.map((finding) => `- **${finding.severity.toUpperCase()}** ${finding.title} (${finding.category})${finding.occurrences > 1 ? ` x${finding.occurrences}` : ""}`);
  return `## ${title}\n\n${lines.join("\n")}\n`;
}

function buildMarkdown(report: QaTrendReport): string {
  const timelineLines = report.timeline.length
    ? report.timeline
        .map((entry) => `- ${entry.generatedAt}: ${entry.status} | health ${entry.healthScore} | findings ${entry.findings}${entry.url ? ` | ${entry.url}` : ""}`)
        .join("\n")
    : "No QA runs found.";

  return `# QA Trends

- Generated: ${report.generatedAt}
- Source dir: ${report.sourceDir}
- Total runs: ${report.totalRuns}
- Latest status: ${report.latest?.status || "n/a"}
- Latest health score: ${report.latest?.healthScore ?? "n/a"}
- Health delta vs previous: ${report.deltaHealthScore}
- Current status streak: ${report.currentStatusStreak.status} x${report.currentStatusStreak.length}

## Timeline

${timelineLines}

${renderFindingList("New Findings", report.newFindings)}
${renderFindingList("Fixed Findings", report.fixedFindings)}
${renderFindingList("Recurring Findings", report.recurringFindings)}
${renderFindingList("Recurring Hotspots", report.recurringHotspots)}
`;
}

export function writeQaTrendArtifacts(args: Partial<QaTrendArgs> = {}): { report: QaTrendReport; jsonPath: string; markdownPath: string } {
  const dir = path.resolve(process.cwd(), args.dir || DEFAULT_QA_DIR);
  const jsonPath = path.resolve(process.cwd(), args.jsonOut || path.join(dir, "trends.json"));
  const markdownPath = path.resolve(process.cwd(), args.markdownOut || path.join(dir, "trends.md"));
  const report = buildTrendReport(dir, args.limit || 20);
  ensureDir(path.dirname(jsonPath));
  ensureDir(path.dirname(markdownPath));
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  return { report, jsonPath, markdownPath };
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const result = writeQaTrendArtifacts(args);
  if (args.json) {
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    console.log(`wrote ${path.relative(process.cwd(), result.jsonPath)} and ${path.relative(process.cwd(), result.markdownPath)}`);
  }
}
