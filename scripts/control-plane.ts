#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

export type AgentStatus = "idle" | "assigned" | "working" | "blocked" | "paused" | "offline";
export type GoalType = "org" | "initiative" | "repo" | "objective";
export type GoalStatus = "planned" | "active" | "blocked" | "done";
export type TaskStatus = "queued" | "claimed" | "working" | "blocked" | "done";

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

export interface ControlPlaneState {
  schemaVersion: 1;
  updatedAt: string;
  agents: AgentRecord[];
  goals: GoalRecord[];
  tasks: TaskRecord[];
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
  };
  agents: Array<AgentRecord & { directReports: string[]; queuedTasks: number; activeTasks: number; blockedTasks: number }>;
  goals: Array<GoalRecord & { childGoals: string[]; taskIds: string[] }>;
  queue: TaskRecord[];
  active: TaskRecord[];
  blocked: TaskRecord[];
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

export function defaultState(): ControlPlaneState {
  return {
    schemaVersion: 1,
    updatedAt: now(),
    agents: [],
    goals: [],
    tasks: [],
  };
}

export function resolveStatePath(inputPath = ""): string {
  const raw = clean(inputPath);
  return raw ? path.resolve(process.cwd(), raw) : DEFAULT_STATE_PATH;
}

export function readState(inputPath = ""): ControlPlaneState {
  const statePath = resolveStatePath(inputPath);
  if (!fs.existsSync(statePath)) return defaultState();
  const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<ControlPlaneState>;
  return {
    schemaVersion: 1,
    updatedAt: clean(parsed.updatedAt) || now(),
    agents: Array.isArray(parsed.agents) ? parsed.agents as AgentRecord[] : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals as GoalRecord[] : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks as TaskRecord[] : [],
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

export function normalizeAgentStatus(value: string): AgentStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "idle" || normalized === "assigned" || normalized === "working" || normalized === "blocked" || normalized === "paused" || normalized === "offline") {
    return normalized;
  }
  throw new Error(`Unknown agent status: ${JSON.stringify(value)}`);
}

export function normalizeGoalType(value: string): GoalType {
  const normalized = clean(value).toLowerCase();
  if (normalized === "org" || normalized === "initiative" || normalized === "repo" || normalized === "objective") {
    return normalized;
  }
  throw new Error(`Unknown goal type: ${JSON.stringify(value)}`);
}

export function normalizeGoalStatus(value: string): GoalStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "planned" || normalized === "active" || normalized === "blocked" || normalized === "done") {
    return normalized;
  }
  throw new Error(`Unknown goal status: ${JSON.stringify(value)}`);
}

export function normalizeTaskStatus(value: string): TaskStatus {
  const normalized = clean(value).toLowerCase();
  if (normalized === "queued" || normalized === "claimed" || normalized === "working" || normalized === "blocked" || normalized === "done") {
    return normalized;
  }
  throw new Error(`Unknown task status: ${JSON.stringify(value)}`);
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
  state.agents.sort((a, b) => a.name.localeCompare(b.name));
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
  state.goals.sort((a, b) => a.id.localeCompare(b.id));
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
  state.tasks.sort((a, b) => a.id.localeCompare(b.id));
  return record;
}

export function listQueue(state: ControlPlaneState, assignee = ""): TaskRecord[] {
  const target = clean(assignee);
  return state.tasks.filter((task) => {
    if (task.status === "done") return false;
    if (target && task.assignee !== target) return false;
    return true;
  });
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
    },
    agents: state.agents.map((agent) => ({
      ...agent,
      directReports: (directReports.get(agent.name) || []).sort(),
      queuedTasks: queued.filter((task) => task.assignee === agent.name).length,
      activeTasks: active.filter((task) => task.assignee === agent.name).length,
      blockedTasks: blocked.filter((task) => task.assignee === agent.name).length,
    })),
    goals: state.goals.map((goal) => ({
      ...goal,
      childGoals: state.goals.filter((candidate) => candidate.parentId === goal.id).map((candidate) => candidate.id),
      taskIds: state.tasks.filter((task) => task.goalId === goal.id).map((task) => task.id),
    })),
    queue: queued,
    active,
    blocked,
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
  return `<tr><td>${escapeHtml(agent.name)}</td><td>${escapeHtml(agent.role)}</td><td>${escapeHtml(agent.runtime)}</td><td>${escapeHtml(agent.team || "-")}</td><td>${escapeHtml(agent.manager || "-")}</td><td>${escapeHtml(agent.status)}</td><td>${agent.queuedTasks}</td><td>${agent.activeTasks}</td><td>${agent.blockedTasks}</td></tr>`;
}

function renderTaskRow(task: TaskRecord): string {
  return `<tr><td>${escapeHtml(task.id)}</td><td>${escapeHtml(task.goalId)}</td><td>${escapeHtml(task.title)}</td><td>${escapeHtml(task.assignee || "-")}</td><td>${escapeHtml(task.status)}</td><td>${escapeHtml(task.blockedReason || "-")}</td></tr>`;
}

function renderGoalRow(goal: DashboardReport["goals"][number]): string {
  return `<tr><td>${escapeHtml(goal.id)}</td><td>${escapeHtml(goal.title)}</td><td>${escapeHtml(goal.type)}</td><td>${escapeHtml(goal.owner || "-")}</td><td>${escapeHtml(goal.status)}</td><td>${goal.taskIds.length}</td><td>${goal.childGoals.length}</td></tr>`;
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
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    h1 { font-size: clamp(2.2rem, 4vw, 4rem); margin: 0 0 12px; }
    p.lede { max-width: 760px; font-size: 1.05rem; line-height: 1.6; margin: 0 0 28px; }
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
    <p class="lede">Track named agents, their reporting lines, goal hierarchy, and queued work in one local control surface. This is the first Paperclip-style orchestration layer for codex-stack: repo-focused, inspectable, and ready for later heartbeat and governance work.</p>
    <div class="grid">
      ${card("Agents", String(report.counts.agents))}
      ${card("Teams", String(report.counts.teams))}
      ${card("Goals", String(report.counts.goals))}
      ${card("Queued tasks", String(report.counts.queuedTasks), report.counts.queuedTasks ? "warn" : "neutral")}
      ${card("Active tasks", String(report.counts.activeTasks))}
      ${card("Blocked tasks", String(report.counts.blockedTasks), report.counts.blockedTasks ? "danger" : "neutral")}
      ${card("Completed tasks", String(report.counts.doneTasks))}
    </div>
    <div class="stack">
      <section class="panel">
        <h2>Agents</h2>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Runtime</th><th>Team</th><th>Manager</th><th>Status</th><th>Queued</th><th>Active</th><th>Blocked</th></tr></thead>
          <tbody>${report.agents.map(renderAgentRow).join("") || '<tr><td colspan="9">No agents registered.</td></tr>'}</tbody>
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
  fs.writeFileSync(markdownPath, `# codex-stack control plane\n\n- Generated: ${report.generatedAt}\n- Agents: ${report.counts.agents}\n- Teams: ${report.counts.teams}\n- Goals: ${report.counts.goals}\n- Queued tasks: ${report.counts.queuedTasks}\n- Active tasks: ${report.counts.activeTasks}\n- Blocked tasks: ${report.counts.blockedTasks}\n- Completed tasks: ${report.counts.doneTasks}\n`);
  return { outDir: resolvedOutDir, htmlPath, jsonPath, markdownPath };
}
