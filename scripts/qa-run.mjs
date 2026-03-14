#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const QA_DIR = path.resolve(process.cwd(), ".codex-stack", "qa");
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
    ? `- Snapshot: ${report.snapshotResult.status} (${report.snapshotResult.name})`
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
    } : null,
    artifacts: {},
  };
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

if (args.fixture) {
  const fixture = loadFixture(args.fixture);
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
}

report = writeArtifacts(report);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(buildMarkdown(report));
}
