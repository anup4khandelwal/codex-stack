#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type AgentStatus = "idle" | "assigned" | "working" | "blocked" | "paused" | "offline";
export type GoalType = "org" | "initiative" | "repo" | "objective";
export type GoalStatus = "planned" | "active" | "blocked" | "done";
export type TaskStatus = "queued" | "claimed" | "working" | "blocked" | "done";
export type HeartbeatTrigger = "manual" | "cron" | "event";
export type HeartbeatStatus = "ok" | "warning" | "blocked" | "error";
export type BudgetWindow = "daily" | "weekly" | "monthly";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ApprovalKind = "ship-pr" | "merge-pr" | "update-snapshot" | "fleet-remediate" | "budget-override" | "custom";

export interface AgentRecord {
  name: string;
  runtime: string;
  role: string;
  repo: string;
  workspace: string;
  owner: string;
  team: string;
  manager: string;
  status: AgentStatus;
  lastHeartbeat: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalRecord {
  id: string;
  title: string;
  type: GoalType;
  owner: string;
  repo: string;
  parentId: string;
  status: GoalStatus;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecord {
  id: string;
  goalId: string;
  title: string;
  assignee: string;
  status: TaskStatus;
  summary: string;
  blockedReason: string;
  blockedBy: string[];
  createdAt: string;
  updatedAt: string;
  claimedAt: string;
  completedAt: string;
}

export interface HeartbeatScheduleRecord {
  id: string;
  agent: string;
  taskId: string;
  trigger: HeartbeatTrigger;
  expression: string;
  summary: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HeartbeatRecord {
  id: string;
  agent: string;
  taskId: string;
  trigger: HeartbeatTrigger;
  status: HeartbeatStatus;
  summary: string;
  nextAction: string;
  output: string;
  branch: string;
  prUrl: string;
  durationMinutes: number;
  costUnits: number;
  scheduledBy: string;
  createdAt: string;
}

export interface AgentSessionRecord {
  agent: string;
  currentTaskId: string;
  branch: string;
  prUrl: string;
  summary: string;
  nextAction: string;
  lastOutput: string;
  updatedAt: string;
}

export interface BudgetPolicyRecord {
  agent: string;
  window: BudgetWindow;
  maxRuns: number;
  maxMinutes: number;
  maxCostUnits: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  agent: string;
  kind: ApprovalKind;
  target: string;
  summary: string;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalStatus;
  note: string;
  resolvedBy: string;
  resolvedAt: string;
}

export interface BudgetUsage {
  agent: string;
  window: BudgetWindow;
  runs: number;
  minutes: number;
  costUnits: number;
  startedAt: string;
  exceeded: boolean;
  exceededFields: Array<"runs" | "minutes" | "costUnits">;
}

export interface HeartbeatOutcome {
  blocked: boolean;
  heartbeat: HeartbeatRecord;
  session: AgentSessionRecord;
  approvals: ApprovalRecord[];
  budget: {
    policy: BudgetPolicyRecord | null;
    usage: BudgetUsage | null;
  };
}

export interface ControlPlaneState {
  schemaVersion: 2;
  updatedAt: string;
  agents: AgentRecord[];
  goals: GoalRecord[];
  tasks: TaskRecord[];
  schedules: HeartbeatScheduleRecord[];
  heartbeats: HeartbeatRecord[];
  sessions: AgentSessionRecord[];
  budgets: BudgetPolicyRecord[];
  approvals: ApprovalRecord[];
}

export interface DashboardReport {
  generatedAt: string;
  statePath: string;
  counts: {
    agents: number;
    teams: number;
    goals: number;
    queuedTasks: number;
    activeTasks: number;
    blockedTasks: number;
    doneTasks: number;
    schedules: number;
    recentHeartbeats: number;
    pendingApprovals: number;
    exceededBudgets: number;
  };
  agents: Array<AgentRecord & {
    directReports: string[];
    queuedTasks: number;
    activeTasks: number;
    blockedTasks: number;
    session: AgentSessionRecord | null;
    budget: BudgetUsage | null;
    pendingApprovals: number;
  }>;
  goals: Array<GoalRecord & { childGoals: string[]; taskIds: string[] }>;
  queue: TaskRecord[];
  active: TaskRecord[];
  blocked: TaskRecord[];
  schedules: HeartbeatScheduleRecord[];
  heartbeats: HeartbeatRecord[];
  approvals: ApprovalRecord[];
}

const DEFAULT_STATE_PATH = path.resolve(process.cwd(), ".codex-stack", "control-plane", "state.json");

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function now(): string {
  return new Date().toISOString();
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseDate(value: string): Date | null {
  const normalized = clean(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortByKey<T>(items: T[], getter: (item: T) => string): T[] {
  return items.sort((a, b) => getter(a).localeCompare(getter(b)));
}

export function defaultState(): ControlPlaneState {
  return {
    schemaVersion: 2,
    updatedAt: now(),
    agents: [],
    goals: [],
    tasks: [],
    schedules: [],
    heartbeats: [],
    sessions: [],
    budgets: [],
    approvals: [],
  };
}

export function resolveStatePath(inputPath = ""): string {
  const raw = clean(inputPath);
  return raw ? path.resolve(process.cwd(), raw) : DEFAULT_STATE_PATH;
}

export function readState(inputPath = ""): ControlPlaneState {
  const statePath = resolveStatePath(inputPath);
  if (!fs.existsSync(statePath)) return defaultState();
  const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<ControlPlaneState> & Record<string, unknown>;
  return {
    schemaVersion: 2,
    updatedAt: clean(parsed.updatedAt) || now(),
    agents: Array.isArray(parsed.agents) ? parsed.agents as AgentRecord[] : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals as GoalRecord[] : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks as TaskRecord[] : [],
    schedules: Array.isArray(parsed.schedules) ? parsed.schedules as HeartbeatScheduleRecord[] : [],
    heartbeats: Array.isArray(parsed.heartbeats) ? parsed.heartbeats as HeartbeatRecord[] : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions as AgentSessionRecord[] : [],
    budgets: Array.isArray(parsed.budgets) ? parsed.budgets as BudgetPolicyRecord[] : [],
    approvals: Array.isArray(parsed.approvals) ? parsed.approvals as ApprovalRecord[] : [],
  };
}

export function writeState(state: ControlPlaneState, inputPath = ""): string {
  const statePath = resolveStatePath(inputPath);
  ensureDir(path.dirname(statePath));
  state.updatedAt = now();
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return statePath;
}

export function findAgent(state: ControlPlaneState, name: string): AgentRecord | undefined {
  const target = clean(name);
  return state.agents.find((agent) => agent.name === target);
}

export function findGoal(state: ControlPlaneState, id: string): GoalRecord | undefined {
  const target = clean(id);
  return state.goals.find((goal) => goal.id === target);
}

export function findTask(state: ControlPlaneState, id: string): TaskRecord | undefined {
  const target = clean(id);
  return state.tasks.find((task) => task.id === target);
}

export function findSchedule(state: ControlPlaneState, id: string): HeartbeatScheduleRecord | undefined {
  const target = clean(id);
  return state.schedules.find((schedule) => schedule.id === target);
}

export function findSession(state: ControlPlaneState, agent: string): AgentSessionRecord | undefined {
  const target = clean(agent);
  return state.sessions.find((session) => session.agent === target);
}

export function findBudgetPolicy(state: ControlPlaneState, agent: string): BudgetPolicyRecord | undefined {
  const target = clean(agent);
  return state.budgets.find((policy) => policy.agent === target);
}

export function findApproval(state: ControlPlaneState, id: string): ApprovalRecord | undefined {
  const target = clean(id);
  return state.approvals.find((approval) => approval.id === target);
}

export function requireAgent(state: ControlPlaneState, name: string): AgentRecord {
  const agent = findAgent(state, name);
  if (!agent) throw new Error(`Unknown agent: ${JSON.stringify(clean(name))}`);
  return agent;
}

export function requireGoal(state: ControlPlaneState, id: string): GoalRecord {
  const goal = findGoal(state, id);
  if (!goal) throw new Error(`Unknown goal: ${JSON.stringify(clean(id))}`);
  return goal;
}

export function requireTask(state: ControlPlaneState, id: string): TaskRecord {
  const task = findTask(state, id);
  if (!task) throw new Error(`Unknown task: ${JSON.stringify(clean(id))}`);
  return task;
}

export function requireSchedule(state: ControlPlaneState, id: string): HeartbeatScheduleRecord {
  const schedule = findSchedule(state, id);
  if (!schedule) throw new Error(`Unknown schedule: ${JSON.stringify(clean(id))}`);
  return schedule;
}

export function requireApproval(state: ControlPlaneState, id: string): ApprovalRecord {
  const approval = findApproval(state, id);
  if (!approval) throw new Error(`Unknown approval: ${JSON.stringify(clean(id))}`);
  return approval;
}

export function normalizeAgentStatus(value: string): AgentStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "idle" || normalized === "assigned" || normalized === "working" || normalized === "blocked" || normalized === "paused" || normalized === "offline") return normalized;
  throw new Error(`Unknown agent status: ${JSON.stringify(value)}`);
}

export function normalizeGoalType(value: string): GoalType {
  const normalized = clean(value).toLowerCase();
  if (normalized === "org" || normalized === "initiative" || normalized === "repo" || normalized === "objective") return normalized;
  throw new Error(`Unknown goal type: ${JSON.stringify(value)}`);
}

export function normalizeGoalStatus(value: string): GoalStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "planned" || normalized === "active" || normalized === "blocked" || normalized === "done") return normalized;
  throw new Error(`Unknown goal status: ${JSON.stringify(value)}`);
}

export function normalizeTaskStatus(value: string): TaskStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "queued" || normalized === "claimed" || normalized === "working" || normalized === "blocked" || normalized === "done") return normalized;
  throw new Error(`Unknown task status: ${JSON.stringify(value)}`);
}

export function normalizeHeartbeatTrigger(value: string): HeartbeatTrigger {
  const normalized = clean(value).toLowerCase();
  if (normalized === "manual" || normalized === "cron" || normalized === "event") return normalized;
  throw new Error(`Unknown heartbeat trigger: ${JSON.stringify(value)}`);
}

export function normalizeHeartbeatStatus(value: string): HeartbeatStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "ok" || normalized === "warning" || normalized === "blocked" || normalized === "error") return normalized;
  throw new Error(`Unknown heartbeat status: ${JSON.stringify(value)}`);
}

export function normalizeBudgetWindow(value: string): BudgetWindow {
  const normalized = clean(value).toLowerCase();
  if (normalized === "daily" || normalized === "weekly" || normalized === "monthly") return normalized;
  throw new Error(`Unknown budget window: ${JSON.stringify(value)}`);
}

export function normalizeApprovalStatus(value: string): ApprovalStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "pending" || normalized === "approved" || normalized === "rejected" || normalized === "cancelled") return normalized;
  throw new Error(`Unknown approval status: ${JSON.stringify(value)}`);
}

export function normalizeApprovalKind(value: string): ApprovalKind {
  const normalized = clean(value).toLowerCase();
  if (normalized === "ship-pr" || normalized === "merge-pr" || normalized === "update-snapshot" || normalized === "fleet-remediate" || normalized === "budget-override" || normalized === "custom") return normalized;
  throw new Error(`Unknown approval kind: ${JSON.stringify(value)}`);
}

export function upsertAgent(state: ControlPlaneState, input: Omit<AgentRecord, "createdAt" | "updatedAt">): AgentRecord {
  const existing = findAgent(state, input.name);
  if (input.manager) requireAgent(state, input.manager);
  const timestamp = now();
  const record: AgentRecord = {
    ...input,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    Object.assign(existing, record);
    return existing;
  }
  state.agents.push(record);
  sortByKey(state.agents, (item) => item.name);
  return record;
}

export function upsertGoal(state: ControlPlaneState, input: Omit<GoalRecord, "createdAt" | "updatedAt">): GoalRecord {
  const existing = findGoal(state, input.id);
  if (input.owner) requireAgent(state, input.owner);
  if (input.parentId) requireGoal(state, input.parentId);
  const timestamp = now();
  const record: GoalRecord = {
    ...input,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    Object.assign(existing, record);
    return existing;
  }
  state.goals.push(record);
  sortByKey(state.goals, (item) => item.id);
  return record;
}

export function upsertTask(state: ControlPlaneState, input: Omit<TaskRecord, "createdAt" | "updatedAt" | "claimedAt" | "completedAt"> & { claimedAt?: string; completedAt?: string }): TaskRecord {
  const existing = findTask(state, input.id);
  requireGoal(state, input.goalId);
  if (input.assignee) requireAgent(state, input.assignee);
  for (const dependency of input.blockedBy) requireTask(state, dependency);
  const timestamp = now();
  const record: TaskRecord = {
    ...input,
    claimedAt: input.status === "claimed" || input.status === "working" ? (existing?.claimedAt || input.claimedAt || timestamp) : (input.claimedAt || existing?.claimedAt || ""),
    completedAt: input.status === "done" ? (input.completedAt || existing?.completedAt || timestamp) : (input.completedAt || existing?.completedAt || ""),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    Object.assign(existing, record);
    return existing;
  }
  state.tasks.push(record);
  sortByKey(state.tasks, (item) => item.id);
  return record;
}

export function upsertSchedule(state: ControlPlaneState, input: Omit<HeartbeatScheduleRecord, "createdAt" | "updatedAt">): HeartbeatScheduleRecord {
  const existing = findSchedule(state, input.id);
  requireAgent(state, input.agent);
  if (input.taskId) requireTask(state, input.taskId);
  const timestamp = now();
  const record: HeartbeatScheduleRecord = {
    ...input,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    Object.assign(existing, record);
    return existing;
  }
  state.schedules.push(record);
  sortByKey(state.schedules, (item) => item.id);
  return record;
}

export function upsertSession(state: ControlPlaneState, input: Omit<AgentSessionRecord, "updatedAt">): AgentSessionRecord {
  requireAgent(state, input.agent);
  if (input.currentTaskId) requireTask(state, input.currentTaskId);
  const existing = findSession(state, input.agent);
  const record: AgentSessionRecord = {
    ...input,
    updatedAt: now(),
  };
  if (existing) {
    Object.assign(existing, record);
    return existing;
  }
  state.sessions.push(record);
  sortByKey(state.sessions, (item) => item.agent);
  return record;
}

export function upsertBudgetPolicy(state: ControlPlaneState, input: Omit<BudgetPolicyRecord, "createdAt" | "updatedAt">): BudgetPolicyRecord {
  requireAgent(state, input.agent);
  const existing = findBudgetPolicy(state, input.agent);
  const timestamp = now();
  const record: BudgetPolicyRecord = {
    ...input,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  if (existing) {
    Object.assign(existing, record);
    return existing;
  }
  state.budgets.push(record);
  sortByKey(state.budgets, (item) => item.agent);
  return record;
}

export function requestApproval(state: ControlPlaneState, input: Omit<ApprovalRecord, "id" | "requestedAt" | "status" | "note" | "resolvedBy" | "resolvedAt"> & { id?: string }): ApprovalRecord {
  requireAgent(state, input.agent);
  const timestamp = now();
  const record: ApprovalRecord = {
    id: clean(input.id) || randomUUID(),
    agent: input.agent,
    kind: input.kind,
    target: clean(input.target),
    summary: input.summary,
    requestedBy: input.requestedBy,
    requestedAt: timestamp,
    status: "pending",
    note: "",
    resolvedBy: "",
    resolvedAt: "",
  };
  state.approvals.push(record);
  sortByKey(state.approvals, (item) => item.id);
  return record;
}

export function resolveApproval(state: ControlPlaneState, id: string, status: ApprovalStatus, by: string, note = ""): ApprovalRecord {
  if (status !== "approved" && status !== "rejected" && status !== "cancelled") {
    throw new Error(`Unsupported approval resolution status: ${status}`);
  }
  const record = requireApproval(state, id);
  record.status = status;
  record.resolvedBy = clean(by);
  record.resolvedAt = now();
  record.note = clean(note);
  return record;
}

export function findPendingApproval(state: ControlPlaneState, agent: string, kind: ApprovalKind, target: string): ApprovalRecord | undefined {
  const normalizedTarget = clean(target);
  return state.approvals
    .filter((approval) => approval.agent === clean(agent) && approval.kind === kind && approval.target === normalizedTarget && approval.status === "pending")
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
}

export function findApprovedApproval(state: ControlPlaneState, agent: string, kind: ApprovalKind, target: string): ApprovalRecord | undefined {
  const normalizedTarget = clean(target);
  return state.approvals
    .filter((approval) => approval.agent === clean(agent) && approval.kind === kind && approval.target === normalizedTarget && approval.status === "approved")
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt))[0];
}

export function ensurePendingApproval(state: ControlPlaneState, input: Omit<ApprovalRecord, "id" | "requestedAt" | "status" | "note" | "resolvedBy" | "resolvedAt">): ApprovalRecord {
  const existing = findPendingApproval(state, input.agent, input.kind, input.target);
  if (existing) return existing;
  return requestApproval(state, input);
}

export function listQueue(state: ControlPlaneState, assignee = ""): TaskRecord[] {
  const target = clean(assignee);
  return state.tasks.filter((task) => {
    if (task.status === "done") return false;
    if (target && task.assignee !== target) return false;
    return true;
  });
}

function windowStart(window: BudgetWindow, reference: Date): Date {
  const start = new Date(reference);
  if (window === "daily") {
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  if (window === "weekly") {
    const day = start.getUTCDay();
    const offset = day === 0 ? 6 : day - 1;
    start.setUTCDate(start.getUTCDate() - offset);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function computeBudgetUsage(state: ControlPlaneState, policy: BudgetPolicyRecord, referenceDate = new Date()): BudgetUsage {
  const start = windowStart(policy.window, referenceDate);
  const rows = state.heartbeats.filter((heartbeat) => {
    if (heartbeat.agent !== policy.agent) return false;
    const createdAt = parseDate(heartbeat.createdAt);
    return Boolean(createdAt && createdAt.getTime() >= start.getTime());
  });
  const usage: BudgetUsage = {
    agent: policy.agent,
    window: policy.window,
    runs: rows.length,
    minutes: rows.reduce((sum, row) => sum + row.durationMinutes, 0),
    costUnits: rows.reduce((sum, row) => sum + row.costUnits, 0),
    startedAt: start.toISOString(),
    exceeded: false,
    exceededFields: [],
  };
  if (policy.maxRuns > 0 && usage.runs > policy.maxRuns) usage.exceededFields.push("runs");
  if (policy.maxMinutes > 0 && usage.minutes > policy.maxMinutes) usage.exceededFields.push("minutes");
  if (policy.maxCostUnits > 0 && usage.costUnits > policy.maxCostUnits) usage.exceededFields.push("costUnits");
  usage.exceeded = usage.exceededFields.length > 0;
  return usage;
}

export function projectedBudgetUsage(state: ControlPlaneState, policy: BudgetPolicyRecord, nextHeartbeat: Pick<HeartbeatRecord, "durationMinutes" | "costUnits">): BudgetUsage {
  const usage = computeBudgetUsage(state, policy);
  usage.runs += 1;
  usage.minutes += nextHeartbeat.durationMinutes;
  usage.costUnits += nextHeartbeat.costUnits;
  usage.exceededFields = [];
  if (policy.maxRuns > 0 && usage.runs > policy.maxRuns) usage.exceededFields.push("runs");
  if (policy.maxMinutes > 0 && usage.minutes > policy.maxMinutes) usage.exceededFields.push("minutes");
  if (policy.maxCostUnits > 0 && usage.costUnits > policy.maxCostUnits) usage.exceededFields.push("costUnits");
  usage.exceeded = usage.exceededFields.length > 0;
  return usage;
}

export function recordHeartbeat(state: ControlPlaneState, input: {
  agent: string;
  taskId?: string;
  trigger: HeartbeatTrigger;
  status: HeartbeatStatus;
  summary: string;
  nextAction?: string;
  output?: string;
  branch?: string;
  prUrl?: string;
  durationMinutes?: number;
  costUnits?: number;
  scheduledBy?: string;
  requireApprovalKind?: ApprovalKind;
  approvalTarget?: string;
  requestedBy?: string;
}): HeartbeatOutcome {
  const agent = requireAgent(state, input.agent);
  const taskId = clean(input.taskId);
  if (taskId) requireTask(state, taskId);
  const plannedStatus = input.status;
  let blocked = false;
  const approvals: ApprovalRecord[] = [];

  if (input.requireApprovalKind) {
    const target = clean(input.approvalTarget) || taskId || agent.name;
    const approved = findApprovedApproval(state, agent.name, input.requireApprovalKind, target);
    if (!approved) {
      approvals.push(ensurePendingApproval(state, {
        agent: agent.name,
        kind: input.requireApprovalKind,
        target,
        summary: clean(input.summary) || `${input.requireApprovalKind} approval required`,
        requestedBy: clean(input.requestedBy) || agent.name,
      }));
      blocked = true;
    }
  }

  const policy = findBudgetPolicy(state, agent.name) || null;
  let usage: BudgetUsage | null = null;
  if (policy) {
    const projected = projectedBudgetUsage(state, policy, {
      durationMinutes: Number.isFinite(Number(input.durationMinutes)) ? Number(input.durationMinutes) : 0,
      costUnits: Number.isFinite(Number(input.costUnits)) ? Number(input.costUnits) : 0,
    });
    usage = projected;
    if (projected.exceeded) {
      const budgetApproval = findApprovedApproval(state, agent.name, "budget-override", agent.name);
      if (!budgetApproval) {
        approvals.push(ensurePendingApproval(state, {
          agent: agent.name,
          kind: "budget-override",
          target: agent.name,
          summary: `Budget override required for ${agent.name}: exceeded ${projected.exceededFields.join(", ")}`,
          requestedBy: clean(input.requestedBy) || agent.name,
        }));
        blocked = true;
      }
    }
  }

  const createdAt = now();
  const heartbeat: HeartbeatRecord = {
    id: randomUUID(),
    agent: agent.name,
    taskId,
    trigger: input.trigger,
    status: blocked ? "blocked" : plannedStatus,
    summary: clean(input.summary),
    nextAction: clean(input.nextAction),
    output: clean(input.output),
    branch: clean(input.branch),
    prUrl: clean(input.prUrl),
    durationMinutes: Number.isFinite(Number(input.durationMinutes)) ? Number(input.durationMinutes) : 0,
    costUnits: Number.isFinite(Number(input.costUnits)) ? Number(input.costUnits) : 0,
    scheduledBy: clean(input.scheduledBy) || agent.name,
    createdAt,
  };
  state.heartbeats.push(heartbeat);
  state.heartbeats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const session = upsertSession(state, {
    agent: agent.name,
    currentTaskId: taskId,
    branch: heartbeat.branch,
    prUrl: heartbeat.prUrl,
    summary: heartbeat.summary,
    nextAction: heartbeat.nextAction,
    lastOutput: heartbeat.output,
  });

  agent.lastHeartbeat = createdAt;
  agent.status = blocked ? "blocked" : plannedStatus === "error" ? "blocked" : plannedStatus === "warning" ? "working" : "working";
  agent.updatedAt = createdAt;

  return {
    blocked,
    heartbeat,
    session,
    approvals,
    budget: {
      policy,
      usage,
    },
  };
}

export function buildApprovalGate(state: ControlPlaneState, input: { agent: string; kind: ApprovalKind; target: string }) {
  const pending = findPendingApproval(state, input.agent, input.kind, input.target) || null;
  const approved = findApprovedApproval(state, input.agent, input.kind, input.target) || null;
  return {
    allowed: Boolean(approved),
    pending,
    approved,
  };
}

export function listRecentHeartbeats(state: ControlPlaneState, agent = "", limit = 20): HeartbeatRecord[] {
  const target = clean(agent);
  return state.heartbeats
    .filter((heartbeat) => !target || heartbeat.agent === target)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function buildDashboardReport(state: ControlPlaneState, inputPath = ""): DashboardReport {
  const queued = state.tasks.filter((task) => task.status === "queued");
  const active = state.tasks.filter((task) => task.status === "claimed" || task.status === "working");
  const blocked = state.tasks.filter((task) => task.status === "blocked");
  const directReports = new Map<string, string[]>();
  for (const agent of state.agents) {
    if (!agent.manager) continue;
    const reports = directReports.get(agent.manager) || [];
    reports.push(agent.name);
    directReports.set(agent.manager, reports);
  }
  const recentHeartbeats = state.heartbeats
    .filter((heartbeat) => {
      const createdAt = parseDate(heartbeat.createdAt);
      return Boolean(createdAt && Date.now() - createdAt.getTime() <= 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pendingApprovals = state.approvals.filter((approval) => approval.status === "pending");
  const exceededBudgets = state.budgets
    .map((policy) => computeBudgetUsage(state, policy))
    .filter((usage) => usage.exceeded);
  return {
    generatedAt: now(),
    statePath: resolveStatePath(inputPath),
    counts: {
      agents: state.agents.length,
      teams: new Set(state.agents.map((agent) => agent.team).filter(Boolean)).size,
      goals: state.goals.length,
      queuedTasks: queued.length,
      activeTasks: active.length,
      blockedTasks: blocked.length,
      doneTasks: state.tasks.filter((task) => task.status === "done").length,
      schedules: state.schedules.filter((schedule) => schedule.active).length,
      recentHeartbeats: recentHeartbeats.length,
      pendingApprovals: pendingApprovals.length,
      exceededBudgets: exceededBudgets.length,
    },
    agents: state.agents.map((agent) => ({
      ...agent,
      directReports: (directReports.get(agent.name) || []).sort(),
      queuedTasks: queued.filter((task) => task.assignee === agent.name).length,
      activeTasks: active.filter((task) => task.assignee === agent.name).length,
      blockedTasks: blocked.filter((task) => task.assignee === agent.name).length,
      session: findSession(state, agent.name) || null,
      budget: findBudgetPolicy(state, agent.name) ? computeBudgetUsage(state, findBudgetPolicy(state, agent.name) as BudgetPolicyRecord) : null,
      pendingApprovals: pendingApprovals.filter((approval) => approval.agent === agent.name).length,
    })),
    goals: state.goals.map((goal) => ({
      ...goal,
      childGoals: state.goals.filter((candidate) => candidate.parentId === goal.id).map((candidate) => candidate.id),
      taskIds: state.tasks.filter((task) => task.goalId === goal.id).map((task) => task.id),
    })),
    queue: queued,
    active,
    blocked,
    schedules: state.schedules.filter((schedule) => schedule.active).sort((a, b) => a.id.localeCompare(b.id)),
    heartbeats: recentHeartbeats,
    approvals: pendingApprovals.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function card(title: string, value: string, tone = "neutral"): string {
  return `<section class="card ${tone}"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(value)}</p></section>`;
}

function renderAgentRow(agent: DashboardReport["agents"][number]): string {
  const session = agent.session?.nextAction ? ` / ${agent.session.nextAction}` : "";
  const budget = agent.budget?.exceeded ? `over ${agent.budget.window}` : agent.budget ? `${agent.budget.runs} runs` : "-";
  return `<tr><td>${escapeHtml(agent.name)}</td><td>${escapeHtml(agent.role)}</td><td>${escapeHtml(agent.runtime)}</td><td>${escapeHtml(agent.team || "-")}</td><td>${escapeHtml(agent.manager || "-")}</td><td>${escapeHtml(agent.status)}</td><td>${agent.queuedTasks}</td><td>${agent.activeTasks}</td><td>${agent.blockedTasks}</td><td>${escapeHtml(budget)}</td><td>${escapeHtml(session || "-")}</td><td>${agent.pendingApprovals}</td></tr>`;
}

function renderTaskRow(task: TaskRecord): string {
  return `<tr><td>${escapeHtml(task.id)}</td><td>${escapeHtml(task.goalId)}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.assignee || "-")}</td><td>${escapeHtml(task.status)}</td><td>${escapeHtml(task.blockedReason || "-")}</td></tr>`;
}

function renderGoalRow(goal: DashboardReport["goals"][number]): string {
  return `<tr><td>${escapeHtml(goal.id)}</td><td>${escapeHtml(goal.title)}</td><td>${escapeHtml(goal.type)}</td><td>${escapeHtml(goal.owner || "-")}</td><td>${escapeHtml(goal.status)}</td><td>${goal.taskIds.length}</td><td>${goal.childGoals.length}</td></tr>`;
}

function renderHeartbeatRow(heartbeat: HeartbeatRecord): string {
  return `<tr><td>${escapeHtml(heartbeat.agent)}</td><td>${escapeHtml(heartbeat.taskId || "-")}</td><td>${escapeHtml(heartbeat.trigger)}</td><td>${escapeHtml(heartbeat.status)}</td><td>${escapeHtml(heartbeat.summary || "-")}</td><td>${escapeHtml(heartbeat.nextAction || "-")}</td><td>${heartbeat.durationMinutes}</td></tr>`;
}

function renderApprovalRow(approval: ApprovalRecord): string {
  return `<tr><td>${escapeHtml(approval.id)}</td><td>${escapeHtml(approval.agent)}</td><td>${escapeHtml(approval.kind)}</td><td>${escapeHtml(approval.target || "-")}</td><td>${escapeHtml(approval.summary)}</td><td>${escapeHtml(approval.requestedBy || "-")}</td><td>${escapeHtml(approval.status)}</td></tr>`;
}

function renderScheduleRow(schedule: HeartbeatScheduleRecord): string {
  return `<tr><td>${escapeHtml(schedule.id)}</td><td>${escapeHtml(schedule.agent)}</td><td>${escapeHtml(schedule.taskId || "-")}</td><td>${escapeHtml(schedule.trigger)}</td><td>${escapeHtml(schedule.expression || "-")}</td><td>${escapeHtml(schedule.summary || "-")}</td></tr>`;
}

export function renderDashboardHtml(report: DashboardReport): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>codex-stack control plane</title>
  <style>
    :root {
      --bg: #f5f0e8;
      --ink: #162118;
      --accent: #0b5d4b;
      --warn: #c77c11;
      --danger: #b42318;
      --card: rgba(255,255,255,0.78);
      --border: rgba(22,33,24,0.16);
      --shadow: 0 18px 50px rgba(22,33,24,0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(11,93,75,0.12), transparent 34%),
        radial-gradient(circle at bottom right, rgba(199,124,17,0.15), transparent 30%),
        var(--bg);
    }
    main { max-width: 1260px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { font-size: clamp(2.2rem, 4vw, 4rem); margin: 0 0 12px; }
    p.lede { max-width: 860px; font-size: 1.05rem; line-height: 1.6; margin: 0 0 28px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px 18px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }
    .card h2 { font-size: 0.88rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px; }
    .card p { font-size: 1.8rem; margin: 0; }
    .warn p { color: var(--warn); }
    .danger p { color: var(--danger); }
    section.panel { margin-top: 18px; }
    section.panel > h2 { margin-bottom: 8px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(255,255,255,0.72);
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--border); text-align: left; font-size: 0.95rem; }
    th { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; background: rgba(11,93,75,0.08); }
    tr:last-child td { border-bottom: none; }
    .stack { display: grid; gap: 18px; }
    code { background: rgba(11,93,75,0.08); padding: 2px 6px; border-radius: 8px; }
    @media (max-width: 820px) {
      th, td { padding: 10px 12px; font-size: 0.85rem; }
    }
  </style>
</head>
<body>
  <main>
    <h1>codex-stack control plane</h1>
    <p class="lede">Track named agents, their reporting lines, goal hierarchy, scheduled wakeups, continuity state, budget burn, and approval backlog in one local control surface. This extends the control plane from basic staffing into a real autonomous loop manager.</p>
    <div class="grid">
      ${card("Agents", String(report.counts.agents))}
      ${card("Teams", String(report.counts.teams))}
      ${card("Goals", String(report.counts.goals))}
      ${card("Queued tasks", String(report.counts.queuedTasks), report.counts.queuedTasks ? "warn" : "neutral")}
      ${card("Active tasks", String(report.counts.activeTasks))}
      ${card("Blocked tasks", String(report.counts.blockedTasks), report.counts.blockedTasks ? "danger" : "neutral")}
      ${card("Schedules", String(report.counts.schedules))}
      ${card("Recent heartbeats", String(report.counts.recentHeartbeats))}
      ${card("Pending approvals", String(report.counts.pendingApprovals), report.counts.pendingApprovals ? "warn" : "neutral")}
      ${card("Exceeded budgets", String(report.counts.exceededBudgets), report.counts.exceededBudgets ? "danger" : "neutral")}
      ${card("Completed tasks", String(report.counts.doneTasks))}
    </div>
    <div class="stack">
      <section class="panel">
        <h2>Agents</h2>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Runtime</th><th>Team</th><th>Manager</th><th>Status</th><th>Queued</th><th>Active</th><th>Blocked</th><th>Budget</th><th>Next action</th><th>Pending approvals</th></tr></thead>
          <tbody>${report.agents.map(renderAgentRow).join("") || '<tr><td colspan="12">No agents registered.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Goals</h2>
        <table>
          <thead><tr><th>ID</th><th>Title</th><th>Type</th><th>Owner</th><th>Status</th><th>Tasks</th><th>Child goals</th></tr></thead>
          <tbody>${report.goals.map(renderGoalRow).join("") || '<tr><td colspan="7">No goals recorded.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Queue</h2>
        <table>
          <thead><tr><th>ID</th><th>Goal</th><th>Task</th><th>Assignee</th><th>Status</th><th>Blocked reason</th></tr></thead>
          <tbody>${report.queue.map(renderTaskRow).join("") || '<tr><td colspan="6">No queued work.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Schedules</h2>
        <table>
          <thead><tr><th>ID</th><th>Agent</th><th>Task</th><th>Trigger</th><th>Expression</th><th>Summary</th></tr></thead>
          <tbody>${report.schedules.map(renderScheduleRow).join("") || '<tr><td colspan="6">No schedules recorded.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Recent heartbeats</h2>
        <table>
          <thead><tr><th>Agent</th><th>Task</th><th>Trigger</th><th>Status</th><th>Summary</th><th>Next action</th><th>Minutes</th></tr></thead>
          <tbody>${report.heartbeats.map(renderHeartbeatRow).join("") || '<tr><td colspan="7">No heartbeats recorded.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Pending approvals</h2>
        <table>
          <thead><tr><th>ID</th><th>Agent</th><th>Kind</th><th>Target</th><th>Summary</th><th>Requested by</th><th>Status</th></tr></thead>
          <tbody>${report.approvals.map(renderApprovalRow).join("") || '<tr><td colspan="7">No pending approvals.</td></tr>'}</tbody>
        </table>
      </section>
    </div>
    <p class="lede">Generated at <code>${escapeHtml(report.generatedAt)}</code> from <code>${escapeHtml(report.statePath)}</code>.</p>
  </main>
</body>
</html>`;
}

export function writeDashboard(report: DashboardReport, outDir: string): { outDir: string; htmlPath: string; jsonPath: string; markdownPath: string } {
  const resolvedOutDir = path.resolve(process.cwd(), outDir || ".codex-stack/control-plane/dashboard");
  ensureDir(resolvedOutDir);
  const htmlPath = path.join(resolvedOutDir, "index.html");
  const jsonPath = path.join(resolvedOutDir, "manifest.json");
  const markdownPath = path.join(resolvedOutDir, "summary.md");
  fs.writeFileSync(htmlPath, renderDashboardHtml(report));
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, `# codex-stack control plane\n\n- Generated: ${report.generatedAt}\n- Agents: ${report.counts.agents}\n- Teams: ${report.counts.teams}\n- Goals: ${report.counts.goals}\n- Queued tasks: ${report.counts.queuedTasks}\n- Active tasks: ${report.counts.activeTasks}\n- Blocked tasks: ${report.counts.blockedTasks}\n- Schedules: ${report.counts.schedules}\n- Recent heartbeats: ${report.counts.recentHeartbeats}\n- Pending approvals: ${report.counts.pendingApprovals}\n- Exceeded budgets: ${report.counts.exceededBudgets}\n- Completed tasks: ${report.counts.doneTasks}\n`);
  return { outDir: resolvedOutDir, htmlPath, jsonPath, markdownPath };
}
