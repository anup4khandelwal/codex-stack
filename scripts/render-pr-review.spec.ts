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
    readiness: {
      status: "ready",
      attempts: 2,
      httpStatus: 200,
    },
    qa: {
      healthScore: 60,
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
            manifest: "preview-artifacts/visual/manifest.json",
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
        manifest: "preview-artifacts/visual/manifest.json",
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
  assert.match(stdout, /CRITICAL\/VISUAL/);
  assert.match(stdout, /annotation\.svg/);
  assert.match(stdout, /### Deploy checks/);
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
