#!/usr/bin/env bun
import process from "node:process";
import {
  findGoal,
  listQueue,
  normalizeGoalStatus,
  normalizeGoalType,
  normalizeTaskStatus,
  readState,
  requireTask,
  resolveStatePath,
  upsertGoal,
  upsertTask,
  writeState,
  type GoalRecord,
  type TaskRecord,
} from "./control-plane.ts";

type GoalCommand = "list" | "show" | "add" | "queue";
type TaskCommand = "add" | "list" | "claim" | "reassign" | "block" | "unblock" | "complete";

type ParsedArgs = GoalListArgs | GoalShowArgs | GoalWriteArgs | QueueArgs | TaskWriteArgs | TaskListArgs | TaskSingleArgs;

interface BaseArgs {
  json: boolean;
  statePath: string;
}

interface GoalListArgs extends BaseArgs {
  mode: "goal";
  command: "list";
  owner: string;
  type: string;
  status: string;
}

interface GoalShowArgs extends BaseArgs {
  mode: "goal";
  command: "show";
  id: string;
}

interface GoalWriteArgs extends BaseArgs {
  mode: "goal";
  command: "add";
  id: string;
  title: string;
  type: string;
  owner: string;
  repo: string;
  parentId: string;
  status: string;
  summary: string;
}

interface QueueArgs extends BaseArgs {
  mode: "goal";
  command: "queue";
  assignee: string;
}

interface TaskWriteArgs extends BaseArgs {
  mode: "task";
  command: "add";
  id: string;
  goalId: string;
  title: string;
  assignee: string;
  status: string;
  summary: string;
  blockedReason: string;
  blockedBy: string[];
}

interface TaskListArgs extends BaseArgs {
  mode: "task";
  command: "list";
  goalId: string;
  assignee: string;
  status: string;
}

interface TaskSingleArgs extends BaseArgs {
  mode: "task";
  command: "claim" | "reassign" | "block" | "unblock" | "complete";
  id: string;
  assignee: string;
  reason: string;
}

function usage(): never {
  console.log(`goals

Usage:
  bun src/cli.ts goals list [--owner <agent>] [--type <org|initiative|repo|objective>] [--status <planned|active|blocked|done>] [--state <path>] [--json]
  bun src/cli.ts goals show <id> [--state <path>] [--json]
  bun src/cli.ts goals add --id <id> --title <title> [--type <org|initiative|repo|objective>] [--owner <agent>] [--repo <repo>] [--parent <goal-id>] [--status <planned|active|blocked|done>] [--summary <text>] [--state <path>] [--json]
  bun src/cli.ts goals queue [--assignee <agent>] [--state <path>] [--json]
  bun src/cli.ts goals task add --id <id> --goal <goal-id> --title <title> [--assignee <agent>] [--status <queued|claimed|working|blocked|done>] [--summary <text>] [--blocked-by <task-id>] [--blocked-reason <text>] [--state <path>] [--json]
  bun src/cli.ts goals task list [--goal <goal-id>] [--assignee <agent>] [--status <queued|claimed|working|blocked|done>] [--state <path>] [--json]
  bun src/cli.ts goals task claim <id> [--assignee <agent>] [--state <path>] [--json]
  bun src/cli.ts goals task reassign <id> --assignee <agent> [--state <path>] [--json]
  bun src/cli.ts goals task block <id> --reason <text> [--state <path>] [--json]
  bun src/cli.ts goals task unblock <id> [--state <path>] [--json]
  bun src/cli.ts goals task complete <id> [--state <path>] [--json]
`);
  process.exit(0);
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseArgs(argv: string[]): ParsedArgs {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
  if (argv[0] === "task") return parseTaskArgs(argv.slice(1));
  const command = clean(argv[0]) as GoalCommand;
  if (command === "list") {
    const out: GoalListArgs = { mode: "goal", command, json: false, statePath: "", owner: "", type: "", status: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--owner") out.owner = clean(argv[++i]);
      else if (arg === "--type") out.type = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "show") {
    const id = clean(argv[1]);
    if (!id) throw new Error("Pass the goal id.");
    const out: GoalShowArgs = { mode: "goal", command, json: false, statePath: "", id };
    for (let i = 2; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "add") {
    const out: GoalWriteArgs = {
      mode: "goal",
      command,
      json: false,
      statePath: "",
      id: "",
      title: "",
      type: "initiative",
      owner: "",
      repo: "",
      parentId: "",
      status: "planned",
      summary: "",
    };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--id") out.id = clean(argv[++i]);
      else if (arg === "--title") out.title = clean(argv[++i]);
      else if (arg === "--type") out.type = clean(argv[++i]);
      else if (arg === "--owner") out.owner = clean(argv[++i]);
      else if (arg === "--repo") out.repo = clean(argv[++i]);
      else if (arg === "--parent") out.parentId = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else if (arg === "--summary") out.summary = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.id || !out.title) throw new Error("--id and --title are required.");
    return out;
  }
  if (command === "queue") {
    const out: QueueArgs = { mode: "goal", command, json: false, statePath: "", assignee: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--assignee") out.assignee = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  usage();
}

function parseTaskArgs(argv: string[]): ParsedArgs {
  const command = clean(argv[0]) as TaskCommand;
  if (!command) usage();
  if (command === "add") {
    const out: TaskWriteArgs = {
      mode: "task",
      command,
      json: false,
      statePath: "",
      id: "",
      goalId: "",
      title: "",
      assignee: "",
      status: "queued",
      summary: "",
      blockedReason: "",
      blockedBy: [],
    };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--id") out.id = clean(argv[++i]);
      else if (arg === "--goal") out.goalId = clean(argv[++i]);
      else if (arg === "--title") out.title = clean(argv[++i]);
      else if (arg === "--assignee") out.assignee = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else if (arg === "--summary") out.summary = clean(argv[++i]);
      else if (arg === "--blocked-reason") out.blockedReason = clean(argv[++i]);
      else if (arg === "--blocked-by") out.blockedBy.push(clean(argv[++i]));
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.id || !out.goalId || !out.title) throw new Error("--id, --goal, and --title are required.");
    return out;
  }
  if (command === "list") {
    const out: TaskListArgs = { mode: "task", command, json: false, statePath: "", goalId: "", assignee: "", status: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--goal") out.goalId = clean(argv[++i]);
      else if (arg === "--assignee") out.assignee = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "claim" || command === "reassign" || command === "block" || command === "unblock" || command === "complete") {
    const id = clean(argv[1]);
    if (!id) throw new Error("Pass the task id.");
    const out: TaskSingleArgs = { mode: "task", command, json: false, statePath: "", id, assignee: "", reason: "" };
    for (let i = 2; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--assignee") out.assignee = clean(argv[++i]);
      else if (arg === "--reason") out.reason = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (command === "reassign" && !out.assignee) throw new Error("--assignee is required for reassign.");
    if (command === "block" && !out.reason) throw new Error("--reason is required for block.");
    return out;
  }
  usage();
}

function printGoal(goal: GoalRecord, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(goal, null, 2));
    return;
  }
  console.log(`${goal.id}\t${goal.type}\t${goal.status}\t${goal.owner || "-"}\t${goal.title}`);
}

function printTask(task: TaskRecord, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }
  console.log(`${task.id}\t${task.goalId}\t${task.assignee || "-"}\t${task.status}\t${task.title}`);
}

function handleGoalList(args: GoalListArgs): void {
  const state = readState(args.statePath);
  const typeFilter = args.type ? normalizeGoalType(args.type) : "";
  const statusFilter = args.status ? normalizeGoalStatus(args.status) : "";
  const rows = state.goals.filter((goal) => {
    if (args.owner && goal.owner !== args.owner) return false;
    if (typeFilter && goal.type !== typeFilter) return false;
    if (statusFilter && goal.status !== statusFilter) return false;
    return true;
  });
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("No goals recorded.");
    return;
  }
  for (const goal of rows) printGoal(goal, false);
}

function handleGoalShow(args: GoalShowArgs): void {
  const state = readState(args.statePath);
  const goal = findGoal(state, args.id);
  if (!goal) throw new Error(`Unknown goal: ${JSON.stringify(args.id)}`);
  const payload = {
    ...goal,
    childGoals: state.goals.filter((candidate) => candidate.parentId === goal.id),
    tasks: state.tasks.filter((task) => task.goalId === goal.id),
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`${goal.id}\t${goal.type}\t${goal.status}\t${goal.title}`);
  console.log(`Owner: ${goal.owner || "-"}`);
  console.log(`Child goals: ${payload.childGoals.map((item) => item.id).join(", ") || "-"}`);
  console.log(`Tasks: ${payload.tasks.map((item) => item.id).join(", ") || "-"}`);
}

function handleGoalAdd(args: GoalWriteArgs): void {
  const state = readState(args.statePath);
  const goal = upsertGoal(state, {
    id: args.id,
    title: args.title,
    type: normalizeGoalType(args.type || "initiative"),
    owner: args.owner,
    repo: args.repo,
    parentId: args.parentId,
    status: normalizeGoalStatus(args.status || "planned"),
    summary: args.summary,
  });
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, goal }, null, 2));
    return;
  }
  console.log(`Recorded goal ${goal.id} in ${resolveStatePath(args.statePath)}`);
}

function handleQueue(args: QueueArgs): void {
  const state = readState(args.statePath);
  const rows = listQueue(state, args.assignee);
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("No queued or active tasks.");
    return;
  }
  for (const task of rows) printTask(task, false);
}

function handleTaskAdd(args: TaskWriteArgs): void {
  const state = readState(args.statePath);
  const task = upsertTask(state, {
    id: args.id,
    goalId: args.goalId,
    title: args.title,
    assignee: args.assignee,
    status: normalizeTaskStatus(args.status || "queued"),
    summary: args.summary,
    blockedReason: args.blockedReason,
    blockedBy: args.blockedBy,
  });
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, task }, null, 2));
    return;
  }
  console.log(`Recorded task ${task.id} in ${resolveStatePath(args.statePath)}`);
}

function handleTaskList(args: TaskListArgs): void {
  const state = readState(args.statePath);
  const statusFilter = args.status ? normalizeTaskStatus(args.status) : "";
  const rows = state.tasks.filter((task) => {
    if (args.goalId && task.goalId !== args.goalId) return false;
    if (args.assignee && task.assignee !== args.assignee) return false;
    if (statusFilter && task.status !== statusFilter) return false;
    return true;
  });
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("No tasks recorded.");
    return;
  }
  for (const task of rows) printTask(task, false);
}

function handleTaskSingle(args: TaskSingleArgs): void {
  const state = readState(args.statePath);
  const task = requireTask(state, args.id);
  if (args.command === "claim") {
    task.status = task.assignee ? "claimed" : "claimed";
    if (args.assignee) task.assignee = args.assignee;
  } else if (args.command === "reassign") {
    task.assignee = args.assignee;
    task.status = task.status === "done" ? "done" : "queued";
  } else if (args.command === "block") {
    task.status = "blocked";
    task.blockedReason = args.reason;
  } else if (args.command === "unblock") {
    task.status = "queued";
    task.blockedReason = "";
  } else if (args.command === "complete") {
    task.status = "done";
    task.blockedReason = "";
  }
  if (task.assignee) {
    const stateCheck = readState(args.statePath);
    if (!stateCheck.agents.find((agent) => agent.name === task.assignee)) {
      throw new Error(`Unknown agent: ${JSON.stringify(task.assignee)}`);
    }
  }
  task.updatedAt = new Date().toISOString();
  if (args.command === "claim" && !task.claimedAt) task.claimedAt = task.updatedAt;
  if (args.command === "complete") task.completedAt = task.updatedAt;
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, task }, null, 2));
    return;
  }
  console.log(`Updated task ${task.id} in ${resolveStatePath(args.statePath)}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "goal") {
    if (args.command === "list") handleGoalList(args);
    else if (args.command === "show") handleGoalShow(args);
    else if (args.command === "add") handleGoalAdd(args);
    else handleQueue(args);
    return;
  }
  if (args.command === "add") handleTaskAdd(args);
  else if (args.command === "list") handleTaskList(args);
  else handleTaskSingle(args);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
