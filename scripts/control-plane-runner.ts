#!/usr/bin/env bun
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyHeartbeatScheduleResult,
  computeBudgetUsage,
  delegateTask,
  ensureApprovalGate,
  findAgent,
  findApprovedApproval,
  findBudgetPolicy,
  findPendingApproval,
  findSchedule,
  findSession,
  findTask,
  listDueSchedules,
  listQueue,
  normalizeHeartbeatStatus,
  normalizeTaskActionKind,
  normalizeTaskExecutionStatus,
  projectedBudgetUsage,
  recordExecution,
  recordHeartbeat,
  syncDelegatedParent,
  upsertSession,
  type ApprovalRecord,
  type ApprovalKind,
  type BudgetUsage,
  type ControlPlaneState,
  type HeartbeatRecord,
  type HeartbeatScheduleRecord,
  type HeartbeatStatus,
  type HeartbeatTrigger,
  type TaskActionKind,
  type TaskExecutionRecord,
  type TaskExecutionStatus,
  type TaskFailureClass,
  type TaskRecord,
} from "./control-plane.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BUN = process.execPath || "bun";

export interface LoopRunOptions {
  agent?: string;
  maxAgents?: number;
  maxTasks?: number;
}

export interface ExecutionSummary {
  agent: string;
  scheduleId: string;
  taskId: string;
  actionKind: TaskActionKind | "";
  skipped: boolean;
  reason: string;
  heartbeat: HeartbeatRecord | null;
  execution: TaskExecutionRecord;
  approvals: ApprovalRecord[];
  budgetUsage: BudgetUsage | null;
  delegatedTaskIds: string[];
  taskStatusBefore: string;
  taskStatusAfter: string;
}

export interface RunAgentResult extends ExecutionSummary {
  schedule: HeartbeatScheduleRecord | null;
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseDate(value: string): Date | null {
  const normalized = clean(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function taskPriority(task: TaskRecord): number {
  if (task.status === "working") return 0;
  if (task.status === "claimed") return 1;
  if (task.status === "queued") return 2;
  if (task.status === "blocked") return 3;
  return 4;
}

function hasPendingDependencies(state: ControlPlaneState, task: TaskRecord): boolean {
  return task.blockedBy.some((dependency) => {
    const blocker = findTask(state, dependency);
    return blocker && blocker.status !== "done";
  });
}

function taskReadyAfter(task: TaskRecord): boolean {
  const nextRunAt = parseDate(task.nextRunAfter);
  return !nextRunAt || nextRunAt.getTime() <= Date.now();
}

function maybeResumeTask(state: ControlPlaneState, task: TaskRecord): void {
  if (task.parentTaskId) syncDelegatedParent(state, task.parentTaskId);
  if (task.status !== "blocked") return;
  if (task.stuck) return;
  if (hasPendingDependencies(state, task)) return;
  if (!taskReadyAfter(task)) return;
  task.status = task.assignee ? "claimed" : "queued";
  task.blockedReason = "";
  task.updatedAt = new Date().toISOString();
}

function isRunnableTask(state: ControlPlaneState, task: TaskRecord): boolean {
  maybeResumeTask(state, task);
  if (task.status === "done" || task.stuck) return false;
  if (hasPendingDependencies(state, task)) return false;
  if (!taskReadyAfter(task)) return false;
  if (task.status === "blocked") return false;
  return true;
}

function pickTaskForAgent(state: ControlPlaneState, agent: string, preferredTaskId = ""): TaskRecord | null {
  const preferred = clean(preferredTaskId);
  if (preferred) {
    const task = findTask(state, preferred);
    if (task && task.assignee === agent && isRunnableTask(state, task)) return task;
  }
  const sessionTaskId = findSession(state, agent)?.currentTaskId || "";
  if (sessionTaskId) {
    const task = findTask(state, sessionTaskId);
    if (task && task.assignee === agent && isRunnableTask(state, task)) return task;
  }
  const candidates = listQueue(state, agent)
    .filter((task) => task.assignee === agent)
    .filter((task) => isRunnableTask(state, task))
    .sort((a, b) => {
      const priority = taskPriority(a) - taskPriority(b);
      if (priority !== 0) return priority;
      return a.updatedAt.localeCompare(b.updatedAt);
    });
  return candidates[0] || null;
}

function incrementTaskFailure(task: TaskRecord, failureClass: TaskFailureClass, reason: string, retryLimit = 0, cooldownMinutes = 0): void {
  task.failureCount += 1;
  task.lastFailureClass = failureClass;
  task.blockedReason = clean(reason);
  task.status = "blocked";
  task.nextRunAfter = cooldownMinutes > 0
    ? new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString()
    : "";
  task.stuck = retryLimit > 0 ? task.failureCount >= retryLimit : task.failureCount >= 3;
  task.updatedAt = new Date().toISOString();
}

function resetTaskAfterSuccess(task: TaskRecord, markDone: boolean): void {
  task.failureCount = 0;
  task.lastFailureClass = "";
  task.nextRunAfter = "";
  task.stuck = false;
  task.blockedReason = "";
  task.updatedAt = new Date().toISOString();
  if (markDone) {
    task.status = "done";
    task.completedAt = task.completedAt || task.updatedAt;
  } else {
    task.status = task.assignee ? "claimed" : "queued";
  }
}

function blockTaskForDependency(state: ControlPlaneState, task: TaskRecord, schedule: HeartbeatScheduleRecord | null): ExecutionSummary {
  const reason = task.blockedBy.length
    ? `Waiting on dependencies: ${task.blockedBy.join(", ")}`
    : task.blockedReason || "Task is blocked";
  incrementTaskFailure(task, "blocked-by-dependency", reason, schedule?.retryLimit || 0, schedule?.cooldownMinutes || 0);
  const execution = recordExecution(state, {
    agent: task.assignee,
    taskId: task.id,
    scheduleId: schedule?.id || "",
    trigger: schedule?.trigger || "manual",
    actionKind: task.actionKind,
    status: "blocked",
    summary: reason,
    nextAction: "Wait for dependencies to resolve",
    output: "",
    branch: "",
    prUrl: "",
    failureClass: "blocked-by-dependency",
    approvalId: "",
    budgetExceeded: false,
    createdTaskIds: [],
    durationMinutes: 0,
    costUnits: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
  if (schedule) applyHeartbeatScheduleResult(state, schedule.id, "blocked");
  upsertSession(state, {
    agent: task.assignee,
    currentTaskId: task.id,
    branch: "",
    prUrl: "",
    summary: reason,
    nextAction: "Wait for dependencies to resolve",
    lastOutput: "",
  });
  return {
    agent: task.assignee,
    scheduleId: schedule?.id || "",
    taskId: task.id,
    actionKind: task.actionKind,
    skipped: false,
    reason,
    heartbeat: null,
    execution,
    approvals: [],
    budgetUsage: null,
    delegatedTaskIds: [],
    taskStatusBefore: "blocked",
    taskStatusAfter: task.status,
  };
}

function createSkippedExecution(state: ControlPlaneState, agent: string, schedule: HeartbeatScheduleRecord | null, reason: string): RunAgentResult {
  const execution = recordExecution(state, {
    agent,
    taskId: schedule?.taskId || "",
    scheduleId: schedule?.id || "",
    trigger: schedule?.trigger || "manual",
    actionKind: "",
    status: "skipped",
    summary: clean(reason),
    nextAction: "Wait for queued work",
    output: "",
    branch: "",
    prUrl: "",
    failureClass: "",
    approvalId: "",
    budgetExceeded: false,
    createdTaskIds: [],
    durationMinutes: 0,
    costUnits: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
  if (schedule) applyHeartbeatScheduleResult(state, schedule.id, "ok");
  return {
    agent,
    schedule,
    scheduleId: schedule?.id || "",
    taskId: schedule?.taskId || "",
    actionKind: "",
    skipped: true,
    reason: clean(reason),
    heartbeat: null,
    execution,
    approvals: [],
    budgetUsage: null,
    delegatedTaskIds: [],
    taskStatusBefore: "",
    taskStatusAfter: "",
  };
}

function buildBudgetGate(state: ControlPlaneState, task: TaskRecord): { policy: ReturnType<typeof findBudgetPolicy> | null; usage: BudgetUsage | null; pending: ApprovalRecord | null; approved: ApprovalRecord | null } {
  const policy = task.assignee ? findBudgetPolicy(state, task.assignee) || null : null;
  if (!policy) return { policy, usage: null, pending: null, approved: null };
  const projected = projectedBudgetUsage(state, policy, {
    durationMinutes: task.expectedDurationMinutes || 1,
    costUnits: task.expectedCostUnits || 1,
  });
  if (!projected.exceeded) return { policy, usage: projected, pending: null, approved: null };
  const approved = findApprovedApproval(state, task.assignee, "budget-override", task.assignee) || null;
  if (approved) return { policy, usage: projected, pending: null, approved };
  const pending = ensureApprovalGate(state, {
    agent: task.assignee,
    kind: "budget-override",
    target: task.assignee,
    summary: `Budget override required for ${task.assignee}: exceeded ${projected.exceededFields.join(", ")}`,
    requestedBy: task.assignee,
    createPending: true,
  }).pending;
  return { policy, usage: projected, pending: pending || null, approved: null };
}

function buildApprovalBlock(state: ControlPlaneState, task: TaskRecord): ApprovalRecord | null {
  if (!task.requireApprovalKind) return null;
  const target = task.approvalTarget || task.id;
  const approved = findApprovedApproval(state, task.assignee, task.requireApprovalKind, target);
  if (approved) return null;
  return ensureApprovalGate(state, {
    agent: task.assignee,
    kind: task.requireApprovalKind,
    target,
    summary: `${task.requireApprovalKind} approval required for ${task.id}`,
    requestedBy: task.assignee,
    createPending: true,
  }).pending;
}

function spawnAction(task: TaskRecord, workspace: string): { status: number; stdout: string; stderr: string; actionKind: TaskActionKind | "" } {
  const actionKind = normalizeTaskActionKind(task.actionKind, true);
  if (!actionKind) {
    return { status: 2, stdout: "", stderr: "No action configured for task", actionKind };
  }
  let program = BUN;
  let args: string[] = [];
  if (actionKind === "review") args = [path.join(ROOT_DIR, "scripts", "review-diff.ts"), ...task.actionArgs];
  else if (actionKind === "qa") args = [path.join(ROOT_DIR, "scripts", "qa-run.ts"), ...task.actionArgs];
  else if (actionKind === "preview") args = [path.join(ROOT_DIR, "scripts", "preview-verify.ts"), ...task.actionArgs];
  else if (actionKind === "deploy") args = [path.join(ROOT_DIR, "scripts", "deploy-verify.ts"), ...task.actionArgs];
  else if (actionKind === "ship-plan") args = [path.join(ROOT_DIR, "scripts", "ship-branch.ts"), "--dry-run", ...task.actionArgs];
  else if (actionKind === "fleet-collect") args = [path.join(ROOT_DIR, "scripts", "fleet.ts"), "collect", ...task.actionArgs];
  else if (actionKind === "fleet-remediate-plan") args = [path.join(ROOT_DIR, "scripts", "fleet.ts"), "remediate", "--dry-run", ...task.actionArgs];
  else if (actionKind === "retro") args = [path.join(ROOT_DIR, "scripts", "retro-report.ts"), ...task.actionArgs];
  else if (actionKind === "upgrade") args = [path.join(ROOT_DIR, "scripts", "upgrade-check.ts"), ...task.actionArgs];
  else if (actionKind === "custom-command") {
    const [customProgram, ...customArgs] = task.actionArgs;
    if (!customProgram) return { status: 2, stdout: "", stderr: "custom-command requires an executable in actionArgs", actionKind };
    program = customProgram;
    args = customArgs;
  }
  if (actionKind !== "custom-command" && !args.includes("--json")) args.push("--json");
  const result = spawnSync(program, args, {
    cwd: workspace,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    actionKind,
  };
}

function parseActionPayload(stdout: string): Record<string, unknown> | null {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function deriveExecutionStatus(actionKind: TaskActionKind | "", exitCode: number, payload: Record<string, unknown> | null): TaskExecutionStatus {
  if (exitCode !== 0) return "error";
  const statusValue = clean(payload?.status || payload?.overallStatus || payload?.recommendation);
  if (statusValue === "warning") return "warning";
  if (statusValue === "blocked") return "blocked";
  if (statusValue === "error" || statusValue === "critical") return "error";
  if (actionKind === "review" && Array.isArray(payload?.findings) && payload?.findings.length) return "warning";
  return "success";
}

function deriveExecutionSummary(actionKind: TaskActionKind | "", payload: Record<string, unknown> | null, fallback: string): { summary: string; nextAction: string; branch: string; prUrl: string } {
  const findings = Array.isArray(payload?.findings) ? payload.findings.length : 0;
  const summary = clean(payload?.summary) || clean(payload?.recommendation) || (actionKind === "review" && findings ? `Review completed with ${findings} findings` : fallback);
  const nextAction = clean(payload?.nextAction) || clean(payload?.recommendation) || (findings ? "Inspect findings" : "Queue next task");
  const branch = clean(payload?.branch || payload?.currentBranch);
  const prUrl = clean(payload?.prUrl || ((payload?.pr as Record<string, unknown> | undefined)?.url));
  return { summary, nextAction, branch, prUrl };
}

function executeTask(state: ControlPlaneState, task: TaskRecord, schedule: HeartbeatScheduleRecord | null, trigger: HeartbeatTrigger): RunAgentResult {
  const agent = findAgent(state, task.assignee);
  if (!agent) return createSkippedExecution(state, task.assignee, schedule, `Unknown agent ${task.assignee}`);
  const taskStatusBefore = task.status;
  if (hasPendingDependencies(state, task)) return { ...blockTaskForDependency(state, task, schedule), schedule };
  const taskWorkspace = clean(agent.workspace) || ROOT_DIR;

  if (task.delegateTaskId && !findTask(state, task.delegateTaskId)) {
    const delegated = delegateTask(state, {
      parentTaskId: task.id,
      id: task.delegateTaskId,
      title: task.delegateTitle || `Delegated work from ${task.id}`,
      assignee: task.delegateAssignee,
      goalId: task.delegateGoalId || task.goalId,
      summary: task.delegateSummary,
      blockedReason: task.delegateBlockedReason,
      blockedBy: task.delegateBlockedBy,
      delegatedBy: task.assignee,
      actionKind: task.delegateActionKind,
      actionArgs: task.delegateActionArgs,
      expectedDurationMinutes: task.delegateExpectedDurationMinutes,
      expectedCostUnits: task.delegateExpectedCostUnits,
    });
    const nowIso = new Date().toISOString();
    const execution = recordExecution(state, {
      agent: task.assignee,
      taskId: task.id,
      scheduleId: schedule?.id || "",
      trigger,
      actionKind: task.actionKind,
      status: "success",
      summary: `Delegated ${delegated.child.id}`,
      nextAction: `Wait for ${delegated.child.id}`,
      output: JSON.stringify({ delegatedTaskId: delegated.child.id }),
      branch: "",
      prUrl: "",
      failureClass: "",
      approvalId: "",
      budgetExceeded: false,
      createdTaskIds: [delegated.child.id],
      durationMinutes: 0,
      costUnits: 0,
      startedAt: nowIso,
      finishedAt: nowIso,
    });
    const heartbeatOutcome = recordHeartbeat(state, {
      agent: task.assignee,
      taskId: task.id,
      trigger,
      status: "ok",
      summary: `Delegated ${delegated.child.id}`,
      nextAction: `Wait for ${delegated.child.id}`,
      output: JSON.stringify({ delegatedTaskId: delegated.child.id }),
      durationMinutes: 0,
      costUnits: 0,
      scheduledBy: task.assignee,
    });
    if (schedule) applyHeartbeatScheduleResult(state, schedule.id, heartbeatOutcome.heartbeat.status);
    return {
      agent: task.assignee,
      schedule,
      scheduleId: schedule?.id || "",
      taskId: task.id,
      actionKind: task.actionKind,
      skipped: false,
      reason: `Delegated ${delegated.child.id}`,
      heartbeat: heartbeatOutcome.heartbeat,
      execution,
      approvals: heartbeatOutcome.approvals,
      budgetUsage: heartbeatOutcome.budget.usage,
      delegatedTaskIds: [delegated.child.id],
      taskStatusBefore,
      taskStatusAfter: delegated.parent.status,
    };
  }

  const approvalBlock = buildApprovalBlock(state, task);
  if (approvalBlock) {
    incrementTaskFailure(task, "blocked-by-approval", `Waiting on approval ${approvalBlock.id}`, schedule?.retryLimit || 0, schedule?.cooldownMinutes || 0);
    upsertSession(state, {
      agent: task.assignee,
      currentTaskId: task.id,
      branch: "",
      prUrl: "",
      summary: `Approval required for ${task.id}`,
      nextAction: `Approve ${approvalBlock.id} to continue`,
      lastOutput: "",
    });
    const execution = recordExecution(state, {
      agent: task.assignee,
      taskId: task.id,
      scheduleId: schedule?.id || "",
      trigger,
      actionKind: task.actionKind,
      status: "blocked",
      summary: `Approval required for ${task.id}`,
      nextAction: `Approve ${approvalBlock.id} to continue`,
      output: "",
      branch: "",
      prUrl: "",
      failureClass: "blocked-by-approval",
      approvalId: approvalBlock.id,
      budgetExceeded: false,
      createdTaskIds: [],
      durationMinutes: 0,
      costUnits: 0,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    if (schedule) applyHeartbeatScheduleResult(state, schedule.id, "blocked");
    agent.status = "blocked";
    agent.updatedAt = new Date().toISOString();
    return {
      agent: task.assignee,
      schedule,
      scheduleId: schedule?.id || "",
      taskId: task.id,
      actionKind: task.actionKind,
      skipped: false,
      reason: `Waiting on approval ${approvalBlock.id}`,
      heartbeat: null,
      execution,
      approvals: [approvalBlock],
      budgetUsage: null,
      delegatedTaskIds: [],
      taskStatusBefore,
      taskStatusAfter: task.status,
    };
  }

  const budgetGate = buildBudgetGate(state, task);
  if (budgetGate.pending) {
    incrementTaskFailure(task, "blocked-by-budget", `Waiting on budget override ${budgetGate.pending.id}`, schedule?.retryLimit || 0, schedule?.cooldownMinutes || 0);
    upsertSession(state, {
      agent: task.assignee,
      currentTaskId: task.id,
      branch: "",
      prUrl: "",
      summary: `Budget override required for ${task.id}`,
      nextAction: `Approve ${budgetGate.pending.id} to continue`,
      lastOutput: "",
    });
    const execution = recordExecution(state, {
      agent: task.assignee,
      taskId: task.id,
      scheduleId: schedule?.id || "",
      trigger,
      actionKind: task.actionKind,
      status: "blocked",
      summary: `Budget override required for ${task.id}`,
      nextAction: `Approve ${budgetGate.pending.id} to continue`,
      output: "",
      branch: "",
      prUrl: "",
      failureClass: "blocked-by-budget",
      approvalId: budgetGate.pending.id,
      budgetExceeded: true,
      createdTaskIds: [],
      durationMinutes: 0,
      costUnits: 0,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    if (schedule) applyHeartbeatScheduleResult(state, schedule.id, "blocked");
    agent.status = "blocked";
    agent.updatedAt = new Date().toISOString();
    return {
      agent: task.assignee,
      schedule,
      scheduleId: schedule?.id || "",
      taskId: task.id,
      actionKind: task.actionKind,
      skipped: false,
      reason: `Waiting on budget override ${budgetGate.pending.id}`,
      heartbeat: null,
      execution,
      approvals: [budgetGate.pending],
      budgetUsage: budgetGate.usage,
      delegatedTaskIds: [],
      taskStatusBefore,
      taskStatusAfter: task.status,
    };
  }

  if (task.status === "queued") {
    task.status = "claimed";
    task.claimedAt = task.claimedAt || new Date().toISOString();
  }
  task.status = "working";
  task.updatedAt = new Date().toISOString();

  const startedAt = new Date();
  const spawnResult = spawnAction(task, taskWorkspace);
  const finishedAt = new Date();
  const durationMinutes = Number(((finishedAt.getTime() - startedAt.getTime()) / 60000).toFixed(2));
  const costUnits = task.expectedCostUnits || 1;
  const payload = parseActionPayload(spawnResult.stdout);
  const executionStatus = deriveExecutionStatus(spawnResult.actionKind, spawnResult.status, payload);
  const derived = deriveExecutionSummary(spawnResult.actionKind, payload, spawnResult.status === 0 ? `${spawnResult.actionKind} completed` : `${spawnResult.actionKind} failed`);
  const output = String(spawnResult.stdout || spawnResult.stderr || "").trim();

  if (executionStatus === "error") {
    incrementTaskFailure(task, "hard-failure", clean(spawnResult.stderr || derived.summary || `${spawnResult.actionKind} failed`), schedule?.retryLimit || 0, schedule?.cooldownMinutes || 0);
    agent.status = task.stuck ? "blocked" : "working";
    agent.updatedAt = finishedAt.toISOString();
    upsertSession(state, {
      agent: task.assignee,
      currentTaskId: task.id,
      branch: derived.branch,
      prUrl: derived.prUrl,
      summary: derived.summary,
      nextAction: task.stuck ? "Unstick task manually" : "Retry on next heartbeat",
      lastOutput: output,
    });
    const execution = recordExecution(state, {
      agent: task.assignee,
      taskId: task.id,
      scheduleId: schedule?.id || "",
      trigger,
      actionKind: spawnResult.actionKind,
      status: "error",
      summary: derived.summary,
      nextAction: task.stuck ? "Unstick task manually" : "Retry on next heartbeat",
      output,
      branch: derived.branch,
      prUrl: derived.prUrl,
      failureClass: "hard-failure",
      approvalId: "",
      budgetExceeded: false,
      createdTaskIds: [],
      durationMinutes,
      costUnits,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    });
    if (task.parentTaskId) syncDelegatedParent(state, task.parentTaskId);
    if (schedule) applyHeartbeatScheduleResult(state, schedule.id, "error", finishedAt);
    return {
      agent: task.assignee,
      schedule,
      scheduleId: schedule?.id || "",
      taskId: task.id,
      actionKind: spawnResult.actionKind,
      skipped: false,
      reason: derived.summary,
      heartbeat: null,
      execution,
      approvals: [],
      budgetUsage: budgetGate.usage,
      delegatedTaskIds: [],
      taskStatusBefore,
      taskStatusAfter: task.status,
    };
  }

  const heartbeatStatus: HeartbeatStatus = executionStatus === "warning" ? "warning" : executionStatus === "blocked" ? "blocked" : "ok";
  const heartbeatOutcome = recordHeartbeat(state, {
    agent: task.assignee,
    taskId: task.id,
    trigger,
    status: normalizeHeartbeatStatus(heartbeatStatus),
    summary: derived.summary,
    nextAction: derived.nextAction,
    output,
    branch: derived.branch,
    prUrl: derived.prUrl,
    durationMinutes,
    costUnits,
    scheduledBy: schedule?.id || task.assignee,
  });

  if (heartbeatOutcome.blocked) {
    const blockingApproval = heartbeatOutcome.approvals[0] || null;
    incrementTaskFailure(task, blockingApproval?.kind === "budget-override" ? "blocked-by-budget" : "blocked-by-approval", heartbeatOutcome.heartbeat.summary, schedule?.retryLimit || 0, schedule?.cooldownMinutes || 0);
  } else {
    resetTaskAfterSuccess(task, true);
  }
  if (task.parentTaskId) syncDelegatedParent(state, task.parentTaskId);
  const execution = recordExecution(state, {
    agent: task.assignee,
    taskId: task.id,
    scheduleId: schedule?.id || "",
    trigger,
    actionKind: spawnResult.actionKind,
    status: heartbeatOutcome.blocked ? "blocked" : executionStatus,
    summary: heartbeatOutcome.heartbeat.summary,
    nextAction: heartbeatOutcome.heartbeat.nextAction,
    output,
    branch: heartbeatOutcome.heartbeat.branch,
    prUrl: heartbeatOutcome.heartbeat.prUrl,
    failureClass: heartbeatOutcome.blocked ? (heartbeatOutcome.approvals[0]?.kind === "budget-override" ? "blocked-by-budget" : "blocked-by-approval") : "",
    approvalId: heartbeatOutcome.approvals[0]?.id || "",
    budgetExceeded: Boolean(heartbeatOutcome.budget.usage?.exceeded),
    createdTaskIds: [],
    durationMinutes,
    costUnits,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });
  if (schedule) applyHeartbeatScheduleResult(state, schedule.id, heartbeatOutcome.heartbeat.status, finishedAt);
  return {
    agent: task.assignee,
    schedule,
    scheduleId: schedule?.id || "",
    taskId: task.id,
    actionKind: spawnResult.actionKind,
    skipped: false,
    reason: heartbeatOutcome.heartbeat.summary,
    heartbeat: heartbeatOutcome.heartbeat,
    execution,
    approvals: heartbeatOutcome.approvals,
    budgetUsage: heartbeatOutcome.budget.usage,
    delegatedTaskIds: [],
    taskStatusBefore,
    taskStatusAfter: task.status,
  };
}

export function runAgentCycle(state: ControlPlaneState, agentName: string, scheduleId = ""): RunAgentResult {
  const schedule = clean(scheduleId) ? findSchedule(state, scheduleId) || null : null;
  const agent = findAgent(state, agentName);
  if (!agent) return createSkippedExecution(state, agentName, schedule, `Unknown agent ${agentName}`);
  if (agent.status === "paused" || agent.status === "offline") return createSkippedExecution(state, agent.name, schedule, `Agent ${agent.name} is ${agent.status}`);
  const task = pickTaskForAgent(state, agent.name, schedule?.taskId || "");
  if (!task) return createSkippedExecution(state, agent.name, schedule, `No runnable task for ${agent.name}`);
  return executeTask(state, task, schedule, schedule?.trigger || "manual");
}

export function runDueSchedules(state: ControlPlaneState, options: LoopRunOptions = {}): RunAgentResult[] {
  const dueSchedules = listDueSchedules(state, options.agent);
  const maxAgents = Math.max(1, options.maxAgents || 1);
  const maxTasks = Math.max(1, options.maxTasks || maxAgents);
  const results: RunAgentResult[] = [];
  const seenAgents = new Set<string>();
  for (const schedule of dueSchedules) {
    if (results.length >= maxTasks) break;
    if (seenAgents.has(schedule.agent)) continue;
    results.push(runAgentCycle(state, schedule.agent, schedule.id));
    seenAgents.add(schedule.agent);
    if (seenAgents.size >= maxAgents) break;
  }
  return results;
}
