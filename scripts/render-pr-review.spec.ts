#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-render-pr-review-"));

async function main(): Promise<void> {
  const reviewPath = path.join(fixtureRoot, "review.json");
  const previewPath = path.join(fixtureRoot, "preview.json");
  const markdownOut = path.join(fixtureRoot, "review.md");
  const summaryOut = path.join(fixtureRoot, "summary.json");
  const visualRoot = path.join(fixtureRoot, "preview-artifacts", "visual");
  fs.mkdirSync(path.join(visualRoot, "screenshots"), { recursive: true });
  fs.mkdirSync(path.join(visualRoot, "snapshots", "dashboard-root-desktop"), { recursive: true });
  fs.writeFileSync(path.join(visualRoot, "manifest.json"), JSON.stringify({
    screenshots: [
      {
        path: "/",
        device: "desktop",
        status: "warning",
        httpStatus: 200,
        screenshot: "screenshots/root-desktop.png",
        consoleWarnings: 1,
        consoleErrors: 0,
      },
    ],
    snapshots: [
      {
        name: "dashboard",
        targetPath: "/",
        device: "desktop",
        status: "changed",
        index: "snapshots/dashboard-root-desktop/index.html",
        manifest: "snapshots/dashboard-root-desktop/manifest.json",
        diffImage: "snapshots/dashboard-root-desktop/diff.png",
        imageDiffScore: 68.2,
        imageDiffRatio: 0.318,
      },
    ],
  }, null, 2));

  fs.writeFileSync(reviewPath, JSON.stringify({
    status: "ok",
    branch: "feat/23-pr-review-preview-evidence",
    baseRef: "origin/main",
    fileNames: ["scripts/render-pr-review.ts", ".github/workflows/pr-review.yml"],
    findings: [
      {
        severity: "warning",
        title: "Large review surface",
        detail: "The diff is broad.",
        files: ["scripts/render-pr-review.ts"],
      },
    ],
  }, null, 2));

  fs.writeFileSync(previewPath, JSON.stringify({
    status: "critical",
    url: "https://preview-23.example.com",
    runUrl: "https://github.com/anup4khandelwal/codex-stack/actions/runs/123456",
    recommendation: "Do not merge until the preview is fixed.",
    visualRisk: {
      level: "critical",
      score: 91.2,
      staleBaselines: 1,
      topDrivers: ["1 critical page/device check", "1 stale baseline"],
    },
    readiness: {
      status: "ready",
      attempts: 2,
      httpStatus: 200,
    },
    qa: {
      healthScore: 60,
      accessibility: {
        enabled: true,
        violationCount: 3,
        minimumImpact: "serious",
        topRules: ["color-contrast (2)", "label (1)"],
        artifactMarkdown: "preview-artifacts/a11y.md",
      },
      performance: {
        enabled: true,
        budgetViolationCount: 2,
        topViolations: ["LCP exceeded 2000 ms", "CLS exceeded 0.1"],
        metrics: {
          lcp: 2420,
          cls: 0.18,
          failedResourceCount: 1,
        },
        artifactMarkdown: "preview-artifacts/performance.md",
      },
      findings: [
        {
          severity: "critical",
          category: "visual",
          title: "Expected UI selectors are missing",
          detail: "The preview no longer renders the dashboard heading.",
        },
      ],
      artifacts: {
        published: {
          markdown: "preview-artifacts/report.md",
          annotation: "preview-artifacts/annotation.svg",
          screenshot: "preview-artifacts/screenshot.png",
          visualPack: {
            index: "preview-artifacts/visual/index.html",
            manifest: path.join(visualRoot, "manifest.json"),
          },
        },
      },
      snapshotResult: {
        name: "dashboard",
        status: "changed",
        annotation: "preview-artifacts/annotation.svg",
        screenshot: "preview-artifacts/screenshot.png",
      },
    },
    deploy: {
      screenshotManifest: "preview-artifacts/screenshots.json",
      visualPack: {
        index: "preview-artifacts/visual/index.html",
        manifest: path.join(visualRoot, "manifest.json"),
      },
      pathResults: [
        {
          path: "/",
          device: "desktop",
          status: "warning",
          httpStatus: 200,
          screenshot: "preview-artifacts/screenshots/root-desktop.png",
          console: {
            warnings: ["Deprecated API"],
            errors: [],
          },
        },
      ],
      qa: {
        snapshotResults: [
          {
            name: "dashboard",
            targetPath: "/",
            device: "desktop",
            status: "changed",
            baselineFreshness: {
              ageDays: 43,
              stale: true,
            },
            report: "preview-artifacts/qa/report.md",
            annotation: "preview-artifacts/annotation.svg",
            screenshot: "preview-artifacts/screenshot.png",
          },
        ],
      },
    },
  }, null, 2));

  const stdout = execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "render-pr-review.ts"),
      "--input",
      reviewPath,
      "--preview-input",
      previewPath,
      "--preview-pages-root",
      "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-23/__codex/",
      "--markdown-out",
      markdownOut,
      "--summary-out",
      summaryOut,
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );

  assert.match(stdout, /codex-stack PR review/);
  assert.match(stdout, /## Preview QA/);
  assert.match(stdout, /Preview URL: https:\/\/preview-23\.example\.com/);
  assert.match(stdout, /Workflow run: https:\/\/github\.com\/anup4khandelwal\/codex-stack\/actions\/runs\/123456/);
  assert.match(stdout, /Hosted visual pack: https:\/\/anup4khandelwal\.github\.io\/codex-stack\/pr-preview\/pr-23\/__codex\/visual\/index\.html/);
  assert.match(stdout, /Visual risk: CRITICAL \(91\.2\/100\)/);
  assert.match(stdout, /`changed` `score 68\.2` `ratio 0\.318` dashboard @ \//);
  assert.match(stdout, /1 stale baseline need review or refresh/);
  assert.match(stdout, /CRITICAL\/VISUAL/);
  assert.match(stdout, /Accessibility: 3 violations \(min impact serious\)/);
  assert.match(stdout, /Performance: 2 budget violations, 1 failed resources/);
  assert.match(stdout, /### Accessibility summary/);
  assert.match(stdout, /Top rules: color-contrast \(2\), label \(1\)/);
  assert.match(stdout, /### Performance summary/);
  assert.match(stdout, /LCP: 2420/);
  assert.match(stdout, /CLS: 0.18/);
  assert.match(stdout, /annotation\.svg/);
  assert.match(stdout, /### Deploy checks/);
  assert.match(stdout, /baselineAge=43d-stale/);
  assert.match(stdout, /!\[dashboard desktop\]\(https:\/\/anup4khandelwal\.github\.io\/codex-stack\/pr-preview\/pr-23\/__codex\/visual\/snapshots\/dashboard-root-desktop\/diff\.png\)/);
  assert.match(stdout, /consoleWarnings=1/);
  assert.match(stdout, /screenshots\.json/);
  assert.ok(fs.existsSync(markdownOut));
  assert.ok(fs.existsSync(summaryOut));

  const summary = JSON.parse(fs.readFileSync(summaryOut, "utf8")) as {
    blocking?: boolean;
    previewIncluded?: boolean;
    previewBlocking?: boolean;
    previewStatus?: string;
  };
  assert.equal(summary.previewIncluded, true);
  assert.equal(summary.previewBlocking, true);
  assert.equal(summary.previewStatus, "critical");
  assert.equal(summary.blocking, true);

  const failed = spawnSync(
    bun,
    [
      path.join(rootDir, "scripts", "render-pr-review.ts"),
      "--input",
      reviewPath,
      "--preview-input",
      previewPath,
      "--preview-pages-root",
      "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-23/__codex/",
      "--fail-on-critical",
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  );
  assert.equal(failed.status, 2);

  console.log("render-pr-review spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
