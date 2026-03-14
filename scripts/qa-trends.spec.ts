#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-qa-trends-"));
const qaDir = path.join(fixtureRoot, ".codex-stack", "qa");
const jsonOut = path.join(qaDir, "trends.json");
const markdownOut = path.join(qaDir, "trends.md");

function writeReport(name: string, payload: object): void {
  fs.mkdirSync(qaDir, { recursive: true });
  fs.writeFileSync(path.join(qaDir, `${name}.json`), JSON.stringify(payload, null, 2));
}

async function main(): Promise<void> {
  writeReport("20260314-1", {
    generatedAt: "2026-03-14T09:00:00.000Z",
    url: "https://example.com/one",
    status: "critical",
    healthScore: 40,
    findings: [
      { severity: "critical", category: "functional", title: "Login broken", detail: "Login fails." },
      { severity: "medium", category: "visual", title: "Header shifted", detail: "Header spacing regressed." },
    ],
  });
  writeReport("20260314-2", {
    generatedAt: "2026-03-14T10:00:00.000Z",
    url: "https://example.com/two",
    status: "warning",
    healthScore: 70,
    findings: [
      { severity: "medium", category: "visual", title: "Header shifted", detail: "Header spacing regressed." },
    ],
  });
  writeReport("20260314-3", {
    generatedAt: "2026-03-14T11:00:00.000Z",
    url: "https://example.com/three",
    status: "warning",
    healthScore: 60,
    findings: [
      { severity: "medium", category: "visual", title: "Header shifted", detail: "Header spacing regressed." },
      { severity: "high", category: "content", title: "Price copy stale", detail: "Pricing copy is outdated." },
    ],
  });

  const output = execFileSync(bun, [path.join(rootDir, "scripts", "qa-trends.ts"), "--dir", qaDir, "--json-out", jsonOut, "--markdown-out", markdownOut, "--json"], {
    cwd: fixtureRoot,
    encoding: "utf8",
  }).trim();
  const report = JSON.parse(output) as {
    totalRuns: number;
    deltaHealthScore: number;
    latest?: { status?: string; healthScore?: number };
    newFindings: Array<{ title?: string }>;
    fixedFindings: Array<{ title?: string }>;
    recurringFindings: Array<{ title?: string; occurrences?: number }>;
    recurringHotspots: Array<{ title?: string; occurrences?: number }>;
    currentStatusStreak?: { status?: string; length?: number };
  };

  assert.equal(report.totalRuns, 3);
  assert.equal(report.latest?.status, "warning");
  assert.equal(report.latest?.healthScore, 60);
  assert.equal(report.deltaHealthScore, -10);
  assert.ok(report.newFindings.some((item) => item.title === "Price copy stale"));
  assert.ok(report.fixedFindings.length === 0);
  assert.ok(report.recurringFindings.some((item) => item.title === "Header shifted" && item.occurrences === 3));
  assert.ok(report.recurringHotspots.some((item) => item.title === "Header shifted" && item.occurrences === 3));
  assert.equal(report.currentStatusStreak?.status, "warning");
  assert.equal(report.currentStatusStreak?.length, 2);
  assert.ok(fs.existsSync(jsonOut));
  assert.ok(fs.existsSync(markdownOut));
  assert.ok(fs.readFileSync(markdownOut, "utf8").includes("Price copy stale"));

  console.log("qa-trends spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
