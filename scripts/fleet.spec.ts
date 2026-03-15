#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-fleet-"));
const controlDir = path.join(fixtureRoot, "control");
const repoDir = path.join(fixtureRoot, "repo-a");
const manifestPath = path.join(controlDir, "fleet.json");
const policyDir = path.join(controlDir, "policies");
const dashboardDir = path.join(fixtureRoot, "dashboard");

function run(args: string[], cwd = rootDir): string {
  return execFileSync(bun, args, {
    cwd,
    encoding: "utf8",
  });
}

fs.mkdirSync(policyDir, { recursive: true });
fs.mkdirSync(path.join(repoDir, "docs", "qa", "latest"), { recursive: true });
fs.writeFileSync(path.join(policyDir, "default.json"), JSON.stringify({
  name: "default",
  requiredChecks: ["review", "preview", "fleet-status"],
  qa: {
    mode: "diff-aware",
    devices: ["desktop"],
    a11y: true,
  },
  preview: {
    paths: ["/", "/dashboard"],
    devices: ["desktop", "mobile"],
    strictHttp: true,
  },
  decisions: {
    staleAfterDays: 14,
    expiringSoonDays: 7,
  },
  schedule: {
    cron: "0 9 * * 1-5",
  },
}, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify({
  schemaVersion: 1,
  controlRepo: "acme/control-plane",
  policyDir: "policies",
  repos: [
    {
      repo: "acme/repo-a",
      branch: "main",
      localPath: repoDir,
      team: "platform",
      policyPack: "default",
      enabledChecks: ["qa"],
      previewUrlTemplate: "https://preview-{pr}.example.com",
      qa: {
        flows: ["portal-full-demo"],
      },
      preview: {
        snapshots: ["portal-dashboard"],
      },
    },
  ],
}, null, 2));
fs.writeFileSync(path.join(repoDir, "docs", "qa", "latest", "report.json"), JSON.stringify({
  generatedAt: "2026-03-15T00:00:00.000Z",
  status: "warning",
  recommendation: "Investigate unresolved visual regression",
  healthScore: 78,
  visualRisk: {
    score: 62,
    level: "warning",
    staleBaselines: 1,
  },
  decisionSummary: {
    approvedCount: 1,
    unresolvedCount: 2,
    expiredCount: 1,
  },
  accessibility: {
    violationCount: 3,
  },
  performance: {
    budgetViolationCount: 1,
  },
}, null, 2));

const validateReport = JSON.parse(run(["scripts/fleet.ts", "validate", "--manifest", manifestPath, "--json"])) as {
  controlRepo?: string;
  repos?: Array<{ repo?: string; requiredChecks?: string[] }>;
};
assert.equal(validateReport.controlRepo, "acme/control-plane");
assert.deepEqual(validateReport.repos?.[0]?.requiredChecks, ["fleet-status", "preview", "qa", "review"]);

const dryRunReport = JSON.parse(run(["scripts/fleet.ts", "sync", "--manifest", manifestPath, "--dry-run", "--json"])) as {
  results?: Array<{ repo?: string; action?: string; drift?: string; filesChanged?: string[] }>;
};
assert.equal(dryRunReport.results?.[0]?.repo, "acme/repo-a");
assert.equal(dryRunReport.results?.[0]?.action, "planned");
assert.equal(dryRunReport.results?.[0]?.drift, "missing");
assert.ok(dryRunReport.results?.[0]?.filesChanged?.includes(".codex-stack/fleet-member.json"));

const syncReport = JSON.parse(run(["scripts/fleet.ts", "sync", "--manifest", manifestPath, "--json"])) as {
  results?: Array<{ action?: string; filesChanged?: string[] }>;
};
assert.equal(syncReport.results?.[0]?.action, "written");
assert.ok(fs.existsSync(path.join(repoDir, ".codex-stack", "fleet-member.json")));
assert.ok(fs.existsSync(path.join(repoDir, ".github", "codex-stack", "fleet-status.js")));
assert.ok(fs.existsSync(path.join(repoDir, ".github", "workflows", "codex-stack-fleet-status.yml")));

const memberConfig = JSON.parse(fs.readFileSync(path.join(repoDir, ".codex-stack", "fleet-member.json"), "utf8")) as {
  controlRepo?: string;
  team?: string;
  previewUrlTemplate?: string;
  requiredChecks?: string[];
};
assert.equal(memberConfig.controlRepo, "acme/control-plane");
assert.equal(memberConfig.team, "platform");
assert.equal(memberConfig.previewUrlTemplate, "https://preview-{pr}.example.com");
assert.deepEqual(memberConfig.requiredChecks, ["fleet-status", "preview", "qa", "review"]);

const statusOut = path.join(repoDir, ".codex-stack", "fleet-status", "status.json");
const statusJson = run([path.join(repoDir, ".github", "codex-stack", "fleet-status.js"), "--out", statusOut, "--json"], repoDir);
const statusReport = JSON.parse(statusJson) as {
  installed?: boolean;
  status?: string;
  riskScore?: number;
  latestReport?: { unresolvedRegressions?: number } | null;
};
assert.equal(statusReport.installed, true);
assert.equal(statusReport.status, "warning");
assert.ok(Number(statusReport.riskScore) > 0);
assert.equal(statusReport.latestReport?.unresolvedRegressions, 2);

const collectReport = JSON.parse(run(["scripts/fleet.ts", "collect", "--manifest", manifestPath, "--json"])) as {
  counts?: { repos?: number; warning?: number; drifted?: number };
  repos?: Array<{ repo?: string; source?: string; status?: string; riskScore?: number }>;
};
assert.equal(collectReport.counts?.repos, 1);
assert.equal(collectReport.counts?.warning, 1);
assert.equal(collectReport.counts?.drifted, 0);
assert.equal(collectReport.repos?.[0]?.repo, "acme/repo-a");
assert.equal(collectReport.repos?.[0]?.source, "local");
assert.equal(collectReport.repos?.[0]?.status, "warning");
assert.ok(Number(collectReport.repos?.[0]?.riskScore) > 0);

run(["scripts/fleet.ts", "dashboard", "--manifest", manifestPath, "--out", dashboardDir], rootDir);
assert.ok(fs.existsSync(path.join(dashboardDir, "index.html")));
assert.ok(fs.existsSync(path.join(dashboardDir, "manifest.json")));
assert.ok(fs.existsSync(path.join(dashboardDir, "summary.md")));
assert.match(fs.readFileSync(path.join(dashboardDir, "index.html"), "utf8"), /codex-stack fleet dashboard/);
assert.match(fs.readFileSync(path.join(dashboardDir, "manifest.json"), "utf8"), /acme\/repo-a/);

fs.rmSync(fixtureRoot, { recursive: true, force: true });
console.log("fleet spec passed");
