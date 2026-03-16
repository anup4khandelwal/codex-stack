#!/usr/bin/env bun
import process from "node:process";
import {
  applyHeartbeatScheduleResult,
  buildDashboardReport,
  findSchedule,
  findSession,
  listDueSchedules,
  listRecentHeartbeats,
  normalizeApprovalKind,
  normalizeHeartbeatStatus,
  normalizeHeartbeatTrigger,
  readState,
  recordHeartbeat,
  resolveStatePath,
  upsertSchedule,
  writeDashboard,
  writeState,
} from "./control-plane.ts";

type Command = "list" | "show" | "schedule" | "beat" | "due" | "dashboard";

type ParsedArgs = ListArgs | ShowArgs | ScheduleArgs | BeatArgs | DueArgs | DashboardArgs;

interface BaseArgs {
  command: Command;
  json: boolean;
  statePath: string;
}

interface ListArgs extends BaseArgs {
  command: "list";
  agent: string;
}

interface ShowArgs extends BaseArgs {
  command: "show";
  agent: string;
}

interface ScheduleArgs extends BaseArgs {
  command: "schedule";
  scheduleCommand: "add" | "list" | "pause" | "resume";
  id: string;
  agent: string;
  taskId: string;
  trigger: string;
  expression: string;
  summary: string;
  retryLimit: number;
  cooldownMinutes: number;
}

interface BeatArgs extends BaseArgs {
  command: "beat";
  agent: string;
  scheduleId: string;
  taskId: string;
  trigger: string;
  status: string;
  summary: string;
  nextAction: string;
  output: string;
  branch: string;
  prUrl: string;
  durationMinutes: number;
  costUnits: number;
  scheduledBy: string;
  requireApproval: string;
  approvalTarget: string;
  requestedBy: string;
}

interface DueArgs extends BaseArgs {
  command: "due";
  agent: string;
}

interface DashboardArgs extends BaseArgs {
  command: "dashboard";
  outDir: string;
}

function usage(): never {
  console.log(`heartbeat

Usage:
  bun src/cli.ts heartbeat list [--agent <name>] [--state <path>] [--json]
  bun src/cli.ts heartbeat show <agent> [--state <path>] [--json]
  bun src/cli.ts heartbeat schedule add --agent <name> [--task <id>] [--trigger <manual|cron|event>] [--expression <expr>] [--summary <text>] [--id <schedule-id>] [--state <path>] [--json]
  bun src/cli.ts heartbeat schedule list [--agent <name>] [--state <path>] [--json]
  bun src/cli.ts heartbeat schedule pause <id> [--state <path>] [--json]
  bun src/cli.ts heartbeat schedule resume <id> [--state <path>] [--json]
  bun src/cli.ts heartbeat due [--agent <name>] [--state <path>] [--json]
  bun src/cli.ts heartbeat beat [--agent <name>] [--schedule <id>] [--task <id>] [--trigger <manual|cron|event>] [--status <ok|warning|blocked|error>] [--summary <text>] [--next-action <text>] [--output <text>] [--branch <name>] [--pr-url <url>] [--duration-minutes <n>] [--cost-units <n>] [--scheduled-by <name>] [--require-approval <ship-pr|merge-pr|update-snapshot|fleet-remediate|budget-override|custom>] [--approval-target <id>] [--requested-by <name>] [--state <path>] [--json]
  bun src/cli.ts heartbeat dashboard [--out <dir>] [--state <path>] [--json]
`);
  process.exit(0);
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseNumber(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
  const command = clean(argv[0]) as Command;
  if (command === "list") {
    const out: ListArgs = { command, json: false, statePath: "", agent: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "show") {
    const agent = clean(argv[1]);
    if (!agent) throw new Error("Pass the agent name.");
    const out: ShowArgs = { command, json: false, statePath: "", agent };
    for (let i = 2; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "schedule") {
    const scheduleCommand = clean(argv[1]) as ScheduleArgs["scheduleCommand"];
    const out: ScheduleArgs = {
      command,
      scheduleCommand,
      json: false,
      statePath: "",
      id: scheduleCommand === "pause" || scheduleCommand === "resume" ? clean(argv[2]) : "",
      agent: "",
      taskId: "",
      trigger: "cron",
      expression: "0 * * * *",
      summary: "",
      retryLimit: 0,
      cooldownMinutes: 0,
    };
    const startIndex = scheduleCommand === "pause" || scheduleCommand === "resume" ? 3 : 2;
    for (let i = startIndex; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--id") out.id = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else if (arg === "--task") out.taskId = clean(argv[++i]);
      else if (arg === "--trigger") out.trigger = clean(argv[++i]);
      else if (arg === "--expression") out.expression = clean(argv[++i]);
      else if (arg === "--summary") out.summary = clean(argv[++i]);
      else if (arg === "--retry-limit") out.retryLimit = parseNumber(argv[++i], 0);
      else if (arg === "--cooldown-minutes") out.cooldownMinutes = parseNumber(argv[++i], 0);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (scheduleCommand === "add" && !out.agent) throw new Error("--agent is required for schedule add.");
    if ((scheduleCommand === "pause" || scheduleCommand === "resume") && !out.id) throw new Error("Pass the schedule id.");
    return out;
  }
  if (command === "beat") {
    const out: BeatArgs = {
      command,
      json: false,
      statePath: "",
      agent: "",
      scheduleId: "",
      taskId: "",
      trigger: "",
      status: "ok",
      summary: "",
      nextAction: "",
      output: "",
      branch: "",
      prUrl: "",
      durationMinutes: 0,
      costUnits: 0,
      scheduledBy: "",
      requireApproval: "",
      approvalTarget: "",
      requestedBy: "",
    };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else if (arg === "--schedule") out.scheduleId = clean(argv[++i]);
      else if (arg === "--task") out.taskId = clean(argv[++i]);
      else if (arg === "--trigger") out.trigger = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else if (arg === "--summary") out.summary = clean(argv[++i]);
      else if (arg === "--next-action") out.nextAction = clean(argv[++i]);
      else if (arg === "--output") out.output = clean(argv[++i]);
      else if (arg === "--branch") out.branch = clean(argv[++i]);
      else if (arg === "--pr-url") out.prUrl = clean(argv[++i]);
      else if (arg === "--duration-minutes") out.durationMinutes = parseNumber(argv[++i], 0);
      else if (arg === "--cost-units") out.costUnits = parseNumber(argv[++i], 0);
      else if (arg === "--scheduled-by") out.scheduledBy = clean(argv[++i]);
      else if (arg === "--require-approval") out.requireApproval = clean(argv[++i]);
      else if (arg === "--approval-target") out.approvalTarget = clean(argv[++i]);
      else if (arg === "--requested-by") out.requestedBy = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.agent && !out.scheduleId) throw new Error("--agent or --schedule is required.");
    return out;
  }
  if (command === "due") {
    const out: DueArgs = { command, json: false, statePath: "", agent: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "dashboard") {
    const out: DashboardArgs = { command, json: false, statePath: "", outDir: ".codex-stack/control-plane/dashboard" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--out") out.outDir = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  usage();
}

function listHeartbeats(args: ListArgs): void {
  const state = readState(args.statePath);
  const rows = listRecentHeartbeats(state, args.agent, 50);
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("No heartbeats recorded.");
    return;
  }
  for (const row of rows) {
    console.log(`${row.agent}\t${row.taskId || "-"}\t${row.trigger}\t${row.status}\t${row.summary || "-"}`);
  }
}

function showHeartbeat(args: ShowArgs): void {
  const state = readState(args.statePath);
  const payload = {
    agent: args.agent,
    session: findSession(state, args.agent) || null,
    schedules: state.schedules.filter((schedule) => schedule.agent === args.agent),
    heartbeats: listRecentHeartbeats(state, args.agent, 10),
    approvals: state.approvals.filter((approval) => approval.agent === args.agent && approval.status === "pending"),
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`${args.agent}`);
  console.log(`Session summary: ${payload.session?.summary || "-"}`);
  console.log(`Next action: ${payload.session?.nextAction || "-"}`);
  console.log(`Schedules: ${payload.schedules.length}`);
  console.log(`Recent heartbeats: ${payload.heartbeats.length}`);
  console.log(`Pending approvals: ${payload.approvals.length}`);
}

function scheduleHeartbeat(args: ScheduleArgs): void {
  const state = readState(args.statePath);
  if (args.scheduleCommand === "list") {
    const rows = state.schedules.filter((schedule) => !args.agent || schedule.agent === args.agent);
    if (args.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    if (!rows.length) {
      console.log("No schedules recorded.");
      return;
    }
    for (const row of rows) {
      console.log(`${row.id}\t${row.agent}\t${row.trigger}\t${row.expression || "-"}\t${row.active ? "active" : "paused"}`);
    }
    return;
  }
  if (args.scheduleCommand === "add") {
    const record = upsertSchedule(state, {
      id: args.id || `${args.agent}-${Date.now()}`,
      agent: args.agent,
      taskId: args.taskId,
      trigger: normalizeHeartbeatTrigger(args.trigger || "cron"),
      expression: args.expression,
      summary: args.summary,
      active: true,
      retryLimit: Math.max(0, args.retryLimit || 0),
      cooldownMinutes: Math.max(0, args.cooldownMinutes || 0),
      failureCount: 0,
      lastAttemptAt: "",
      nextRunAfter: "",
    });
    const statePath = writeState(state, args.statePath);
    if (args.json) {
      console.log(JSON.stringify({ statePath, schedule: record }, null, 2));
      return;
    }
    console.log(`Recorded schedule ${record.id} in ${resolveStatePath(args.statePath)}`);
    return;
  }
  const record = findSchedule(state, args.id);
  if (!record) throw new Error(`Unknown schedule: ${JSON.stringify(args.id)}`);
  record.active = args.scheduleCommand === "resume";
  if (args.scheduleCommand === "resume") {
    record.failureCount = 0;
    record.nextRunAfter = "";
  }
  record.updatedAt = new Date().toISOString();
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, schedule: record }, null, 2));
    return;
  }
  console.log(`${args.scheduleCommand === "pause" ? "Paused" : "Resumed"} schedule ${record.id}`);
}

function beat(args: BeatArgs): void {
  const state = readState(args.statePath);
  const schedule = args.scheduleId ? findSchedule(state, args.scheduleId) : undefined;
  if (args.scheduleId && !schedule) throw new Error(`Unknown schedule: ${JSON.stringify(args.scheduleId)}`);
  const agent = args.agent || schedule?.agent || "";
  const taskId = args.taskId || schedule?.taskId || "";
  const trigger = args.trigger || schedule?.trigger || "manual";
  const outcome = recordHeartbeat(state, {
    agent,
    taskId,
    trigger: normalizeHeartbeatTrigger(trigger),
    status: normalizeHeartbeatStatus(args.status || "ok"),
    summary: args.summary,
    nextAction: args.nextAction,
    output: args.output,
    branch: args.branch,
    prUrl: args.prUrl,
    durationMinutes: args.durationMinutes,
    costUnits: args.costUnits,
    scheduledBy: args.scheduledBy,
    requireApprovalKind: args.requireApproval ? normalizeApprovalKind(args.requireApproval) : undefined,
    approvalTarget: args.approvalTarget,
    requestedBy: args.requestedBy,
  });
  const scheduleResult = schedule
    ? applyHeartbeatScheduleResult(state, schedule.id, outcome.heartbeat.status)
    : null;
  const statePath = writeState(state, args.statePath);
  const payload = { statePath, schedule: scheduleResult, ...outcome };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`${outcome.blocked ? "Blocked" : "Recorded"} heartbeat ${outcome.heartbeat.id} for ${outcome.heartbeat.agent}`);
}

function due(args: DueArgs): void {
  const state = readState(args.statePath);
  const rows = listDueSchedules(state, args.agent);
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("No schedules are due.");
    return;
  }
  for (const row of rows) {
    console.log(`${row.id}\t${row.agent}\t${row.trigger}\t${row.expression || "-"}\t${row.nextRunAfter || "now"}`);
  }
}

function dashboard(args: DashboardArgs): void {
  const state = readState(args.statePath);
  const report = buildDashboardReport(state, args.statePath);
  const written = writeDashboard(report, args.outDir);
  if (args.json) {
    console.log(JSON.stringify({ ...written, report }, null, 2));
    return;
  }
  console.log(`Wrote control-plane dashboard: ${written.htmlPath}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "list") listHeartbeats(args);
  else if (args.command === "show") showHeartbeat(args);
  else if (args.command === "schedule") scheduleHeartbeat(args);
  else if (args.command === "beat") beat(args);
  else if (args.command === "due") due(args);
  else if (args.command === "dashboard") dashboard(args);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
