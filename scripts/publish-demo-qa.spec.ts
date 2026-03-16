#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-demo-qa-"));
const result = spawnSync(process.execPath || "bun", [
  "scripts/publish-demo-qa.ts",
  "--out",
  outDir,
  "--json",
], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

assert.equal(result.status, 0, result.stderr || "Expected publish-demo-qa to succeed.");

const summary = JSON.parse(result.stdout || "{}") as {
  status?: string;
  visualPack?: boolean;
};
assert.equal(summary.status, "warning");
assert.equal(summary.visualPack, true);

const reportJsonPath = path.join(outDir, "report.json");
const reportMarkdownPath = path.join(outDir, "report.md");
const visualIndexPath = path.join(outDir, "visual", "index.html");

assert.ok(fs.existsSync(reportJsonPath));
assert.ok(fs.existsSync(reportMarkdownPath));
assert.ok(fs.existsSync(path.join(outDir, "a11y.json")));
assert.ok(fs.existsSync(path.join(outDir, "performance.json")));
assert.ok(fs.existsSync(visualIndexPath));

const report = JSON.parse(fs.readFileSync(reportJsonPath, "utf8")) as {
  url?: string;
  accessibility?: { violationCount?: number };
  performance?: { budgetViolationCount?: number };
  snapshotResult?: { name?: string };
};
assert.equal(report.snapshotResult?.name, "release-dashboard");
assert.equal(report.accessibility?.violationCount, 2);
assert.equal(report.performance?.budgetViolationCount, 2);
assert.match(String(report.url || ""), /github\.io|127\.0\.0\.1/);

const visualIndex = fs.readFileSync(visualIndexPath, "utf8");
assert.match(visualIndex, /Release readiness visual pack/);
assert.match(visualIndex, /release-status-card/);

const reportMarkdown = fs.readFileSync(reportMarkdownPath, "utf8");
assert.match(reportMarkdown, /Accessibility JSON: .*a11y\.json/);
assert.match(reportMarkdown, /Performance JSON: .*performance\.json/);

fs.rmSync(outDir, { recursive: true, force: true });
console.log("publish-demo-qa spec passed");
