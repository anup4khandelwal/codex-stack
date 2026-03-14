#!/usr/bin/env bun
import assert from "node:assert/strict";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";

const jsonOutput = execFileSync(bun, ["scripts/upgrade-check.ts", "--offline", "--json"], {
  cwd: rootDir,
  encoding: "utf8",
});

const report = JSON.parse(jsonOutput) as {
  marker?: string;
  offline?: boolean;
  overallStatus?: string;
  checks?: {
    runtime?: unknown[];
    dependencies?: Array<{ status?: string }>;
    workflows?: Array<{ status?: string }>;
    installHealth?: unknown[];
  };
};

assert.equal(report.marker, "<!-- codex-stack:daily-update-check -->");
assert.equal(report.offline, true);
assert.ok(["ok", "warning", "error", "skipped"].includes(String(report.overallStatus)));
assert.ok(Array.isArray(report.checks?.runtime));
assert.ok(Array.isArray(report.checks?.installHealth));
assert.ok(report.checks?.dependencies?.some((item) => item.status === "skipped"));
assert.ok(report.checks?.workflows?.some((item) => item.status === "skipped"));

const markdownOutput = execFileSync(bun, ["scripts/upgrade-check.ts", "--offline"], {
  cwd: rootDir,
  encoding: "utf8",
});

assert.match(markdownOutput, /codex-stack daily update check/);
assert.match(markdownOutput, /Recommended actions/);

console.log("upgrade-check spec passed");
