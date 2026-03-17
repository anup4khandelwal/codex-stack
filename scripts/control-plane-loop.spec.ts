#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-loop-"));
const statePath = path.join(tmpRoot, "state.json");
const rootDir = process.cwd();

function run(args: string[]): string {
  const result = spawnSync(process.execPath || "bun", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || `Expected success for ${args.join(" ")}`);
  return String(result.stdout || "").trim();
}

function addActionArg(target: string[], ...values: string[]): string[] {
  for (const value of values) {
    target.push("--action-arg", value);
  }
  return target;
}

function addDelegateActionArg(target: string[], ...values: string[]): string[] {
  for (const value of values) {
    target.push("--delegate-action-arg", value);
  }
  return target;
}

run(["src/cli.ts", "agents", "add", "--name", "lead-1", "--runtime", "codex", "--role", "manager", "--workspace", rootDir, "--team", "platform", "--status", "working", "--state", statePath, "--json"]);
run(["src/cli.ts", "agents", "add", "--name", "worker-1", "--runtime", "codex", "--role", "reviewer", "--workspace", rootDir, "--team", "platform", "--manager", "lead-1", "--status", "working", "--state", statePath, "--json"]);
run(["src/cli.ts", "agents", "add", "--name", "ship-1", "--runtime", "codex", "--role", "shipper", "--workspace", rootDir, "--team", "release", "--status", "working", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "add", "--id", "release-q4", "--title", "Release Q4", "--type", "initiative", "--owner", "lead-1", "--status", "active", "--state", statePath, "--json"]);

run([
  "src/cli.ts", "goals", "task", "add",
  "--id", "upgrade-offline",
  "--goal", "release-q4",
  "--title", "Run upgrade audit",
  "--assignee", "worker-1",
  "--action-kind", "upgrade",
  "--action-arg", "--offline",
  "--expected-minutes", "1",
  "--expected-cost-units", "1",
  "--state", statePath,
  "--json",
]);
run([
  "src/cli.ts", "heartbeat", "schedule", "add",
  "--agent", "worker-1",
  "--task", "upgrade-offline",
  "--trigger", "cron",
  "--expression", "*/15 * * * *",
  "--summary", "Run upgrade audit",
  "--state", statePath,
  "--json",
]);
const dueResult = JSON.parse(run([
  "src/cli.ts", "heartbeat", "run-due",
  "--state", statePath,
  "--max-agents", "1",
  "--max-tasks", "1",
  "--json",
])) as {
  results: Array<{
    taskId: string;
    actionKind: string;
    execution: { status: string };
    heartbeat: { status: string } | null;
    taskStatusAfter: string;
  }>;
};
assert.equal(dueResult.results.length, 1);
assert.equal(dueResult.results[0].taskId, "upgrade-offline");
assert.equal(dueResult.results[0].actionKind, "upgrade");
assert.notEqual(dueResult.results[0].execution.status, "error");
assert.ok(dueResult.results[0].heartbeat);
assert.equal(dueResult.results[0].taskStatusAfter, "done");

const parentArgs = [
  "src/cli.ts", "goals", "task", "add",
  "--id", "lead-release",
  "--goal", "release-q4",
  "--title", "Coordinate release",
  "--assignee", "lead-1",
  "--action-kind", "custom-command",
  "--expected-minutes", "1",
  "--expected-cost-units", "1",
  "--delegate-id", "worker-followup",
  "--delegate-title", "Run delegated follow-up",
  "--delegate-assignee", "worker-1",
  "--delegate-summary", "Delegated from lead",
  "--delegate-action-kind", "custom-command",
  "--delegate-expected-minutes", "1",
  "--delegate-expected-cost-units", "1",
  "--state", statePath,
  "--json",
];
addActionArg(parentArgs, "node", "-e", "console.log(JSON.stringify({summary:'lead ok',nextAction:'complete'}))");
addDelegateActionArg(parentArgs, "node", "-e", "console.log(JSON.stringify({summary:'child ok',nextAction:'hand back'}))");
run(parentArgs);

const delegateFirst = JSON.parse(run(["src/cli.ts", "heartbeat", "run-agent", "--agent", "lead-1", "--state", statePath, "--json"])) as {
  result: { execution: { status: string; createdTaskIds: string[] }; taskStatusAfter: string };
};
assert.equal(delegateFirst.result.execution.status, "success");
assert.deepEqual(delegateFirst.result.execution.createdTaskIds, ["worker-followup"]);
assert.equal(delegateFirst.result.taskStatusAfter, "blocked");

const childRun = JSON.parse(run(["src/cli.ts", "heartbeat", "run-agent", "--agent", "worker-1", "--state", statePath, "--json"])) as {
  result: { taskId: string; execution: { status: string }; taskStatusAfter: string };
};
assert.equal(childRun.result.taskId, "worker-followup");
assert.equal(childRun.result.execution.status, "success");
assert.equal(childRun.result.taskStatusAfter, "done");

const parentResume = JSON.parse(run(["src/cli.ts", "heartbeat", "run-agent", "--agent", "lead-1", "--state", statePath, "--json"])) as {
  result: { taskId: string; execution: { status: string }; taskStatusAfter: string };
};
assert.equal(parentResume.result.taskId, "lead-release");
assert.equal(parentResume.result.execution.status, "success");
assert.equal(parentResume.result.taskStatusAfter, "done");

run([
  "src/cli.ts", "goals", "task", "add",
  "--id", "ship-gated",
  "--goal", "release-q4",
  "--title", "Ship gated change",
  "--assignee", "ship-1",
  "--action-kind", "custom-command",
  "--action-arg", "node",
  "--action-arg", "-e",
  "--action-arg", "console.log(JSON.stringify({summary:'ship ok',nextAction:'merge'}))",
  "--require-approval", "ship-pr",
  "--approval-target", "ship-gated",
  "--expected-minutes", "1",
  "--expected-cost-units", "1",
  "--state", statePath,
  "--json",
]);
const approvalBlocked = JSON.parse(run(["src/cli.ts", "heartbeat", "run-agent", "--agent", "ship-1", "--state", statePath, "--json"])) as {
  result: { execution: { status: string; approvalId: string }; taskStatusAfter: string };
};
assert.equal(approvalBlocked.result.execution.status, "blocked");
assert.equal(approvalBlocked.result.taskStatusAfter, "blocked");
assert.ok(approvalBlocked.result.execution.approvalId);
run(["src/cli.ts", "approvals", "approve", approvalBlocked.result.execution.approvalId, "--by", "lead-1", "--note", "Ship approved", "--state", statePath, "--json"]);
const approvalAllowed = JSON.parse(run(["src/cli.ts", "heartbeat", "run-agent", "--agent", "ship-1", "--state", statePath, "--json"])) as {
  result: { execution: { status: string }; taskStatusAfter: string };
};
assert.equal(approvalAllowed.result.execution.status, "success");
assert.equal(approvalAllowed.result.taskStatusAfter, "done");

run(["src/cli.ts", "agents", "budget", "set", "--agent", "ship-1", "--window", "daily", "--max-cost-units", "1", "--state", statePath, "--json"]);
run([
  "src/cli.ts", "goals", "task", "add",
  "--id", "budget-gated",
  "--goal", "release-q4",
  "--title", "Budget gated task",
  "--assignee", "ship-1",
  "--action-kind", "custom-command",
  "--action-arg", "node",
  "--action-arg", "-e",
  "--action-arg", "console.log(JSON.stringify({summary:'budget ok',nextAction:'done'}))",
  "--expected-minutes", "1",
  "--expected-cost-units", "2",
  "--state", statePath,
  "--json",
]);
const budgetBlocked = JSON.parse(run(["src/cli.ts", "heartbeat", "run-agent", "--agent", "ship-1", "--state", statePath, "--json"])) as {
  result: { execution: { status: string; approvalId: string; budgetExceeded: boolean }; taskStatusAfter: string };
};
assert.equal(budgetBlocked.result.execution.status, "blocked");
assert.equal(budgetBlocked.result.execution.budgetExceeded, true);
assert.ok(budgetBlocked.result.execution.approvalId);
run(["src/cli.ts", "approvals", "approve", budgetBlocked.result.execution.approvalId, "--by", "lead-1", "--note", "Budget override approved", "--state", statePath, "--json"]);
const budgetAllowed = JSON.parse(run(["src/cli.ts", "heartbeat", "run-agent", "--agent", "ship-1", "--state", statePath, "--json"])) as {
  result: { execution: { status: string }; taskStatusAfter: string };
};
assert.equal(budgetAllowed.result.execution.status, "success");
assert.equal(budgetAllowed.result.taskStatusAfter, "done");

const inspectPayload = JSON.parse(run(["src/cli.ts", "heartbeat", "inspect", "--agent", "ship-1", "--state", statePath, "--json"])) as {
  executions: Array<unknown>;
  approvals: Array<unknown>;
};
assert.ok(inspectPayload.executions.length >= 2);
assert.equal(inspectPayload.approvals.length, 0);

console.log("control-plane loop spec passed");
