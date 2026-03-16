#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { __testing } from "./fleet";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fleetScript = path.join(rootDir, "scripts", "fleet.ts");
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

function runWithEnv(args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  return execFileSync(bun, args, {
    cwd,
    encoding: "utf8",
    env,
  });
}

fs.mkdirSync(policyDir, { recursive: true });
fs.mkdirSync(path.join(repoDir, "docs", "qa", "latest"), { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main", repoDir]);
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
  status: {
    requiresLatestReport: true,
  },
  schedule: {
    cron: "0 9 * * 1-5",
  },
}, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify({
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

const validateReport = JSON.parse(run([fleetScript, "validate", "--manifest", manifestPath, "--json"], fixtureRoot)) as {
  controlRepo?: string;
  repos?: Array<{ repo?: string; requiredChecks?: string[]; localPath?: string; localRepoDetected?: boolean; valid?: boolean }>;
};
assert.equal(validateReport.controlRepo, "acme/control-plane");
assert.deepEqual(validateReport.repos?.[0]?.requiredChecks, ["fleet-status", "preview", "qa", "review"]);
assert.equal(validateReport.repos?.[0]?.localPath, repoDir);
assert.equal(validateReport.repos?.[0]?.localRepoDetected, true);
assert.equal(validateReport.repos?.[0]?.valid, true);

const invalidManifestPath = path.join(controlDir, "fleet-invalid.json");
fs.writeFileSync(invalidManifestPath, JSON.stringify({
  schemaVersion: 1,
  controlRepo: "acme/control-plane",
  policyDir: "./policies",
  repos: [
    {
      repo: "acme/missing-repo",
      branch: "main",
      localPath: "../missing-repo",
      policyPack: "default",
    },
  ],
}, null, 2));

const invalidValidateReport = JSON.parse(run([fleetScript, "validate", "--manifest", invalidManifestPath, "--json"], fixtureRoot)) as {
  repos?: Array<{ valid?: boolean; localRepoDetected?: boolean; localPath?: string }>;
};
assert.equal(invalidValidateReport.repos?.[0]?.localRepoDetected, false);
assert.equal(invalidValidateReport.repos?.[0]?.valid, false);

const invalidSyncReport = JSON.parse(run([fleetScript, "sync", "--manifest", invalidManifestPath, "--dry-run", "--json"], fixtureRoot)) as {
  results?: Array<{ action?: string; notes?: string[] }>;
};
assert.equal(invalidSyncReport.results?.[0]?.action, "invalid");
assert.equal(invalidSyncReport.results?.[0]?.notes?.[0], "Configured localPath is not a Git repo root.");

const dryRunReport = JSON.parse(run([fleetScript, "sync", "--manifest", manifestPath, "--dry-run", "--json"], fixtureRoot)) as {
  results?: Array<{ repo?: string; action?: string; drift?: string; filesChanged?: string[] }>;
};
assert.equal(dryRunReport.results?.[0]?.repo, "acme/repo-a");
assert.equal(dryRunReport.results?.[0]?.action, "planned");
assert.equal(dryRunReport.results?.[0]?.drift, "missing");
assert.ok(dryRunReport.results?.[0]?.filesChanged?.includes(".codex-stack/fleet-member.json"));

const preSyncCollectReport = JSON.parse(run([fleetScript, "collect", "--manifest", manifestPath, "--json"], fixtureRoot)) as {
  counts?: { missing?: number };
  repos?: Array<{ installed?: boolean; source?: string }>;
};
assert.equal(preSyncCollectReport.counts?.missing, 1);
assert.equal(preSyncCollectReport.repos?.[0]?.installed, false);
assert.equal(preSyncCollectReport.repos?.[0]?.source, "local");

const syncReport = JSON.parse(run([fleetScript, "sync", "--manifest", manifestPath, "--json"], fixtureRoot)) as {
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
  status?: { requiresLatestReport?: boolean };
};
assert.equal(memberConfig.controlRepo, "acme/control-plane");
assert.equal(memberConfig.team, "platform");
assert.equal(memberConfig.previewUrlTemplate, "https://preview-{pr}.example.com");
assert.deepEqual(memberConfig.requiredChecks, ["fleet-status", "preview", "qa", "review"]);
assert.equal(memberConfig.status?.requiresLatestReport, true);

const statusOut = path.join(repoDir, ".codex-stack", "fleet-status", "status.json");
const statusJson = run([path.join(repoDir, ".github", "codex-stack", "fleet-status.js"), "--out", statusOut, "--json"], fixtureRoot);
const statusReport = JSON.parse(statusJson) as {
  installed?: boolean;
  repo?: string;
  status?: string;
  riskScore?: number;
  latestReport?: { unresolvedRegressions?: number } | null;
};
assert.equal(statusReport.installed, true);
assert.equal(statusReport.repo, "acme/repo-a");
assert.equal(statusReport.status, "warning");
assert.ok(Number(statusReport.riskScore) > 0);
assert.equal(statusReport.latestReport?.unresolvedRegressions, 2);

fs.writeFileSync(statusOut, JSON.stringify({
  marker: "<!-- codex-stack:fleet-status -->",
  generatedAt: "2026-03-15T10:00:00.000Z",
  repo: "acme/repo-a",
  branch: "main",
  installed: true,
  controlRepo: "acme/control-plane",
  team: "platform",
  policyPack: "default",
  requiredChecks: ["fleet-status", "preview", "qa", "review"],
  status: "critical",
  riskScore: 91,
  latestReport: {
    generatedAt: "2026-03-15T10:00:00.000Z",
    status: "critical",
    unresolvedRegressions: 4,
    visualRiskScore: 83,
  },
}, null, 2));

const collectReport = JSON.parse(run([fleetScript, "collect", "--manifest", manifestPath, "--json"], fixtureRoot)) as {
  counts?: { repos?: number; critical?: number; drifted?: number };
  repos?: Array<{ repo?: string; source?: string; status?: string; riskScore?: number; repoUrl?: string }>;
};
assert.equal(collectReport.counts?.repos, 1);
assert.equal(collectReport.counts?.critical, 1);
assert.equal(collectReport.counts?.drifted, 0);
assert.equal(collectReport.repos?.[0]?.repo, "acme/repo-a");
assert.equal(collectReport.repos?.[0]?.source, "local-status");
assert.equal(collectReport.repos?.[0]?.status, "critical");
assert.equal(collectReport.repos?.[0]?.riskScore, 91);
assert.equal(collectReport.repos?.[0]?.repoUrl, "https://github.com/acme/repo-a");

const reviewOnlyFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-fleet-review-only-"));
const reviewOnlyControlDir = path.join(reviewOnlyFixtureRoot, "control");
const reviewOnlyRepoDir = path.join(reviewOnlyFixtureRoot, "repo-b");
const reviewOnlyManifestPath = path.join(reviewOnlyControlDir, "fleet.json");
const reviewOnlyPolicyDir = path.join(reviewOnlyControlDir, "policies");
fs.mkdirSync(reviewOnlyPolicyDir, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main", reviewOnlyRepoDir]);
fs.writeFileSync(path.join(reviewOnlyPolicyDir, "review-only.json"), JSON.stringify({
  name: "review-only",
  requiredChecks: ["review", "fleet-status"],
  qa: {
    mode: "diff-aware",
    devices: ["desktop"],
  },
  preview: {
    paths: [],
    devices: [],
  },
  status: {
    requiresLatestReport: false,
  },
}, null, 2));
fs.writeFileSync(reviewOnlyManifestPath, JSON.stringify({
  schemaVersion: 1,
  controlRepo: "acme/control-plane",
  policyDir: "./policies",
  repos: [
    {
      repo: "acme/repo-b",
      branch: "main",
      localPath: "../repo-b",
      team: "docs",
      policyPack: "review-only",
    },
  ],
}, null, 2));

run([fleetScript, "sync", "--manifest", reviewOnlyManifestPath, "--json"], reviewOnlyFixtureRoot);
const reviewOnlyStatusOut = path.join(reviewOnlyRepoDir, ".codex-stack", "fleet-status", "status.json");
const reviewOnlyStatusJson = run([path.join(reviewOnlyRepoDir, ".github", "codex-stack", "fleet-status.js"), "--out", reviewOnlyStatusOut, "--json"], reviewOnlyFixtureRoot);
const reviewOnlyStatus = JSON.parse(reviewOnlyStatusJson) as {
  status?: string;
  riskScore?: number;
  requiresLatestReport?: boolean;
  latestReport?: unknown;
};
assert.equal(reviewOnlyStatus.requiresLatestReport, false);
assert.equal(reviewOnlyStatus.status, "healthy");
assert.equal(reviewOnlyStatus.riskScore, 0);
assert.equal(reviewOnlyStatus.latestReport, null);

const reviewOnlyCollect = JSON.parse(run([fleetScript, "collect", "--manifest", reviewOnlyManifestPath, "--json"], reviewOnlyFixtureRoot)) as {
  counts?: { healthy?: number; warning?: number; drifted?: number };
  repos?: Array<{ repo?: string; status?: string; drift?: string; riskScore?: number }>;
};
assert.equal(reviewOnlyCollect.counts?.healthy, 1);
assert.equal(reviewOnlyCollect.counts?.warning, 0);
assert.equal(reviewOnlyCollect.counts?.drifted, 0);
assert.equal(reviewOnlyCollect.repos?.[0]?.repo, "acme/repo-b");
assert.equal(reviewOnlyCollect.repos?.[0]?.status, "healthy");
assert.equal(reviewOnlyCollect.repos?.[0]?.drift, "healthy");
assert.equal(reviewOnlyCollect.repos?.[0]?.riskScore, 0);

const reviewOnlyRemediation = JSON.parse(run([fleetScript, "remediate", "--manifest", reviewOnlyManifestPath, "--dry-run", "--json"], reviewOnlyFixtureRoot)) as {
  results?: Array<{ bucket?: string; action?: string }>;
};
assert.equal(reviewOnlyRemediation.results?.[0]?.bucket, "healthy");
assert.equal(reviewOnlyRemediation.results?.[0]?.action, "noop");

const remediationFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-fleet-remediation-"));
const remediationControlDir = path.join(remediationFixtureRoot, "control");
const remediationRepoDir = path.join(remediationFixtureRoot, "repo-c");
const remediationManifestPath = path.join(remediationControlDir, "fleet.json");
const remediationPolicyDir = path.join(remediationControlDir, "policies");
const remediationGhBinDir = path.join(remediationFixtureRoot, "bin");
const remediationDbPath = path.join(remediationFixtureRoot, "gh-db.json");
fs.mkdirSync(remediationPolicyDir, { recursive: true });
fs.mkdirSync(remediationGhBinDir, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main", remediationRepoDir]);
fs.writeFileSync(path.join(remediationPolicyDir, "default.json"), JSON.stringify({
  name: "default",
  requiredChecks: ["review", "fleet-status"],
  remediation: {
    autoOpenPrs: true,
    issueOnWarning: true,
    issueOnCritical: true,
    closeIssueWhenHealthy: true,
  },
  status: {
    requiresLatestReport: true,
  },
}, null, 2));
fs.writeFileSync(remediationManifestPath, JSON.stringify({
  schemaVersion: 1,
  controlRepo: "acme/control-plane",
  policyDir: "./policies",
  repos: [
    {
      repo: "acme/repo-c",
      branch: "main",
      localPath: "../repo-c",
      team: "platform",
      policyPack: "default",
    },
  ],
}, null, 2));
run([fleetScript, "sync", "--manifest", remediationManifestPath, "--json"], remediationFixtureRoot);
fs.mkdirSync(path.join(remediationRepoDir, ".codex-stack", "fleet-status"), { recursive: true });
fs.writeFileSync(path.join(remediationRepoDir, ".codex-stack", "fleet-status", "status.json"), JSON.stringify({
  marker: "<!-- codex-stack:fleet-status -->",
  generatedAt: "2026-03-16T00:00:00.000Z",
  repo: "acme/repo-c",
  branch: "main",
  installed: true,
  controlRepo: "acme/control-plane",
  team: "platform",
  policyPack: "default",
  requiredChecks: ["fleet-status", "review"],
  status: "warning",
  riskScore: 55,
  latestReport: {
    generatedAt: "2026-03-16T00:00:00.000Z",
    status: "warning",
    unresolvedRegressions: 2,
  },
}, null, 2));
fs.writeFileSync(remediationDbPath, JSON.stringify({
  nextIssueNumber: 1,
  issues: [],
  prs: [],
}, null, 2));
const remediationGhScript = `#!/usr/bin/env bun
import fs from "node:fs";

const dbPath = ${JSON.stringify(remediationDbPath)};
const args = process.argv.slice(2);

function loadDb() {
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || "") : "";
}

if (args[0] === "api" && args[1] === "user" && args[2] === "--jq" && args[3] === ".login") {
  process.stdout.write("acme\\n");
  process.exit(0);
}

if (args[0] === "label" && args[1] === "create") {
  process.exit(0);
}

if (args[0] === "pr" && args[1] === "list") {
  process.stdout.write("[]");
  process.exit(0);
}

if (args[0] === "issue" && args[1] === "list") {
  const db = loadDb();
  const state = argValue("--state").toUpperCase();
  const search = argValue("--search");
  const filtered = db.issues.filter((issue) => {
    const stateMatch = state === "ALL" ? true : issue.state === state;
    const searchMatch = !search || issue.title.includes(search) || String(issue.body || "").includes(search);
    return stateMatch && searchMatch;
  });
  process.stdout.write(JSON.stringify(filtered));
  process.exit(0);
}

if (args[0] === "issue" && args[1] === "create") {
  const db = loadDb();
  const repo = argValue("--repo");
  const title = argValue("--title");
  const body = argValue("--body");
  const issue = {
    number: db.nextIssueNumber++,
    url: "https://github.com/" + repo + "/issues/" + db.nextIssueNumber,
    updatedAt: new Date().toISOString(),
    title,
    body,
    state: "OPEN",
  };
  issue.url = "https://github.com/" + repo + "/issues/" + issue.number;
  db.issues.push(issue);
  saveDb(db);
  process.stdout.write(issue.url + "\\n");
  process.exit(0);
}

if (args[0] === "issue" && args[1] === "edit") {
  const db = loadDb();
  const issueNumber = Number(args[2]);
  const issue = db.issues.find((item) => item.number === issueNumber);
  if (!issue) process.exit(1);
  issue.title = argValue("--title") || issue.title;
  issue.body = argValue("--body") || issue.body;
  issue.updatedAt = new Date().toISOString();
  saveDb(db);
  process.exit(0);
}

if (args[0] === "issue" && args[1] === "close") {
  const db = loadDb();
  const issueNumber = Number(args[2]);
  const issue = db.issues.find((item) => item.number === issueNumber);
  if (!issue) process.exit(1);
  issue.state = "CLOSED";
  issue.updatedAt = new Date().toISOString();
  saveDb(db);
  process.exit(0);
}

process.stderr.write("Unsupported gh invocation: " + args.join(" ") + "\\n");
process.exit(1);
`;
const remediationGhPath = path.join(remediationGhBinDir, "gh");
fs.writeFileSync(remediationGhPath, remediationGhScript);
fs.chmodSync(remediationGhPath, 0o755);
const remediationEnv = {
  ...process.env,
  CODEX_STACK_TEST_GH_BIN: remediationGhPath,
};

const remediationOpen = JSON.parse(runWithEnv([fleetScript, "remediate", "--manifest", remediationManifestPath, "--issue-repo", "acme/control-plane", "--json"], remediationFixtureRoot, remediationEnv)) as {
  results?: Array<{ bucket?: string; action?: string; remediationIssueUrl?: string }>;
};
assert.equal(remediationOpen.results?.[0]?.bucket, "runtime-warning");
assert.equal(remediationOpen.results?.[0]?.action, "issue-opened");
assert.match(String(remediationOpen.results?.[0]?.remediationIssueUrl || ""), /issues\/1$/);

const remediationUpdate = JSON.parse(runWithEnv([fleetScript, "remediate", "--manifest", remediationManifestPath, "--issue-repo", "acme/control-plane", "--json"], remediationFixtureRoot, remediationEnv)) as {
  results?: Array<{ action?: string; remediationIssueUrl?: string }>;
};
assert.equal(remediationUpdate.results?.[0]?.action, "issue-updated");
assert.match(String(remediationUpdate.results?.[0]?.remediationIssueUrl || ""), /issues\/1$/);

fs.writeFileSync(path.join(remediationRepoDir, ".codex-stack", "fleet-status", "status.json"), JSON.stringify({
  marker: "<!-- codex-stack:fleet-status -->",
  generatedAt: "2026-03-16T01:00:00.000Z",
  repo: "acme/repo-c",
  branch: "main",
  installed: true,
  controlRepo: "acme/control-plane",
  team: "platform",
  policyPack: "default",
  requiredChecks: ["fleet-status", "review"],
  status: "healthy",
  riskScore: 0,
  latestReport: {
    generatedAt: "2026-03-16T01:00:00.000Z",
    status: "healthy",
    unresolvedRegressions: 0,
  },
}, null, 2));

const remediationClose = JSON.parse(runWithEnv([fleetScript, "remediate", "--manifest", remediationManifestPath, "--issue-repo", "acme/control-plane", "--json"], remediationFixtureRoot, remediationEnv)) as {
  results?: Array<{ bucket?: string; action?: string }>;
};
assert.equal(remediationClose.results?.[0]?.bucket, "healthy");
assert.equal(remediationClose.results?.[0]?.action, "issue-closed");

const workflowText = fs.readFileSync(path.join(rootDir, ".github", "workflows", "fleet-remediate.yml"), "utf8");
assert.match(workflowText, /fleet remediate/);
assert.match(workflowText, /fleet\.anup4khandelwal\.json/);

const driftedMemberPath = path.join(remediationRepoDir, ".codex-stack", "fleet-member.json");
const driftedMember = JSON.parse(fs.readFileSync(driftedMemberPath, "utf8"));
driftedMember.policyPack = "legacy";
fs.writeFileSync(driftedMemberPath, `${JSON.stringify(driftedMember, null, 2)}\n`);
const remediationPlan = JSON.parse(runWithEnv([fleetScript, "remediate", "--manifest", remediationManifestPath, "--dry-run", "--json"], remediationFixtureRoot, remediationEnv)) as {
  results?: Array<{ bucket?: string; action?: string; notes?: string[] }>;
};
assert.equal(remediationPlan.results?.[0]?.bucket, "config-drift");
assert.equal(remediationPlan.results?.[0]?.action, "planned");
assert.match(String(remediationPlan.results?.[0]?.notes?.[0] || ""), /Would open rollout PR/);

run([fleetScript, "dashboard", "--manifest", manifestPath, "--out", dashboardDir], fixtureRoot);
assert.ok(fs.existsSync(path.join(dashboardDir, "index.html")));
assert.ok(fs.existsSync(path.join(dashboardDir, "manifest.json")));
assert.ok(fs.existsSync(path.join(dashboardDir, "summary.md")));
assert.match(fs.readFileSync(path.join(dashboardDir, "index.html"), "utf8"), /codex-stack fleet dashboard/);
assert.match(fs.readFileSync(path.join(dashboardDir, "index.html"), "utf8"), /https:\/\/github.com\/acme\/repo-a/);
assert.match(fs.readFileSync(path.join(dashboardDir, "manifest.json"), "utf8"), /acme\/repo-a/);

const remoteFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-fleet-remote-"));
const ghBinDir = path.join(remoteFixtureRoot, "bin");
fs.mkdirSync(ghBinDir, { recursive: true });
const expectedMember = fs.readFileSync(path.join(repoDir, ".codex-stack", "fleet-member.json"), "utf8");
const expectedWorkflow = fs.readFileSync(path.join(repoDir, ".github", "workflows", "codex-stack-fleet-status.yml"), "utf8");
const expectedStatusScript = fs.readFileSync(path.join(repoDir, ".github", "codex-stack", "fleet-status.js"), "utf8");
const ghScript = `#!/usr/bin/env bun
const args = process.argv.slice(2);
const endpoint = args[args.length - 1] || "";
const member = ${JSON.stringify(expectedMember)};
const workflow = ${JSON.stringify(expectedWorkflow)};
const statusScript = ${JSON.stringify(expectedStatusScript)};

if (args[0] === "api") {
  if (endpoint.includes(".codex-stack/fleet-member.json")) {
    process.stdout.write(member);
    process.exit(0);
  }
  if (endpoint.includes(".github/codex-stack/fleet-status.js")) {
    process.stdout.write(statusScript);
    process.exit(0);
  }
  if (endpoint.includes(".github/workflows/codex-stack-fleet-status.yml")) {
    process.stdout.write(workflow);
    process.exit(0);
  }
}

process.stderr.write(\`Unsupported gh call: \${args.join(" ")}\\n\`);
process.exit(1);
`;
const ghPath = path.join(ghBinDir, "gh");
fs.writeFileSync(ghPath, ghScript);
fs.chmodSync(ghPath, 0o755);
const previousGhBin = process.env.CODEX_STACK_TEST_GH_BIN;
process.env.CODEX_STACK_TEST_GH_BIN = ghPath;
const remoteMember = __testing.readRemoteFile("acme/remote-repo", ".codex-stack/fleet-member.json", "main");
const remoteStatusScript = __testing.readRemoteFile("acme/remote-repo", ".github/codex-stack/fleet-status.js", "main");
const remoteWorkflow = __testing.readRemoteFile("acme/remote-repo", ".github/workflows/codex-stack-fleet-status.yml", "main");
if (previousGhBin === undefined) delete process.env.CODEX_STACK_TEST_GH_BIN;
else process.env.CODEX_STACK_TEST_GH_BIN = previousGhBin;
assert.equal(remoteMember, expectedMember);
assert.equal(remoteStatusScript, expectedStatusScript);
assert.equal(remoteWorkflow, expectedWorkflow);
const remoteDrift = __testing.detectDrift(
  {
    ".codex-stack/fleet-member.json": remoteMember,
    ".github/codex-stack/fleet-status.js": remoteStatusScript,
    ".github/workflows/codex-stack-fleet-status.yml": remoteWorkflow,
  },
  {
    memberConfigJson: expectedMember,
    statusScriptJs: expectedStatusScript,
    workflowYaml: expectedWorkflow,
  },
  JSON.parse(expectedMember) as unknown as Parameters<typeof __testing.detectDrift>[2],
);
assert.equal(remoteDrift.drift, "healthy");
assert.deepEqual(remoteDrift.files.filter((item) => item.changed), []);

fs.rmSync(fixtureRoot, { recursive: true, force: true });
fs.rmSync(reviewOnlyFixtureRoot, { recursive: true, force: true });
fs.rmSync(remediationFixtureRoot, { recursive: true, force: true });
fs.rmSync(remoteFixtureRoot, { recursive: true, force: true });
console.log("fleet spec passed");
