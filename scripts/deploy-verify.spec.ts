#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-deploy-"));

const deployFixturePath = path.join(fixtureRoot, "deploy-fixture.json");
const qaFixturePath = path.join(fixtureRoot, "qa-fixture.json");
const readinessFixturePath = path.join(fixtureRoot, "readiness-fixture.json");
const baselinePath = path.join(fixtureRoot, "baseline.json");
const currentPath = path.join(fixtureRoot, "current.json");
const screenshotPath = path.join(fixtureRoot, "snapshot-screenshot.png");
const visualDir = path.join(fixtureRoot, "visual-pack");
const pageScreenshotA = path.join(fixtureRoot, "page-a.png");
const pageScreenshotB = path.join(fixtureRoot, "page-b.png");
const sessionBundlePath = path.join(fixtureRoot, "session-bundle.json");
const markdownOut = path.join(fixtureRoot, "deploy.md");
const jsonOut = path.join(fixtureRoot, "deploy.json");
const commentOut = path.join(fixtureRoot, "deploy-comment.md");
const publishDir = path.join(fixtureRoot, "published");

async function main(): Promise<void> {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=", "base64");
  fs.writeFileSync(screenshotPath, png);
  fs.writeFileSync(pageScreenshotA, png);
  fs.writeFileSync(pageScreenshotB, png);
  fs.mkdirSync(visualDir, { recursive: true });
  fs.writeFileSync(path.join(visualDir, "index.html"), "<html><body>visual pack</body></html>");
  fs.writeFileSync(path.join(visualDir, "manifest.json"), JSON.stringify({ status: "changed", imageDiff: { score: 68.2, diffRatio: 0.318 } }, null, 2));
  fs.writeFileSync(path.join(visualDir, "annotation.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  fs.writeFileSync(path.join(visualDir, "baseline.png"), png);
  fs.writeFileSync(path.join(visualDir, "current.png"), png);
  fs.writeFileSync(path.join(visualDir, "diff.png"), png);
  fs.writeFileSync(sessionBundlePath, JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    session: "deploy",
    metadata: {
      name: "deploy",
      authenticated: true,
    },
    storageState: {
      cookies: [
        {
          name: "session",
          value: "fixture",
          domain: "preview-77.example.com",
          path: "/",
        },
      ],
      origins: [],
    },
    source: {
      type: "manual",
      exportedFrom: "fixture",
    },
  }, null, 2));
  fs.writeFileSync(baselinePath, JSON.stringify({
    name: "portal-dashboard",
    capturedAt: "2025-01-01T00:00:00.000Z",
    routePath: "/dashboard",
    device: "mobile",
    elements: [{ selector: "h1", bounds: { x: 0, y: 0, width: 1, height: 1 } }],
  }, null, 2));
  fs.writeFileSync(currentPath, JSON.stringify({
    name: "portal-dashboard",
    elements: [],
  }, null, 2));

  fs.writeFileSync(deployFixturePath, JSON.stringify({
    pages: [
      {
        path: "/",
        device: "desktop",
        finalUrl: "https://preview-77.example.com/",
        title: "Marketing home",
        httpStatus: 200,
        consoleWarnings: ["A deprecated API is in use."],
        screenshot: pageScreenshotA,
      },
      {
        path: "/dashboard",
        device: "mobile",
        finalUrl: "https://preview-77.example.com/dashboard",
        title: "Dashboard",
        httpStatus: 503,
        consoleErrors: ["Unhandled exception in dashboard bootstrap."],
        screenshot: pageScreenshotB,
      },
    ],
  }, null, 2));

  fs.writeFileSync(qaFixturePath, JSON.stringify({
    url: "https://preview-77.example.com/dashboard",
    accessibility: {
      enabled: true,
      minimumImpact: "serious",
      scopeSelectors: ["#app"],
      violationCount: 2,
      passCount: 8,
      incompleteCount: 0,
      topRules: ["color-contrast (1)", "label (1)"],
      violations: [
        {
          id: "color-contrast",
          impact: "serious",
          help: "Ensure text contrast is sufficient",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
          selectors: ["#hero-cta"],
          nodeCount: 1,
        },
      ],
    },
    performance: {
      enabled: true,
      waitMs: 350,
      metrics: {
        ttfb: 110,
        domContentLoaded: 410,
        loadEvent: 700,
        fcp: 290,
        lcp: 2410,
        cls: 0.17,
        jsHeapUsed: 1048576,
        resourceCount: 15,
        failedResourceCount: 2,
      },
      budgets: [
        {
          metric: "lcp",
          label: "LCP",
          threshold: 2000,
          unit: "ms",
          severity: "high",
          raw: "lcp=2s",
          value: 2410,
          passed: false,
          detail: "LCP was 2410 ms which exceeds the budget of 2000 ms.",
        },
      ],
      budgetViolationCount: 1,
      topViolations: ["LCP was 2410 ms which exceeds the budget of 2000 ms."],
    },
    snapshot: {
      name: "portal-dashboard",
      result: {
        status: "changed",
        baseline: baselinePath,
        current: currentPath,
        screenshot: screenshotPath,
        visualPack: {
          dir: visualDir,
          index: path.join(visualDir, "index.html"),
          manifest: path.join(visualDir, "manifest.json"),
          annotation: path.join(visualDir, "annotation.svg"),
          diffImage: path.join(visualDir, "diff.png"),
          imageDiff: {
            score: 68.2,
            diffRatio: 0.318,
            changedPixels: 11,
            comparedPixels: 16,
            dimensionsMatch: true,
            baseline: { width: 1, height: 1 },
            current: { width: 1, height: 1 },
          },
        },
        comparison: {
          missingSelectors: ["h1"],
          changedSelectors: [],
          newSelectors: [],
          bodyTextChanged: true,
          titleChanged: false,
          screenshotChanged: true,
        },
      },
    },
    flows: [
      {
        name: "portal-dashboard",
        ok: true,
        steps: 4,
      },
    ],
  }, null, 2));

  fs.writeFileSync(readinessFixturePath, JSON.stringify({ attempts: [503, 200] }, null, 2));

  const rawJson = execFileSync(bun, [
    "scripts/deploy-verify.ts",
    "--url-template",
    "https://preview-{pr}.example.com",
    "--repo",
    "anup4khandelwal/codex-stack",
    "--pr",
    "77",
    "--branch",
    "feat/77-visual-deploy-verification",
    "--sha",
    "abcdef1234567890",
    "--path",
    "/",
    "--path",
    "/dashboard",
    "--device",
    "desktop",
    "--device",
    "mobile",
    "--flow",
    "portal-dashboard",
    "--snapshot",
    "portal-dashboard",
    "--session-bundle",
    sessionBundlePath,
    "--a11y",
    "--a11y-scope",
    "#app",
    "--a11y-impact",
    "serious",
    "--perf",
    "--perf-budget",
    "lcp=2s",
    "--perf-wait-ms",
    "350",
    "--strict-http",
    "--publish-dir",
    publishDir,
    "--markdown-out",
    markdownOut,
    "--json-out",
    jsonOut,
    "--comment-out",
    commentOut,
    "--fixture",
    deployFixturePath,
    "--qa-fixture",
    qaFixturePath,
    "--readiness-fixture",
    readinessFixturePath,
    "--json",
  ], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_RUN_ID: "123456",
    },
  });

  const report = JSON.parse(rawJson) as {
    status?: string;
    url?: string;
    urlSource?: string;
    recommendation?: string;
    visualRisk?: { level?: string; score?: number; staleBaselines?: number; topDrivers?: string[] };
    readiness?: { status?: string; attempts?: number };
    checks?: { paths?: string[]; devices?: string[]; strictHttp?: boolean };
    pathResults?: Array<{ path?: string; device?: string; status?: string; httpStatus?: number | null; screenshot?: string; console?: { errors?: string[]; warnings?: string[] } }>;
    qa?: {
      status?: string;
      flowResults?: Array<{ name?: string }>;
      snapshotResults?: Array<{ name?: string; status?: string; annotation?: string }>;
      findings?: Array<{ title?: string }>;
      accessibility?: { enabled?: boolean; violationCount?: number; topRules?: string[] };
      performance?: { enabled?: boolean; budgetViolationCount?: number; metrics?: { lcp?: number; cls?: number } };
    };
    visualPack?: { index?: string; manifest?: string };
    screenshotManifest?: string;
  };

  assert.equal(report.url, "https://preview-77.example.com");
  assert.equal(report.urlSource, "template");
  assert.equal(report.readiness?.status, "ready");
  assert.equal(report.readiness?.attempts, 2);
  assert.equal(report.checks?.strictHttp, true);
  assert.deepEqual(report.checks?.paths, ["/", "/dashboard"]);
  assert.deepEqual(report.checks?.devices, ["desktop", "mobile"]);
  assert.equal(report.status, "critical");
  assert.equal(report.visualRisk?.level, "critical");
  assert.ok(Number(report.visualRisk?.score || 0) >= 80);
  assert.equal(report.visualRisk?.staleBaselines, 1);
  assert.ok(report.visualRisk?.topDrivers?.some((entry) => String(entry).includes("critical page/device")));
  assert.match(String(report.recommendation), /Do not ship|Do not merge/i);
  assert.equal(report.pathResults?.length, 4);
  assert.ok(report.pathResults?.some((entry) => entry.path === "/dashboard" && entry.device === "mobile" && entry.status === "critical"));
  assert.ok(report.pathResults?.some((entry) => entry.path === "/" && entry.device === "desktop" && entry.status === "warning"));
  assert.equal(report.qa?.status, "critical");
  assert.ok(report.qa?.flowResults?.some((entry) => entry.name === "portal-dashboard"));
  assert.ok(report.qa?.snapshotResults?.some((entry) => entry.name === "portal-dashboard" && entry.status === "changed"));
  assert.ok(report.qa?.findings?.some((entry) => String(entry.title).includes("Expected UI selectors")));
  assert.equal(report.qa?.accessibility?.enabled, true);
  assert.equal(report.qa?.accessibility?.violationCount, 2);
  assert.ok(report.qa?.accessibility?.topRules?.includes("color-contrast (1)"));
  assert.equal(report.qa?.performance?.enabled, true);
  assert.equal(report.qa?.performance?.budgetViolationCount, 1);
  assert.equal(report.qa?.performance?.metrics?.lcp, 2410);
  assert.ok(report.screenshotManifest);
  assert.ok(String(report.visualPack?.index).includes("visual/index.html"));
  assert.ok(String(report.visualPack?.manifest).includes("visual/manifest.json"));
  const visualManifest = JSON.parse(fs.readFileSync(path.join(publishDir, "visual", "manifest.json"), "utf8")) as {
    visualRisk?: { score?: number; staleBaselines?: number };
    accessibility?: { violationCount?: number };
    performance?: { budgetViolationCount?: number };
    snapshots?: Array<{ imageDiffScore?: number; diffImage?: string; baselineFreshness?: { stale?: boolean; routePath?: string } }>;
  };
  assert.equal(visualManifest.visualRisk?.staleBaselines, 1);
  assert.equal(visualManifest.accessibility?.violationCount, 2);
  assert.equal(visualManifest.performance?.budgetViolationCount, 1);
  assert.ok(visualManifest.snapshots?.some((entry) => entry.imageDiffScore === 68.2));
  assert.ok(visualManifest.snapshots?.some((entry) => String(entry.diffImage).includes("diff.png")));
  assert.ok(visualManifest.snapshots?.some((entry) => entry.baselineFreshness?.stale === true && entry.baselineFreshness?.routePath === "/dashboard"));

  assert.ok(fs.existsSync(markdownOut));
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(commentOut));
  assert.ok(fs.existsSync(path.join(publishDir, "report.md")));
  assert.ok(fs.existsSync(path.join(publishDir, "report.json")));
  assert.ok(fs.existsSync(path.join(publishDir, "comment.md")));
  assert.ok(fs.existsSync(path.join(publishDir, "screenshots.json")));
  assert.ok(fs.existsSync(path.join(publishDir, "visual", "index.html")));
  assert.ok(fs.existsSync(path.join(publishDir, "visual", "manifest.json")));
  const visualSnapshotDirs = fs.readdirSync(path.join(publishDir, "visual", "snapshots"));
  assert.ok(visualSnapshotDirs.some((entry) => fs.existsSync(path.join(publishDir, "visual", "snapshots", entry, "index.html"))));
  assert.ok(visualSnapshotDirs.some((entry) => fs.existsSync(path.join(publishDir, "visual", "snapshots", entry, "diff.png"))));
  assert.ok(fs.existsSync(path.join(publishDir, "screenshots", "root-desktop.png")));
  assert.ok(fs.existsSync(path.join(publishDir, "screenshots", "dashboard-mobile.png")));

  const markdown = fs.readFileSync(markdownOut, "utf8");
  const comment = fs.readFileSync(commentOut, "utf8");
  assert.match(markdown, /codex-stack deploy verification/);
  assert.match(markdown, /Page checks/);
  assert.match(markdown, /root-desktop\.png/);
  assert.match(markdown, /dashboard-mobile\.png/);
  assert.match(markdown, /portal-dashboard/);
  assert.match(markdown, /Visual pack/);
  assert.match(markdown, /Visual risk: CRITICAL/);
  assert.match(markdown, /baselineAge=/);
  assert.match(markdown, /## Accessibility/);
  assert.match(markdown, /Violations: 2/);
  assert.match(markdown, /Top rules: color-contrast \(1\), label \(1\)/);
  assert.match(markdown, /## Performance/);
  assert.match(markdown, /Budget violations: 1/);
  assert.match(markdown, /LCP: 2410/);
  assert.match(comment, /Deploy URL: https:\/\/preview-77\.example\.com/);

  console.log("deploy-verify spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
