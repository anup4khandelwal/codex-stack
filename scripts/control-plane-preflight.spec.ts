#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const shipScript = path.join(rootDir, "scripts", "ship-branch.ts");
const fleetScript = path.join(rootDir, "scripts", "fleet.ts");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-preflight-"));
const controlState = path.join(tmpRoot, "control-plane.json");

function run(args: string[], cwd = rootDir): string {
  return execFileSync(bun, args, {
    cwd,
    encoding: "utf8",
  });
}

function runStatus(args: string[], cwd = rootDir) {
  return spawnSync(bun, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

run(["src/cli.ts", "agents", "add", "--name", "ship-1", "--runtime", "codex", "--role", "shipper", "--team", "release", "--status", "working", "--state", controlState, "--json"]);
run(["src/cli.ts", "agents", "add", "--name", "fleet-1", "--runtime", "codex", "--role", "manager", "--team", "platform", "--status", "working", "--state", controlState, "--json"]);

const shipRepo = path.join(tmpRoot, "ship-repo");
fs.mkdirSync(path.join(shipRepo, ".github"), { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main", shipRepo]);
execFileSync("git", ["-C", shipRepo, "config", "user.email", "preflight@example.com"]);
execFileSync("git", ["-C", shipRepo, "config", "user.name", "Preflight Test"]);
fs.writeFileSync(path.join(shipRepo, "package.json"), JSON.stringify({
  name: "ship-preflight",
  private: true,
  scripts: {
    smoke: "echo ok",
  },
}, null, 2));
fs.writeFileSync(path.join(shipRepo, ".github", "CODEOWNERS"), "README.md @docs-owner\n");
fs.writeFileSync(path.join(shipRepo, "README.md"), "baseline\n");
execFileSync("git", ["-C", shipRepo, "add", "package.json", "README.md", ".github/CODEOWNERS"]);
execFileSync("git", ["-C", shipRepo, "commit", "-m", "chore: baseline"], { stdio: ["ignore", "ignore", "ignore"] });
execFileSync("git", ["-C", shipRepo, "checkout", "-b", "feat/control-plane-gate"], { stdio: ["ignore", "ignore", "ignore"] });
fs.appendFileSync(path.join(shipRepo, "README.md"), "feature change\n");

const shipDryRun = JSON.parse(run([
  shipScript,
  "--dry-run",
  "--base", "main",
  "--pr",
  "--control-agent", "ship-1",
  "--control-state", controlState,
  "--json",
], shipRepo)) as {
  controlPlane: { enabled: boolean; allowed: boolean; plannedRequest: boolean; pendingApprovalId: string };
  warnings: string[];
};
assert.equal(shipDryRun.controlPlane.enabled, true);
assert.equal(shipDryRun.controlPlane.allowed, false);
assert.equal(shipDryRun.controlPlane.plannedRequest, true);
assert.equal(shipDryRun.controlPlane.pendingApprovalId, "");
assert.match(shipDryRun.warnings.join("\n"), /control-plane approval would be requested/i);

const shipBlocked = runStatus([
  shipScript,
  "--skip-tests",
  "--base", "main",
  "--control-agent", "ship-1",
  "--control-state", controlState,
  "--json",
], shipRepo);
assert.notEqual(shipBlocked.status, 0);
const shipBlockedPayload = JSON.parse(String(shipBlocked.stdout || "").trim()) as {
  controlPlane: { allowed: boolean; pendingApprovalId: string };
};
assert.equal(shipBlockedPayload.controlPlane.allowed, false);
assert.ok(shipBlockedPayload.controlPlane.pendingApprovalId);

const pendingShipApprovals = JSON.parse(run([
  "src/cli.ts", "approvals", "list",
  "--agent", "ship-1",
  "--kind", "ship-pr",
  "--status", "pending",
  "--state", controlState,
  "--json",
])) as Array<{ id: string }>;
assert.equal(pendingShipApprovals.length, 1);
run(["src/cli.ts", "approvals", "approve", pendingShipApprovals[0].id, "--by", "fleet-1", "--note", "Ship approved", "--state", controlState, "--json"]);

const shipApproved = JSON.parse(run([
  shipScript,
  "--dry-run",
  "--base", "main",
  "--pr",
  "--control-agent", "ship-1",
  "--control-state", controlState,
  "--json",
], shipRepo)) as {
  controlPlane: { allowed: boolean; approvedApprovalId: string };
};
assert.equal(shipApproved.controlPlane.allowed, true);
assert.equal(shipApproved.controlPlane.approvedApprovalId, pendingShipApprovals[0].id);

const fleetRoot = path.join(tmpRoot, "fleet");
const fleetControlDir = path.join(fleetRoot, "control");
const fleetRepoDir = path.join(fleetRoot, "repo-a");
const fleetPolicyDir = path.join(fleetControlDir, "policies");
const fleetManifestPath = path.join(fleetControlDir, "fleet.json");
fs.mkdirSync(fleetPolicyDir, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main", fleetRepoDir]);
fs.writeFileSync(path.join(fleetPolicyDir, "default.json"), JSON.stringify({
  name: "default",
  requiredChecks: ["review", "fleet-status"],
  remediation: {
    autoOpenPrs: true,
    issueOnWarning: true,
    issueOnCritical: true,
    closeIssueWhenHealthy: true,
  },
  status: {
    requiresLatestReport: false,
  },
}, null, 2));
fs.writeFileSync(fleetManifestPath, JSON.stringify({
  schemaVersion: 1,
  controlRepo: "acme/control-plane",
  policyDir: "./policies",
  repos: [
    {
      repo: "acme/repo-a",
      branch: "main",
      localPath: "../repo-a",
      team: "platform",
      policyPack: "default",
    },
  ],
}, null, 2));

const fleetDryRun = JSON.parse(run([
  fleetScript,
  "remediate",
  "--manifest", fleetManifestPath,
  "--dry-run",
  "--open-prs",
  "--control-agent", "fleet-1",
  "--control-state", controlState,
  "--json",
], fleetRoot)) as {
  results: Array<{ action: string; controlPlaneAllowed: boolean | null; controlPlaneApprovalId: string; notes: string[] }>;
};
assert.equal(fleetDryRun.results[0].action, "planned");
assert.equal(fleetDryRun.results[0].controlPlaneAllowed, false);
assert.equal(fleetDryRun.results[0].controlPlaneApprovalId, "");
assert.match(fleetDryRun.results[0].notes.join("\n"), /control-plane approval/i);

const fleetBlocked = JSON.parse(run([
  fleetScript,
  "remediate",
  "--manifest", fleetManifestPath,
  "--open-prs",
  "--control-agent", "fleet-1",
  "--control-state", controlState,
  "--json",
], fleetRoot)) as {
  results: Array<{ action: string; controlPlaneAllowed: boolean | null; controlPlaneApprovalId: string; notes: string[] }>;
};
assert.equal(fleetBlocked.results[0].action, "skipped");
assert.equal(fleetBlocked.results[0].controlPlaneAllowed, false);
assert.ok(fleetBlocked.results[0].controlPlaneApprovalId);

const pendingFleetApprovals = JSON.parse(run([
  "src/cli.ts", "approvals", "list",
  "--agent", "fleet-1",
  "--kind", "fleet-remediate",
  "--status", "pending",
  "--state", controlState,
  "--json",
])) as Array<{ id: string }>;
assert.equal(pendingFleetApprovals.length, 1);
run(["src/cli.ts", "approvals", "approve", pendingFleetApprovals[0].id, "--by", "ship-1", "--note", "Fleet rollout approved", "--state", controlState, "--json"]);

const fleetApproved = JSON.parse(run([
  fleetScript,
  "remediate",
  "--manifest", fleetManifestPath,
  "--dry-run",
  "--open-prs",
  "--control-agent", "fleet-1",
  "--control-state", controlState,
  "--json",
], fleetRoot)) as {
  results: Array<{ action: string; controlPlaneAllowed: boolean | null; controlPlaneApprovalId: string; notes: string[] }>;
};
assert.equal(fleetApproved.results[0].action, "planned");
assert.equal(fleetApproved.results[0].controlPlaneAllowed, true);
assert.equal(fleetApproved.results[0].controlPlaneApprovalId, pendingFleetApprovals[0].id);
assert.match(fleetApproved.results[0].notes.join("\n"), /Would open rollout PR/i);

console.log("control-plane preflight spec passed");
