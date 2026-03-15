#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-render-qa-pages-"));

function writeReport(dirPath: string, payload: Record<string, unknown>): void {
  fs.mkdirSync(path.join(dirPath, "visual"), { recursive: true });
  fs.writeFileSync(path.join(dirPath, "report.json"), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(dirPath, "report.md"), "# report\n");
  fs.writeFileSync(path.join(dirPath, "annotation.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  fs.writeFileSync(path.join(dirPath, "screenshot.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=", "base64"));
  fs.writeFileSync(path.join(dirPath, "visual", "index.html"), "<html><body>visual pack</body></html>");
  fs.writeFileSync(path.join(dirPath, "visual", "manifest.json"), JSON.stringify({ ok: true }, null, 2));
}

async function main(): Promise<void> {
  const sourceDir = path.join(fixtureRoot, "docs", "qa");
  const outDir = path.join(fixtureRoot, ".site");
  const reportA = path.join(sourceDir, "2026-03-01-login");
  const reportB = path.join(sourceDir, "2026-03-15-dashboard");

  writeReport(reportA, {
    generatedAt: "2026-03-01T10:00:00.000Z",
    url: "https://preview.example.com/login",
    status: "warning",
    healthScore: 82,
    recommendation: "Review the login copy drift.",
    findings: [],
    flowResults: [],
    snapshotResult: {
      name: "login",
      status: "changed",
      baseline: "baseline.json",
      current: "current.json",
      baselineFreshness: {
        routePath: "/login",
        device: "mobile",
        ageDays: 12,
        stale: false,
      },
      visualPack: {
        imageDiff: {
          score: 88.4,
          diffRatio: 0.116,
        },
      },
    },
    visualRisk: {
      score: 28,
      level: "medium",
      staleBaselines: 0,
    },
  });

  writeReport(reportB, {
    generatedAt: "2026-03-15T10:00:00.000Z",
    url: "https://preview.example.com/dashboard",
    status: "critical",
    healthScore: 46,
    recommendation: "Do not merge until the dashboard baseline is refreshed or fixed.",
    findings: [],
    flowResults: [],
    snapshotResult: {
      name: "dashboard",
      status: "changed",
      baseline: "baseline.json",
      current: "current.json",
      baselineFreshness: {
        routePath: "/dashboard",
        device: "desktop",
        ageDays: 47,
        stale: true,
      },
      visualPack: {
        imageDiff: {
          score: 63.7,
          diffRatio: 0.363,
        },
      },
    },
    visualRisk: {
      score: 86,
      level: "critical",
      staleBaselines: 1,
    },
  });

  execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "render-qa-pages.ts"),
      "--source",
      sourceDir,
      "--out",
      outDir,
      "--base-url",
      "https://anup4khandelwal.github.io/codex-stack/",
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );

  const indexHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  const reportHtml = fs.readFileSync(path.join(outDir, "qa", "2026-03-15-dashboard", "index.html"), "utf8");
  const history = JSON.parse(fs.readFileSync(path.join(outDir, "qa", "history.json"), "utf8")) as Array<{
    slug?: string;
    visualRiskScore?: number;
    imageDiffScore?: number;
    baselineAgeDays?: number;
    staleBaseline?: boolean;
  }>;
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as {
    historyPath?: string;
    reports?: Array<{ visualRiskScore?: number; staleBaseline?: boolean }>;
  };

  assert.match(indexHtml, /Visual history/);
  assert.match(indexHtml, /Visual risk score/);
  assert.match(indexHtml, /Snapshot image diff score/);
  assert.match(indexHtml, /Baseline age \(days\)/);
  assert.match(indexHtml, /Latest visual risk:<\/strong> CRITICAL \(86\/100\)/);
  assert.match(indexHtml, /Baseline age:<\/strong> 47d • stale/);
  assert.match(reportHtml, /Route:<\/strong> \/dashboard/);
  assert.match(reportHtml, /Baseline age:<\/strong> 47d • stale/);
  assert.equal(history.length, 2);
  assert.equal(history[1]?.slug, "2026-03-15-dashboard");
  assert.equal(history[1]?.visualRiskScore, 86);
  assert.equal(history[1]?.imageDiffScore, 63.7);
  assert.equal(history[1]?.baselineAgeDays, 47);
  assert.equal(history[1]?.staleBaseline, true);
  assert.equal(manifest.historyPath, "qa/history.json");
  assert.equal(manifest.reports?.[0]?.visualRiskScore, 86);
  assert.equal(manifest.reports?.[0]?.staleBaseline, true);

  console.log("render-qa-pages spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
