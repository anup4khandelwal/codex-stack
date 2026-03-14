#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const QA_DIR = path.resolve(process.cwd(), ".codex-stack", "qa");
const QA_ANNOTATION_DIR = path.join(QA_DIR, "annotations");
const BROWSE_CLI = path.resolve(process.cwd(), "browse", "dist", "cli.js");

function usage() {
  console.log(`qa-run

Usage:
  node scripts/qa-run.mjs <url> [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--mode <quick|full|regression>] [--json]
  node scripts/qa-run.mjs --fixture <path> [--json]
`);
  process.exit(0);
}

function parseArgs(argv) {
  const out = {
    url: "",
    flows: [],
    snapshot: "",
    updateSnapshot: false,
    session: "qa",
    mode: "full",
    json: false,
    fixture: "",
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "qa";
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
}

function runBrowse(args) {
  const result = spawnSync("node", [BROWSE_CLI, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  let parsed = null;
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

function finding(severity, title, detail, evidence = {}) {
  return { severity, title, detail, evidence };
}

function scoreFindings(findings) {
  let score = 100;
  for (const item of findings) {
    if (item.severity === "critical") score -= 40;
    else if (item.severity === "warning") score -= 15;
    else if (item.severity === "info") score -= 0;
  }
  return Math.max(0, score);
}

function statusFromFindings(findings) {
  if (findings.some((item) => item.severity === "critical")) return "critical";
  if (findings.some((item) => item.severity === "warning")) return "warning";
  return "pass";
}

function recommendation(status, healthScore) {
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

function buildMarkdown(report) {
  const findingLines = report.findings.length
    ? report.findings.map((item) => `### ${item.severity.toUpperCase()}: ${item.title}\n\n${item.detail}\n\nEvidence: ${Object.entries(item.evidence || {}).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`).join("\n\n")
    : "No findings.";
  const flowLines = report.flowResults.length
    ? report.flowResults.map((item) => `- ${item.name}: ${item.status}`).join("\n")
    : "- none";
  const snapshotLine = report.snapshotResult
    ? [
      `- Snapshot: ${report.snapshotResult.status} (${report.snapshotResult.name})`,
      report.snapshotResult.screenshot ? `- Screenshot: ${report.snapshotResult.screenshot}` : "",
      report.snapshotResult.annotation ? `- Annotation: ${report.snapshotResult.annotation}` : "",
    ].filter(Boolean).join("\n")
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

function relative(filePath) {
  return path.relative(process.cwd(), filePath) || path.basename(filePath);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function resolveMaybeRelative(filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadSnapshotDocument(refOrObject) {
  if (!refOrObject) return null;
  if (typeof refOrObject === "object") return refOrObject;
  const resolved = resolveMaybeRelative(refOrObject);
  return resolved && fs.existsSync(resolved) ? readJson(resolved, null) : null;
}

function pngDimensions(filePath) {
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

function screenshotDataUri(filePath) {
  const resolved = resolveMaybeRelative(filePath);
  if (!resolved || !fs.existsSync(resolved)) return "";
  return `data:image/png;base64,${fs.readFileSync(resolved).toString("base64")}`;
}

function selectorBounds(snapshot, selector) {
  const elements = Array.isArray(snapshot?.elements) ? snapshot.elements : [];
  const match = elements.find((item) => item?.selector === selector);
  return match?.bounds || null;
}

function annotationMarkers(comparison, baselineSnapshot, currentSnapshot) {
  const markers = [];
  const missingSelectors = Array.isArray(comparison?.missingSelectors) ? comparison.missingSelectors : [];
  for (const selector of missingSelectors) {
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

  const changedSelectors = Array.isArray(comparison?.changedSelectors) ? comparison.changedSelectors : [];
  for (const item of changedSelectors) {
    const selector = item?.selector || "";
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

  const newSelectors = Array.isArray(comparison?.newSelectors) ? comparison.newSelectors : [];
  for (const selector of newSelectors) {
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

function renderAnnotationSvg({ screenshotPath, markers, title }) {
  const screenshot = resolveMaybeRelative(screenshotPath);
  if (!screenshot || !fs.existsSync(screenshot)) return "";
  const { width, height } = pngDimensions(screenshot);
  const imageHref = screenshotDataUri(screenshot);
  const topPadding = 56;
  const markerSvg = markers.map((marker, index) => {
    const x = Number(marker.bounds?.x || 0);
    const y = Number(marker.bounds?.y || 0) + topPadding;
    const w = Math.max(4, Number(marker.bounds?.width || 0));
    const h = Math.max(4, Number(marker.bounds?.height || 0));
    const labelY = Math.max(20, y - 6);
    return [
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${marker.color}" stroke-width="3"/>`,
      `<rect x="${x}" y="${Math.max(4, labelY - 18)}" width="${Math.min(width - x, Math.max(80, marker.label.length * 7))}" height="18" fill="${marker.color}" opacity="0.92"/>`,
      `<text x="${x + 6}" y="${labelY - 5}" font-family="monospace" font-size="11" fill="#ffffff">${escapeXml(`${index + 1}. ${marker.label}`)}</text>`,
    ].join("");
  }).join("\n");

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

function createAnnotatedSnapshotArtifact(report, snapshotEvidence) {
  if (!snapshotEvidence?.ok) return null;
  if (snapshotEvidence.command !== "compare-snapshot") return null;
  const result = snapshotEvidence.result || {};
  const comparison = result.comparison || {};
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

function collectSnapshotEvidence(args) {
  if (!args.snapshot) return null;
  if (args.updateSnapshot) {
    const saved = runBrowse(["snapshot", args.url, args.snapshot, "--session", args.session]);
    return {
      kind: "snapshot",
      command: "snapshot",
      result: saved.parsed || { status: saved.ok ? "saved" : "failed", stderr: saved.stderr },
      ok: saved.ok,
      stderr: saved.stderr,
    };
  }
  const compared = runBrowse(["compare-snapshot", args.url, args.snapshot, "--session", args.session]);
  return {
    kind: "snapshot",
    command: "compare-snapshot",
    result: compared.parsed || { status: compared.ok ? "unknown" : "failed", stderr: compared.stderr },
    ok: compared.ok,
    stderr: compared.stderr,
  };
}

function collectFlowEvidence(args) {
  return args.flows.map((flowName) => {
    const result = runBrowse(["run-flow", args.url, flowName, "--session", args.session]);
    return {
      name: flowName,
      ok: result.ok,
      status: result.ok ? "pass" : "failed",
      steps: Array.isArray(result.parsed) ? result.parsed.length : 0,
      stderr: result.stderr,
      raw: result.parsed || result.stdout,
    };
  });
}

function buildReport({ args, snapshotEvidence, flowEvidence }) {
  const findings = [];

  for (const flow of flowEvidence) {
    if (!flow.ok) {
      findings.push(finding(
        "critical",
        `Flow failed: ${flow.name}`,
        flow.stderr || `The ${flow.name} flow exited with a non-zero status.`,
        { flow: flow.name }
      ));
    }
  }

  if (snapshotEvidence) {
    const snapshotResult = snapshotEvidence.result || {};
    if (!snapshotEvidence.ok) {
      findings.push(finding(
        "critical",
        `Snapshot command failed: ${snapshotEvidence.command}`,
        snapshotEvidence.stderr || "The snapshot command failed before producing evidence.",
        { snapshot: args.snapshot }
      ));
    } else if (snapshotEvidence.command === "compare-snapshot" && snapshotResult.comparison) {
      const comparison = snapshotResult.comparison;
      if (comparison.missingSelectors?.length) {
        findings.push(finding(
          "critical",
          "Expected UI selectors are missing",
          `The live page no longer contains ${comparison.missingSelectors.length} selectors from the baseline.`,
          { snapshot: args.snapshot, baseline: snapshotResult.baseline, current: snapshotResult.current }
        ));
      }
      if (comparison.changedSelectors?.length || comparison.bodyTextChanged || comparison.titleChanged || comparison.screenshotChanged || comparison.newSelectors?.length) {
        findings.push(finding(
          "warning",
          "Snapshot drift detected",
          `The page differs from the saved baseline for ${args.snapshot}.`,
          { snapshot: args.snapshot, screenshot: snapshotResult.screenshot, current: snapshotResult.current }
        ));
      }
    }
  }

  const healthScore = scoreFindings(findings);
  const status = statusFromFindings(findings);
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    url: args.url,
    mode: args.mode,
    session: args.session,
    status,
    healthScore,
    recommendation: recommendation(status, healthScore),
    findings,
    flowResults: flowEvidence.map((item) => ({ name: item.name, status: item.status, steps: item.steps })),
    snapshotResult: snapshotEvidence ? {
      name: args.snapshot,
      status: snapshotEvidence.result?.status || (snapshotEvidence.ok ? "ok" : "failed"),
      baseline: snapshotEvidence.result?.baseline || snapshotEvidence.result?.snapshot || "",
      current: snapshotEvidence.result?.current || "",
      screenshot: snapshotEvidence.result?.screenshot || "",
      annotation: "",
    } : null,
    artifacts: {},
  };
  return report;
}

function attachSnapshotAnnotation(report, snapshotEvidence) {
  const artifact = createAnnotatedSnapshotArtifact(report, snapshotEvidence);
  if (!artifact) return report;

  if (report.snapshotResult) {
    report.snapshotResult.annotation = artifact.annotation;
  }
  for (const item of report.findings) {
    if (item.evidence?.snapshot) {
      item.evidence.annotation = artifact.annotation;
      item.evidence.screenshot = item.evidence.screenshot || artifact.screenshot;
    }
  }
  report.artifacts.annotation = artifact.annotation;
  return report;
}

function writeArtifacts(report) {
  ensureDir(QA_DIR);
  const stamp = `${timestampSlug()}-${slugify(report.url || report.snapshotResult?.name || "fixture")}`;
  const jsonPath = path.join(QA_DIR, `${stamp}.json`);
  const markdownPath = path.join(QA_DIR, `${stamp}.md`);
  const latestJsonPath = path.join(QA_DIR, "latest.json");
  const latestMarkdownPath = path.join(QA_DIR, "latest.md");
  report.artifacts = {
    ...(report.artifacts || {}),
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

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

const args = parseArgs(process.argv.slice(2));
let report;
let fixture = null;

if (args.fixture) {
  fixture = loadFixture(args.fixture);
  report = buildReport({
    args: {
      ...args,
      url: fixture.url || args.url,
      snapshot: fixture.snapshot?.name || args.snapshot,
    },
    snapshotEvidence: fixture.snapshot ? {
      ok: fixture.snapshot.ok !== false,
      command: fixture.snapshot.command || "compare-snapshot",
      result: fixture.snapshot.result || fixture.snapshot,
      stderr: fixture.snapshot.stderr || "",
    } : null,
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

if (args.fixture) {
  report = attachSnapshotAnnotation(report, fixture.snapshot ? {
    ok: fixture.snapshot.ok !== false,
    command: fixture.snapshot.command || "compare-snapshot",
    result: fixture.snapshot.result || fixture.snapshot,
  } : null);
}

report = writeArtifacts(report);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(buildMarkdown(report));
}
