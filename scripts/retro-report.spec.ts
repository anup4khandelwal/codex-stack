#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-retro-"));

async function main(): Promise<void> {
  const repoDir = path.join(fixtureRoot, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: repoDir, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "spec@example.com"], { cwd: repoDir, encoding: "utf8" });
  execFileSync("git", ["config", "user.name", "Spec User"], { cwd: repoDir, encoding: "utf8" });
  fs.writeFileSync(path.join(repoDir, "README.md"), "# demo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repoDir, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "feat: add demo"], { cwd: repoDir, encoding: "utf8" });

  const visualDir = path.join(repoDir, "docs", "qa", "sample", "visual");
  fs.mkdirSync(visualDir, { recursive: true });
  fs.writeFileSync(path.join(visualDir, "manifest.json"), JSON.stringify({
    snapshots: [
      {
        name: "dashboard",
        status: "changed",
        targetPath: "/dashboard",
        device: "desktop",
        imageDiffScore: 71.4,
        imageDiffRatio: 0.286,
      },
      {
        name: "login",
        status: "changed",
        targetPath: "/login",
        device: "mobile",
        imageDiffScore: 83.2,
        imageDiffRatio: 0.168,
      },
    ],
  }, null, 2));

  const markdown = execFileSync(
    bun,
    [path.join(rootDir, "scripts", "retro-report.ts"), "--since", "30 days ago", "--no-github"],
    {
      cwd: repoDir,
      encoding: "utf8",
    },
  );

  const rawJson = execFileSync(
    bun,
    [path.join(rootDir, "scripts", "retro-report.ts"), "--since", "30 days ago", "--no-github", "--json"],
    {
      cwd: repoDir,
      encoding: "utf8",
    },
  );

  const summary = JSON.parse(rawJson) as {
    visual?: {
      available?: boolean;
      snapshotCount?: number;
      failingSnapshotCount?: number;
      avgImageDiffScore?: number;
      topRegressions?: Array<{ name?: string; score?: number }>;
    };
    recommendation?: string;
  };

  assert.equal(summary.visual?.available, true);
  assert.equal(summary.visual?.snapshotCount, 2);
  assert.equal(summary.visual?.failingSnapshotCount, 2);
  assert.equal(summary.visual?.avgImageDiffScore, 77.3);
  assert.equal(summary.visual?.topRegressions?.[0]?.name, "dashboard");
  assert.match(String(summary.recommendation), /Visual QA surfaced|Delivery looked steady|Low visible throughput/);
  assert.match(markdown, /## Visual QA evidence/);
  assert.match(markdown, /dashboard @ \/dashboard/);
  assert.match(markdown, /Avg image diff score: 77\.3/);

  console.log("retro-report spec passed");
}

try {
  await main();
} finally {
  process.chdir(rootDir);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
