#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";

interface RunOptions extends Partial<ExecSyncOptionsWithStringEncoding> {}

interface ParsedArgs {
  source: string;
  out: string;
  baseUrl: string;
  json: boolean;
}

interface QaFinding {
  severity?: string;
  category?: string;
  title?: string;
  detail?: string;
  evidence?: Record<string, unknown>;
}

interface QaFlowResult {
  name?: string;
  status?: string;
  steps?: string | number;
}

interface QaSnapshotResult {
  name?: string;
  status?: string;
  baseline?: string;
  current?: string;
}

interface QaReportData extends Record<string, unknown> {
  status?: string;
  recommendation?: string;
  healthScore?: string | number;
  generatedAt?: string;
  url?: string;
  session?: string;
  mode?: string;
  findings?: QaFinding[];
  flowResults?: QaFlowResult[];
  snapshotResult?: QaSnapshotResult;
}

interface CollectedReport {
  slug: string;
  data: QaReportData;
  sourceDir: string;
  findingCount: number;
  flowCount: number;
  mdPath: string;
  jsonPath: string;
  annotationPath: string;
  screenshotPath: string;
  stableUrl: string;
  stableAnnotationUrl: string;
  stableScreenshotUrl: string;
}

interface LayoutProps {
  title: string;
  body: string;
  baseUrl: string;
  heading: string;
  subheading: string;
}

function usage(): never {
  console.log(`render-qa-pages

Usage:
  bun scripts/render-qa-pages.ts [--source <dir>] [--out <dir>] [--base-url <url>] [--json]
`);
  process.exit(0);
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    source: path.resolve(process.cwd(), "docs", "qa"),
    out: path.resolve(process.cwd(), ".site"),
    baseUrl: "",
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      out.source = path.resolve(process.cwd(), argv[i + 1] || "docs/qa");
      i += 1;
    } else if (arg === "--out") {
      out.out = path.resolve(process.cwd(), argv[i + 1] || ".site");
      i += 1;
    } else if (arg === "--base-url") {
      out.baseUrl = String(argv[i + 1] || "").trim();
      i += 1;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  return out;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanSubject(text: unknown): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function run(cmd: string, options: RunOptions = {}): string {
  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    return typeof output === "string" ? output.trim() : "";
  } catch {
    return "";
  }
}

function inferRepo(): string {
  if (process.env.GITHUB_REPOSITORY) return cleanSubject(process.env.GITHUB_REPOSITORY);
  const remote = run("git remote get-url origin");
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : "";
}

function defaultBaseUrl(repo: string): string {
  const [owner, name] = String(repo || "").split("/");
  if (!owner || !name) return "";
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${name}/`;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relativeFile(targetPath: string): string {
  return path.relative(process.cwd(), targetPath).replace(/\\/g, "/");
}

function copyTree(sourceDir: string, targetDir: string): void {
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function absoluteUrl(baseUrl: string, sitePath: string): string {
  if (!baseUrl || !sitePath) return "";
  return new URL(sitePath.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl)).toString();
}

function formatDate(value: unknown): string {
  if (!value) return "n/a";
  try {
    return new Date(String(value)).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC";
  } catch {
    return String(value);
  }
}

function severityClass(status: unknown): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "warning" || normalized === "high" || normalized === "medium") return "warning";
  return "pass";
}

function shellClass(status: unknown): string {
  return `status ${severityClass(status)}`;
}

function reportLink(baseUrl: string, report: Pick<CollectedReport, "slug">): string {
  return absoluteUrl(baseUrl, `qa/${report.slug}/`);
}

function assetLink(baseUrl: string, report: Pick<CollectedReport, "slug">, assetName: string): string {
  return absoluteUrl(baseUrl, `qa/${report.slug}/${assetName}`);
}

function reportRows(report: CollectedReport): string {
  const findings = Array.isArray(report.data?.findings) ? report.data.findings : [];
  if (!findings.length) {
    return '<li class="empty">No findings.</li>';
  }
  return findings.map((item) => {
    const evidence = Object.entries(item.evidence || {})
      .map(([key, value]) => `<span><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value ?? ""))}</span>`)
      .join("");
    return `<li class="finding ${severityClass(item.severity)}">
        <div class="finding-head">
        <span class="pill ${severityClass(item.severity)}">${escapeHtml(String(item.severity || "info").toUpperCase())}</span>
        <strong>${escapeHtml(item.title)}</strong>
        ${item.category ? `<span class="pill">${escapeHtml(String(item.category))}</span>` : ""}
      </div>
      <p>${escapeHtml(item.detail)}</p>
      ${evidence ? `<div class="evidence">${evidence}</div>` : ""}
    </li>`;
  }).join("\n");
}

function flowRows(report: CollectedReport): string {
  const flows = Array.isArray(report.data?.flowResults) ? report.data.flowResults : [];
  if (!flows.length) return '<li class="empty">No flows recorded.</li>';
  return flows.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.status)}${item.steps ? ` • ${item.steps} steps` : ""}</span></li>`).join("\n");
}

function layout({ title, body, baseUrl, heading, subheading }: LayoutProps): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f1ea;
      --panel: #fffdf8;
      --ink: #1d1c1a;
      --muted: #6d665c;
      --line: #ded6ca;
      --critical: #b42318;
      --warning: #b54708;
      --pass: #067647;
      --accent: #1d4ed8;
      --shadow: 0 18px 40px rgba(29, 28, 26, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(29, 78, 216, 0.08), transparent 32%),
        radial-gradient(circle at top right, rgba(180, 71, 8, 0.08), transparent 28%),
        linear-gradient(180deg, #f7f4ee 0%, var(--bg) 100%);
    }
    main { max-width: 1100px; margin: 0 auto; padding: 48px 20px 80px; }
    header { margin-bottom: 32px; }
    h1 {
      margin: 0 0 8px;
      font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
      font-size: clamp(2rem, 3.8vw, 3rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }
    p.lead { margin: 0; color: var(--muted); max-width: 760px; line-height: 1.6; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .toolbar {
      margin-top: 18px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
      padding: 22px;
    }
    .grid {
      display: grid;
      gap: 18px;
    }
    .grid.two {
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0.35rem 0.7rem;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .status.pass, .pill.pass { background: rgba(6, 118, 71, 0.12); color: var(--pass); }
    .status.warning, .pill.warning { background: rgba(181, 71, 8, 0.12); color: var(--warning); }
    .status.critical, .pill.critical { background: rgba(180, 35, 24, 0.12); color: var(--critical); }
    .report-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
      margin-top: 24px;
    }
    .report-card h2, .section h2 { margin-top: 0; font-size: 1.2rem; }
    .report-card p { color: var(--muted); line-height: 1.5; }
    .meta {
      margin: 16px 0;
      display: grid;
      gap: 8px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .links, .detail-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 14px;
    }
    .links a, .detail-links a {
      font-weight: 600;
      padding: 0.5rem 0.85rem;
      background: rgba(29, 78, 216, 0.08);
      border-radius: 999px;
    }
    .statline {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 12px;
      color: var(--muted);
    }
    ul.clean {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 12px;
    }
    .finding {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      background: #fff;
    }
    .finding.warning { border-color: rgba(181, 71, 8, 0.22); }
    .finding.critical { border-color: rgba(180, 35, 24, 0.22); }
    .finding-head {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.22rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .evidence {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .preview {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: #fff;
      overflow: hidden;
    }
    .preview img, .preview object {
      display: block;
      width: 100%;
      max-height: 540px;
      object-fit: contain;
      background: #f8f5ee;
    }
    .empty { color: var(--muted); }
    footer {
      margin-top: 32px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    @media (max-width: 720px) {
      main { padding: 32px 16px 56px; }
      .card { padding: 18px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(heading)}</h1>
      <p class="lead">${escapeHtml(subheading)}</p>
      ${baseUrl ? `<div class="toolbar"><span>Pages base</span><a href="${escapeHtml(baseUrl)}">${escapeHtml(baseUrl)}</a></div>` : ""}
    </header>
    ${body}
    <footer>Generated by codex-stack QA Pages.</footer>
  </main>
</body>
</html>`;
}

function renderIndex({ reports, baseUrl }: { reports: CollectedReport[]; baseUrl: string }): string {
  const content = reports.length
    ? reports.map((report) => `<article class="card report-card">
        <div class="${shellClass(report.data.status)}">${escapeHtml(report.data.status || "pass")}</div>
        <h2>${escapeHtml(report.slug)}</h2>
        <p>${escapeHtml(report.data.recommendation || "No recommendation recorded.")}</p>
        <div class="meta">
          <span><strong>Health score:</strong> ${escapeHtml(report.data.healthScore)}</span>
          <span><strong>Generated:</strong> ${escapeHtml(formatDate(report.data.generatedAt))}</span>
          <span><strong>URL:</strong> ${escapeHtml(report.data.url || "fixture")}</span>
        </div>
        <div class="statline">
          <span>Findings: ${escapeHtml(report.findingCount)}</span>
          <span>Flows: ${escapeHtml(report.flowCount)}</span>
        </div>
        <div class="links">
          <a href="${escapeHtml(`qa/${report.slug}/`)}">Open report</a>
          ${report.mdPath ? `<a href="${escapeHtml(report.mdPath)}">Markdown</a>` : ""}
          ${report.jsonPath ? `<a href="${escapeHtml(report.jsonPath)}">JSON</a>` : ""}
          ${report.annotationPath ? `<a href="${escapeHtml(report.annotationPath)}">Annotation</a>` : ""}
          ${report.screenshotPath ? `<a href="${escapeHtml(report.screenshotPath)}">Screenshot</a>` : ""}
        </div>
      </article>`).join("\n")
    : `<section class="card"><p class="empty">No published QA reports were found under docs/qa/ yet.</p></section>`;

  return layout({
    title: "codex-stack QA Reports",
    heading: "codex-stack QA Reports",
    subheading: "Stable GitHub Pages view for tracked QA evidence generated during shipping.",
    baseUrl,
    body: `<section class="report-grid">${content}</section>`,
  });
}

function renderReport(report: CollectedReport, baseUrl: string): string {
  const snapshot = report.data.snapshotResult || {};
  const detailLinks: string[] = [];
  if (report.mdPath) detailLinks.push(`<a href="report.md">Markdown</a>`);
  if (report.jsonPath) detailLinks.push(`<a href="report.json">JSON</a>`);
  if (report.annotationPath) detailLinks.push(`<a href="annotation.svg">Annotation</a>`);
  if (report.screenshotPath) detailLinks.push(`<a href="screenshot.png">Screenshot</a>`);

  const snapshotPreview = report.annotationPath
    ? `<object data="annotation.svg" type="image/svg+xml" aria-label="Annotated snapshot"></object>`
    : report.screenshotPath
      ? `<img src="screenshot.png" alt="Snapshot screenshot">`
      : '<div class="card empty">No snapshot preview recorded.</div>';

  return layout({
    title: `QA report • ${report.slug}`,
    heading: `QA report • ${report.slug}`,
    subheading: report.data.recommendation || "QA verification summary.",
    baseUrl,
    body: `
      <div class="toolbar"><a href="../../index.html">Back to index</a>${reportLink(baseUrl, report) ? ` <span>•</span> <a href="${escapeHtml(reportLink(baseUrl, report))}">Stable URL</a>` : ""}</div>
      <section class="grid two">
        <article class="card section">
          <div class="${shellClass(report.data.status)}">${escapeHtml(report.data.status || "pass")}</div>
          <div class="meta">
            <span><strong>Health score:</strong> ${escapeHtml(report.data.healthScore)}</span>
            <span><strong>Generated:</strong> ${escapeHtml(formatDate(report.data.generatedAt))}</span>
            <span><strong>Session:</strong> ${escapeHtml(report.data.session || "n/a")}</span>
            <span><strong>Mode:</strong> ${escapeHtml(report.data.mode || "n/a")}</span>
            <span><strong>URL:</strong> ${escapeHtml(report.data.url || "fixture")}</span>
          </div>
          <div class="detail-links">${detailLinks.join("\n") || '<span class="empty">No report assets recorded.</span>'}</div>
        </article>
        <article class="card section">
          <h2>Snapshot</h2>
          <div class="meta">
            <span><strong>Name:</strong> ${escapeHtml(snapshot.name || "n/a")}</span>
            <span><strong>Status:</strong> ${escapeHtml(snapshot.status || "n/a")}</span>
            ${snapshot.baseline ? `<span><strong>Baseline:</strong> ${escapeHtml(snapshot.baseline)}</span>` : ""}
            ${snapshot.current ? `<span><strong>Current:</strong> ${escapeHtml(snapshot.current)}</span>` : ""}
          </div>
        </article>
      </section>
      <section class="grid two" style="margin-top: 18px;">
        <article class="card section">
          <h2>Findings</h2>
          <ul class="clean">${reportRows(report)}</ul>
        </article>
        <article class="card section">
          <h2>Flow results</h2>
          <ul class="clean">${flowRows(report)}</ul>
        </article>
      </section>
      <section class="card section" style="margin-top: 18px;">
        <h2>Visual evidence</h2>
        <div class="preview">${snapshotPreview}</div>
      </section>
    `,
  });
}

function collectReports(sourceDir: string, baseUrl: string): CollectedReport[] {
  if (!fs.existsSync(sourceDir)) return [];
  return fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const reportDir = path.join(sourceDir, entry.name);
      const reportJson = path.join(reportDir, "report.json");
      const data = readJson<QaReportData | null>(reportJson, null);
      if (!data) return null;
      const report: CollectedReport = {
        slug: entry.name,
        data,
        sourceDir: reportDir,
        findingCount: Array.isArray(data.findings) ? data.findings.length : 0,
        flowCount: Array.isArray(data.flowResults) ? data.flowResults.length : 0,
        mdPath: fs.existsSync(path.join(reportDir, "report.md")) ? `qa/${entry.name}/report.md` : "",
        jsonPath: fs.existsSync(reportJson) ? `qa/${entry.name}/report.json` : "",
        annotationPath: fs.existsSync(path.join(reportDir, "annotation.svg")) ? `qa/${entry.name}/annotation.svg` : "",
        screenshotPath: fs.existsSync(path.join(reportDir, "screenshot.png")) ? `qa/${entry.name}/screenshot.png` : "",
        stableUrl: "",
        stableAnnotationUrl: "",
        stableScreenshotUrl: "",
      };
      report.stableUrl = reportLink(baseUrl, report);
      report.stableAnnotationUrl = report.annotationPath ? assetLink(baseUrl, report, "annotation.svg") : "";
      report.stableScreenshotUrl = report.screenshotPath ? assetLink(baseUrl, report, "screenshot.png") : "";
      return report;
    })
    .filter((report): report is CollectedReport => Boolean(report))
    .sort((left, right) => {
      const leftTime = Date.parse(left.data.generatedAt || "0") || 0;
      const rightTime = Date.parse(right.data.generatedAt || "0") || 0;
      return rightTime - leftTime;
    });
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const repo = inferRepo();
  const baseUrl = cleanSubject(args.baseUrl || process.env.CODEX_STACK_PAGES_BASE_URL || defaultBaseUrl(repo));
  const reports = collectReports(args.source, baseUrl);

  fs.rmSync(args.out, { recursive: true, force: true });
  ensureDir(args.out);
  ensureDir(path.join(args.out, "qa"));
  fs.writeFileSync(path.join(args.out, ".nojekyll"), "");

  if (fs.existsSync(args.source)) {
    for (const report of reports) {
      const targetDir = path.join(args.out, "qa", report.slug);
      copyTree(report.sourceDir, targetDir);
      fs.writeFileSync(path.join(targetDir, "index.html"), renderReport(report, baseUrl));
    }
  }

  const indexHtml = renderIndex({ reports, baseUrl });
  fs.writeFileSync(path.join(args.out, "index.html"), indexHtml);
  fs.writeFileSync(path.join(args.out, "qa", "index.html"), indexHtml);

  const manifest = {
    generatedAt: new Date().toISOString(),
    repo,
    baseUrl,
    sourceDir: relativeFile(args.source),
    outDir: relativeFile(args.out),
    reports: reports.map((report) => ({
      slug: report.slug,
      status: report.data.status,
      healthScore: report.data.healthScore,
      generatedAt: report.data.generatedAt,
      reportPath: report.jsonPath,
      stableUrl: report.stableUrl,
      stableAnnotationUrl: report.stableAnnotationUrl,
      stableScreenshotUrl: report.stableScreenshotUrl,
    })),
  };
  fs.writeFileSync(path.join(args.out, "manifest.json"), JSON.stringify(manifest, null, 2));

  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  console.log(`Rendered ${reports.length} QA report(s) to ${relativeFile(args.out)}.`);
  if (baseUrl) {
    console.log(`Pages base URL: ${baseUrl}`);
  }
}

main();
