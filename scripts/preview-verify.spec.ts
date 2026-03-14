#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-preview-"));

const deployFixturePath = path.join(fixtureRoot, "deploy-fixture.json");
const qaFixturePath = path.join(fixtureRoot, "qa-fixture.json");
const readinessFixturePath = path.join(fixtureRoot, "readiness-fixture.json");
const baselinePath = path.join(fixtureRoot, "baseline.json");
const currentPath = path.join(fixtureRoot, "current.json");
const screenshotPath = path.join(fixtureRoot, "screenshot.png");
const pageScreenshot = path.join(fixtureRoot, "page.png");
const sessionBundlePath = path.join(fixtureRoot, "session-bundle.json");
const markdownOut = path.join(fixtureRoot, "preview.md");
const jsonOut = path.join(fixtureRoot, "preview.json");
const commentOut = path.join(fixtureRoot, "preview-comment.md");
const publishDir = path.join(fixtureRoot, "published");

async function main(): Promise<void> {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=", "base64");
  fs.writeFileSync(screenshotPath, png);
  fs.writeFileSync(pageScreenshot, png);
  fs.writeFileSync(sessionBundlePath, JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    session: "preview",
    metadata: {
      name: "preview",
      authenticated: true,
    },
    storageState: {
      cookies: [
        {
          name: "session",
          value: "fixture",
          domain: "preview-42.example.com",
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
    name: "landing-home",
    elements: [{ selector: "h1", bounds: { x: 0, y: 0, width: 1, height: 1 } }],
  }, null, 2));
  fs.writeFileSync(currentPath, JSON.stringify({ name: "landing-home", elements: [] }, null, 2));

  fs.writeFileSync(deployFixturePath, JSON.stringify({
    pages: [
      {
        path: "/",
        device: "desktop",
        finalUrl: "https://preview-42.example.com/",
        title: "Landing",
        httpStatus: 200,
        consoleWarnings: ["Console drift"],
        screenshot: pageScreenshot,
      },
    ],
  }, null, 2));

  fs.writeFileSync(qaFixturePath, JSON.stringify({
    url: "https://preview.example.com/dashboard",
    snapshot: {
      name: "landing-home",
      result: {
        status: "changed",
        baseline: baselinePath,
        current: currentPath,
        screenshot: screenshotPath,
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
    flows: [{ name: "landing-smoke", ok: true, steps: 4 }],
  }, null, 2));

  fs.writeFileSync(readinessFixturePath, JSON.stringify({ attempts: [503, 503, 200] }, null, 2));

  const rawJson = execFileSync(bun, [
    "scripts/preview-verify.ts",
    "--url-template",
    "https://preview-{pr}.example.com",
    "--repo",
    "anup4khandelwal/codex-stack",
    "--pr",
    "42",
    "--branch",
    "feat/42-preview-ready",
    "--sha",
    "abcdef1234567890",
    "--path",
    "/",
    "--device",
    "desktop",
    "--flow",
    "landing-smoke",
    "--snapshot",
    "landing-home",
    "--session-bundle",
    sessionBundlePath,
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
    readiness?: { status?: string; attempts?: number };
    context?: { branchSlug?: string; shortSha?: string };
    deploy?: { screenshotManifest?: string; pathResults?: Array<{ status?: string; screenshot?: string }> };
    qa?: { snapshotResult?: { status?: string; annotation?: string }; findings?: Array<{ title?: string }> };
  };

  assert.equal(report.url, "https://preview-42.example.com");
  assert.equal(report.urlSource, "template");
  assert.equal(report.status, "critical");
  assert.match(String(report.recommendation), /Do not ship|Do not merge/i);
  assert.equal(report.readiness?.status, "ready");
  assert.ok(Number(report.readiness?.attempts || 0) >= 3);
  assert.equal(report.context?.branchSlug, "feat-42-preview-ready");
  assert.equal(report.context?.shortSha, "abcdef1");
  assert.ok(report.deploy?.screenshotManifest);
  assert.ok(report.deploy?.pathResults?.some((entry) => entry.status === "warning" && String(entry.screenshot).includes("root-desktop")));
  assert.equal(report.qa?.snapshotResult?.status, "changed");
  assert.ok(report.qa?.findings?.some((entry) => String(entry.title).includes("Expected UI selectors")));

  assert.ok(fs.existsSync(markdownOut));
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(commentOut));
  assert.ok(fs.existsSync(path.join(publishDir, "report.md")));
  assert.ok(fs.existsSync(path.join(publishDir, "report.json")));

  const markdown = fs.readFileSync(markdownOut, "utf8");
  const comment = fs.readFileSync(commentOut, "utf8");
  assert.match(markdown, /codex-stack preview verification/);
  assert.match(markdown, /Preview URL: https:\/\/preview-42\.example\.com/);
  assert.match(markdown, /Readiness: ready after 3 attempt/);
  assert.match(markdown, /Workflow run: https:\/\/github.com\/anup4khandelwal\/codex-stack\/actions\/runs\/123456/);
  assert.match(markdown, /## Deploy checks/);
  assert.match(markdown, /root-desktop\.png/);
  assert.match(comment, /Expected UI selectors are missing/);

  console.log("preview-verify spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
