#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-weekly-digest-"));

const scriptsDir = path.join(fixtureRoot, "scripts");
const markdownOut = path.join(fixtureRoot, "digest.md");
const jsonOut = path.join(fixtureRoot, "digest.json");
const publishDir = path.join(fixtureRoot, "publish");

async function main(): Promise<void> {
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, "retro-report.ts"),
    `#!/usr/bin/env bun
console.log(JSON.stringify({
  since: "3 days ago",
  commitCount: 12,
  mergeCommits: 4,
  authorCount: 3,
  topAreas: [{ name: "src", count: 6 }, { name: "docs", count: 2 }],
  topAuthors: [{ name: "anup", count: 7 }, { name: "codex", count: 5 }],
  recentSubjects: [{ subject: "feat: improve preview flow" }, { subject: "fix: tighten issue-flow quoting" }],
  recommendation: "Keep shipping. Review latency is under control.",
  visual: {
    available: true,
    manifestCount: 2,
    snapshotCount: 3,
    failingSnapshotCount: 2,
    avgImageDiffScore: 81.4,
    avgImageDiffRatio: 0.186,
    topRegressions: [
      { name: "dashboard", status: "changed", targetPath: "/dashboard", device: "desktop", score: 71.4, diffRatio: 0.286 },
      { name: "login", status: "changed", targetPath: "/login", device: "mobile", score: 83.2, diffRatio: 0.168 }
    ]
  },
  github: {
    enabled: true,
    reason: "",
    repo: "anup4khandelwal/codex-stack",
    source: "graphql",
    scannedCount: 5,
    avgTimeToMergeHours: 6.5,
    avgFirstReviewLatencyHours: 1.7,
    pendingReviewCount: 1,
    avgReviewsPerPr: 2.4,
    topReviewers: [{ name: "octocat", count: 3 }, { name: "hubot", count: 2 }]
  }
}, null, 2));
`,
  );

  const markdown = execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "weekly-digest.ts"),
      "--since",
      "3 days ago",
      "--out",
      markdownOut,
      "--json-out",
      jsonOut,
      "--publish-dir",
      publishDir,
    ],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );

  assert.match(markdown, /Weekly Digest/);
  assert.match(markdown, /Repo: anup4khandelwal\/codex-stack/);
  assert.match(markdown, /Recommendation: Keep shipping/);
  assert.match(markdown, /## Visual QA/);
  assert.match(markdown, /Avg image diff score: 81\.4/);

  const report = JSON.parse(fs.readFileSync(jsonOut, "utf8")) as {
    repo?: string;
    retro?: { commitCount?: number; recommendation?: string; visual?: { snapshotCount?: number } };
    publish?: { enabled?: boolean; targets?: Record<string, string> };
  };
  assert.equal(report.repo, "anup4khandelwal/codex-stack");
  assert.equal(report.retro?.commitCount, 12);
  assert.equal(report.retro?.recommendation, "Keep shipping. Review latency is under control.");
  assert.equal(report.retro?.visual?.snapshotCount, 3);
  assert.equal(report.publish?.enabled, true);
  assert.ok(String(report.publish?.targets?.summary).endsWith(path.join("publish", "summary.txt")));
  assert.ok(String(report.publish?.targets?.slackJson).endsWith(path.join("publish", "slack.json")));

  const summary = fs.readFileSync(path.join(publishDir, "summary.txt"), "utf8");
  const slackJson = JSON.parse(fs.readFileSync(path.join(publishDir, "slack.json"), "utf8")) as {
    text?: string;
    blocks?: Array<{ type?: string }>;
  };
  const email = fs.readFileSync(path.join(publishDir, "email.md"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(publishDir, "manifest.json"), "utf8")) as {
    repo?: string;
    outputs?: Record<string, string>;
  };

  assert.match(summary, /Weekly digest for anup4khandelwal\/codex-stack/);
  assert.match(summary, /PR health: 5 PRs scanned/);
  assert.match(summary, /Visual QA: 2 regressions across 3 scored snapshots, avg score 81\.4\./);
  assert.match(String(slackJson.text), /Weekly digest for anup4khandelwal\/codex-stack/);
  assert.equal(slackJson.blocks?.[0]?.type, "header");
  assert.equal(slackJson.blocks?.[4]?.type, "section");
  assert.match(email, /Weekly Engineering Digest/);
  assert.match(email, /## Visual QA/);
  assert.equal(manifest.repo, "anup4khandelwal/codex-stack");
  assert.ok(String(manifest.outputs?.markdown).endsWith("digest.md"));
  assert.ok(String(manifest.outputs?.manifest).endsWith(path.join("publish", "manifest.json")));

  const noPublishJsonOut = path.join(fixtureRoot, "digest-no-publish.json");
  execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "weekly-digest.ts"),
      "--json-out",
      noPublishJsonOut,
      "--no-publish",
    ],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );

  const noPublishReport = JSON.parse(fs.readFileSync(noPublishJsonOut, "utf8")) as {
    publish?: { enabled?: boolean };
  };
  assert.equal(noPublishReport.publish?.enabled, false);

  console.log("weekly-digest spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
