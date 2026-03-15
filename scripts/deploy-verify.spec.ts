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
    readiness?: { status?: string; attempts?: number };
    checks?: { paths?: string[]; devices?: string[]; strictHttp?: boolean };
    pathResults?: Array<{ path?: string; device?: string; status?: string; httpStatus?: number | null; screenshot?: string; console?: { errors?: string[]; warnings?: string[] } }>;
    qa?: { status?: string; flowResults?: Array<{ name?: string }>; snapshotResults?: Array<{ name?: string; status?: string; annotation?: string }>; findings?: Array<{ title?: string }> };
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
  assert.match(String(report.recommendation), /Do not ship|Do not merge/i);
  assert.equal(report.pathResults?.length, 4);
  assert.ok(report.pathResults?.some((entry) => entry.path === "/dashboard" && entry.device === "mobile" && entry.status === "critical"));
  assert.ok(report.pathResults?.some((entry) => entry.path === "/" && entry.device === "desktop" && entry.status === "warning"));
  assert.equal(report.qa?.status, "critical");
  assert.ok(report.qa?.flowResults?.some((entry) => entry.name === "portal-dashboard"));
  assert.ok(report.qa?.snapshotResults?.some((entry) => entry.name === "portal-dashboard" && entry.status === "changed"));
  assert.ok(report.qa?.findings?.some((entry) => String(entry.title).includes("Expected UI selectors")));
  assert.ok(report.screenshotManifest);
  assert.ok(String(report.visualPack?.index).includes("visual/index.html"));
  assert.ok(String(report.visualPack?.manifest).includes("visual/manifest.json"));
  const visualManifest = JSON.parse(fs.readFileSync(path.join(publishDir, "visual", "manifest.json"), "utf8")) as {
    snapshots?: Array<{ imageDiffScore?: number; diffImage?: string }>;
  };
  assert.ok(visualManifest.snapshots?.some((entry) => entry.imageDiffScore === 68.2));
  assert.ok(visualManifest.snapshots?.some((entry) => String(entry.diffImage).includes("diff.png")));

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
  assert.match(comment, /Deploy URL: https:\/\/preview-77\.example\.com/);

  console.log("deploy-verify spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
