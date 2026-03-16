#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-control-plane-"));
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
run(["src/cli.ts", "agents", "add", "--name", "reviewer-1", "--runtime", "claude-code", "--role", "reviewer", "--team", "platform", "--manager", "lead-1", "--state", statePath, "--json"]);
run(["src/cli.ts", "agents", "update", "reviewer-1", "--status", "assigned", "--owner", "anup", "--state", statePath, "--json"]);

const agentList = JSON.parse(run(["src/cli.ts", "agents", "list", "--state", statePath, "--json"])) as Array<{ name: string; manager: string; status: string }>;
assert.equal(agentList.length, 2);
assert.equal(agentList.find((item) => item.name === "reviewer-1")?.manager, "lead-1");
assert.equal(agentList.find((item) => item.name === "reviewer-1")?.status, "assigned");

run(["src/cli.ts", "goals", "add", "--id", "release-q2", "--title", "Release Q2 hardening", "--type", "initiative", "--owner", "lead-1", "--status", "active", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "add", "--id", "repo-codex-stack", "--title", "Codex-stack repo goal", "--type", "repo", "--owner", "reviewer-1", "--parent", "release-q2", "--status", "active", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "add", "--id", "task-review", "--goal", "repo-codex-stack", "--title", "Review agent contracts", "--assignee", "reviewer-1", "--status", "queued", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "claim", "task-review", "--assignee", "reviewer-1", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "block", "task-review", "--reason", "Waiting for QA schema", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "unblock", "task-review", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "reassign", "task-review", "--assignee", "lead-1", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "complete", "task-review", "--state", statePath, "--json"]);
run(["src/cli.ts", "goals", "task", "add", "--id", "task-qa", "--goal", "repo-codex-stack", "--title", "Queue QA run", "--assignee", "reviewer-1", "--status", "queued", "--state", statePath, "--json"]);

const queue = JSON.parse(run(["src/cli.ts", "goals", "queue", "--assignee", "reviewer-1", "--state", statePath, "--json"])) as Array<{ id: string; status: string }>;
assert.deepEqual(queue.map((task) => task.id), ["task-qa"]);
assert.equal(queue[0]?.status, "queued");

const goalShow = JSON.parse(run(["src/cli.ts", "goals", "show", "repo-codex-stack", "--state", statePath, "--json"])) as { childGoals: Array<{ id: string }>; tasks: Array<{ id: string }> };
assert.equal(goalShow.tasks.length, 2);

const dashboard = JSON.parse(run(["src/cli.ts", "agents", "dashboard", "--out", dashboardDir, "--state", statePath, "--json"])) as { htmlPath: string; jsonPath: string; markdownPath: string; report: { counts: { agents: number; queuedTasks: number; doneTasks: number } } };
assert.equal(dashboard.report.counts.agents, 2);
assert.equal(dashboard.report.counts.queuedTasks, 1);
assert.equal(dashboard.report.counts.doneTasks, 1);
assert.ok(fs.existsSync(dashboard.htmlPath));
assert.ok(fs.existsSync(dashboard.jsonPath));
assert.ok(fs.existsSync(dashboard.markdownPath));
assert.match(fs.readFileSync(dashboard.htmlPath, "utf8"), /control plane/i);
assert.match(fs.readFileSync(dashboard.htmlPath, "utf8"), /reviewer-1/);

run(["src/cli.ts", "goals", "task", "add", "--id", "task-release", "--goal", "repo-codex-stack", "--title", "Coordinate release", "--assignee", "lead-1", "--status", "claimed", "--state", statePath, "--json"]);
const delegated = JSON.parse(run([
  "src/cli.ts", "goals", "task", "delegate", "task-release",
  "--id", "task-release-qa",
  "--title", "Run delegated QA",
  "--assignee", "reviewer-1",
  "--summary", "Delegate QA follow-up",
  "--state", statePath,
  "--json",
])) as {
  parent: { id: string; status: string; blockedReason: string; blockedBy: string[] };
  child: { id: string; parentTaskId: string; delegatedBy: string };
};
assert.equal(delegated.parent.id, "task-release");
assert.equal(delegated.parent.status, "blocked");
assert.match(delegated.parent.blockedReason, /delegated task task-release-qa/i);
assert.deepEqual(delegated.parent.blockedBy, ["task-release-qa"]);
assert.equal(delegated.child.parentTaskId, "task-release");
assert.equal(delegated.child.delegatedBy, "lead-1");

run(["src/cli.ts", "goals", "task", "complete", "task-release-qa", "--state", statePath, "--json"]);
const delegatedTasks = JSON.parse(run(["src/cli.ts", "goals", "task", "list", "--goal", "repo-codex-stack", "--state", statePath, "--json"])) as Array<{ id: string; status: string; parentTaskId: string; blockedReason: string }>;
const parentTask = delegatedTasks.find((task) => task.id === "task-release");
assert.equal(parentTask?.status, "claimed");
assert.equal(parentTask?.blockedReason, "");
assert.equal(parentTask?.parentTaskId, "");

console.log("control-plane spec passed");
