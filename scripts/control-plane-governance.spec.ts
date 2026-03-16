#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-governance-"));
const statePath = path.join(tmpRoot, "state.json");
const dashboardDir = path.join(tmpRoot, "dashboard");

function run(args: string[]): string {
  const result = spawnSync(process.execPath || "bun", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || `Expected success for ${args.join(" ")}`);
  return String(result.stdout || "").trim();
}

run(["src/cli.ts", "agents", "add", "--name", "lead-1", "--runtime", "codex", "--role", "manager", "--team", "platform", "--status", "working", "--state", statePath, "--json"]);
run(["src/cli.ts", "agents", "add", "--name", "ship-1", "--runtime", "codex", "--role", "shipper", "--team", "platform", "--manager", "lead-1", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "add", "--id", "release-q3", "--title", "Release Q3", "--type", "initiative", "--owner", "lead-1", "--status", "active", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "add", "--id", "ship-pr", "--goal", "release-q3", "--title", "Open release PR", "--assignee", "ship-1", "--status", "queued", "--state", statePath, "--json"]);
run(["src/cli.ts", "agents", "budget", "set", "--agent", "ship-1", "--window", "daily", "--max-runs", "1", "--max-minutes", "10", "--max-cost-units", "3", "--state", statePath, "--json"]);
const scheduleAdd = JSON.parse(run([
  "src/cli.ts", "heartbeat", "schedule", "add",
  "--agent", "ship-1",
  "--task", "ship-pr",
  "--trigger", "cron",
  "--expression", "*/15 * * * *",
  "--summary", "Check release branch",
  "--retry-limit", "2",
  "--cooldown-minutes", "30",
  "--state", statePath,
  "--json",
])) as { schedule: { id: string } };
const scheduleId = scheduleAdd.schedule.id;

const blockedBeat = JSON.parse(run([
  "src/cli.ts", "heartbeat", "beat",
  "--schedule", scheduleId,
  "--task", "ship-pr",
  "--trigger", "manual",
  "--summary", "Ready to open PR",
  "--next-action", "Open PR after approval",
  "--branch", "feat/release-q3",
  "--duration-minutes", "4",
  "--cost-units", "2",
  "--require-approval", "ship-pr",
  "--approval-target", "ship-pr",
  "--requested-by", "ship-1",
  "--state", statePath,
  "--json",
])) as { blocked: boolean; heartbeat: { status: string }; approvals: Array<{ id: string; kind: string; status: string }>; session: { nextAction: string }; schedule: { failureCount: number; active: boolean; nextRunAfter: string } };
assert.equal(blockedBeat.blocked, true);
assert.equal(blockedBeat.heartbeat.status, "blocked");
assert.equal(blockedBeat.approvals[0]?.kind, "ship-pr");
assert.equal(blockedBeat.session.nextAction, "Open PR after approval");
assert.equal(blockedBeat.schedule.failureCount, 1);
assert.equal(blockedBeat.schedule.active, true);
assert.ok(blockedBeat.schedule.nextRunAfter);

const dueWhileCooling = JSON.parse(run(["src/cli.ts", "heartbeat", "due", "--agent", "ship-1", "--state", statePath, "--json"])) as Array<{ id: string }>;
assert.equal(dueWhileCooling.length, 0);

const gatePending = JSON.parse(run(["src/cli.ts", "approvals", "gate", "--agent", "ship-1", "--kind", "ship-pr", "--target", "ship-pr", "--state", statePath, "--json"])) as { allowed: boolean; pending: { id: string } | null };
assert.equal(gatePending.allowed, false);
assert.ok(gatePending.pending?.id);

run(["src/cli.ts", "approvals", "approve", gatePending.pending!.id, "--by", "lead-1", "--note", "Approved release PR", "--state", statePath, "--json"]);

const allowedBeat = JSON.parse(run([
  "src/cli.ts", "heartbeat", "beat",
  "--schedule", scheduleId,
  "--task", "ship-pr",
  "--trigger", "event",
  "--status", "ok",
  "--summary", "Approval received",
  "--next-action", "Open PR now",
  "--output", "Prepared reviewers and labels",
  "--branch", "feat/release-q3",
  "--pr-url", "https://github.com/anup4khandelwal/codex-stack/pull/999",
  "--duration-minutes", "4",
  "--cost-units", "2",
  "--state", statePath,
  "--json",
])) as { blocked: boolean; heartbeat: { status: string }; budget: { usage: { runs: number; exceeded: boolean } | null }; schedule: { failureCount: number; active: boolean } };
assert.equal(allowedBeat.blocked, true);
assert.equal(allowedBeat.heartbeat.status, "blocked");
assert.equal(allowedBeat.budget.usage?.runs, 2);
assert.equal(allowedBeat.budget.usage?.exceeded, true);
assert.equal(allowedBeat.schedule.failureCount, 2);
assert.equal(allowedBeat.schedule.active, false);

const budgetApprovals = JSON.parse(run(["src/cli.ts", "approvals", "list", "--agent", "ship-1", "--kind", "budget-override", "--status", "pending", "--state", statePath, "--json"])) as Array<{ id: string; kind: string }>;
assert.equal(budgetApprovals.length, 1);

run(["src/cli.ts", "approvals", "approve", budgetApprovals[0].id, "--by", "lead-1", "--note", "Budget override approved", "--state", statePath, "--json"]);
run(["src/cli.ts", "heartbeat", "schedule", "resume", scheduleId, "--state", statePath, "--json"]);

const overrideBeat = JSON.parse(run([
  "src/cli.ts", "heartbeat", "beat",
  "--schedule", scheduleId,
  "--task", "ship-pr",
  "--trigger", "manual",
  "--status", "warning",
  "--summary", "Post-merge follow-up",
  "--next-action", "Monitor deploy",
  "--duration-minutes", "3",
  "--cost-units", "1",
  "--state", statePath,
  "--json",
])) as { blocked: boolean; heartbeat: { status: string }; schedule: { failureCount: number; active: boolean; nextRunAfter: string } };
assert.equal(overrideBeat.blocked, false);
assert.equal(overrideBeat.heartbeat.status, "warning");
assert.equal(overrideBeat.schedule.failureCount, 0);
assert.equal(overrideBeat.schedule.active, true);
assert.equal(overrideBeat.schedule.nextRunAfter, "");

const agentShow = JSON.parse(run(["src/cli.ts", "agents", "show", "ship-1", "--state", statePath, "--json"])) as { session: { nextAction: string; prUrl: string }; budget: { usage: { costUnits: number } } };
assert.equal(agentShow.session.nextAction, "Monitor deploy");
assert.equal(agentShow.session.prUrl, "");
assert.equal(agentShow.budget.usage.costUnits, 5);

const heartbeatShow = JSON.parse(run(["src/cli.ts", "heartbeat", "show", "ship-1", "--state", statePath, "--json"])) as { schedules: Array<{ id: string }>; heartbeats: Array<{ status: string }>; approvals: Array<unknown> };
assert.equal(heartbeatShow.schedules.length, 1);
assert.equal(heartbeatShow.heartbeats.length, 3);
assert.equal(heartbeatShow.approvals.length, 0);

const dashboard = JSON.parse(run(["src/cli.ts", "heartbeat", "dashboard", "--out", dashboardDir, "--state", statePath, "--json"])) as { report: { counts: { schedules: number; coolingSchedules: number; exhaustedSchedules: number; recentHeartbeats: number; pendingApprovals: number; exceededBudgets: number } }; htmlPath: string };
assert.equal(dashboard.report.counts.schedules, 1);
assert.equal(dashboard.report.counts.coolingSchedules, 0);
assert.equal(dashboard.report.counts.exhaustedSchedules, 0);
assert.equal(dashboard.report.counts.recentHeartbeats, 3);
assert.equal(dashboard.report.counts.pendingApprovals, 0);
assert.equal(dashboard.report.counts.exceededBudgets, 1);
assert.ok(fs.existsSync(dashboard.htmlPath));
assert.match(fs.readFileSync(dashboard.htmlPath, "utf8"), /pending approvals/i);
assert.match(fs.readFileSync(dashboard.htmlPath, "utf8"), /ship-1/);

console.log("control-plane governance spec passed");
