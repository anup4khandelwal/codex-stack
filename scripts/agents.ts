#!/usr/bin/env bun
import process from "node:process";
import {
  buildDashboardReport,
  computeBudgetUsage,
  findAgent,
  findBudgetPolicy,
  findSession,
  normalizeAgentStatus,
  normalizeBudgetWindow,
  readState,
  resolveStatePath,
  upsertAgent,
  upsertBudgetPolicy,
  writeDashboard,
  writeState,
  type AgentRecord,
  type BudgetPolicyRecord,
} from "./control-plane.ts";

type Command = "list" | "show" | "add" | "update" | "dashboard" | "budget";
type BudgetCommand = "set" | "show";

interface BaseArgs {
  command: Command;
  json: boolean;
  statePath: string;
}

interface ListArgs extends BaseArgs {
  command: "list";
  team: string;
  status: string;
}

interface ShowArgs extends BaseArgs {
  command: "show";
  name: string;
}

interface WriteArgs extends BaseArgs {
  command: "add" | "update";
  name: string;
  runtime: string;
  role: string;
  repo: string;
  workspace: string;
  owner: string;
  team: string;
  manager: string;
  status: string;
  lastHeartbeat: string;
}

interface DashboardArgs extends BaseArgs {
  command: "dashboard";
  outDir: string;
}

interface BudgetSetArgs extends BaseArgs {
  command: "budget";
  budgetCommand: "set";
  agent: string;
  window: string;
  maxRuns: number;
  maxMinutes: number;
  maxCostUnits: number;
}

interface BudgetShowArgs extends BaseArgs {
  command: "budget";
  budgetCommand: "show";
  agent: string;
}

type ParsedArgs = ListArgs | ShowArgs | WriteArgs | DashboardArgs | BudgetSetArgs | BudgetShowArgs;

function usage(): never {
  console.log(`agents

Usage:
  bun src/cli.ts agents list [--team <name>] [--status <status>] [--state <path>] [--json]
  bun src/cli.ts agents show <name> [--state <path>] [--json]
  bun src/cli.ts agents add --name <name> --runtime <runtime> --role <role> [--repo <repo>] [--workspace <path>] [--owner <name>] [--team <team>] [--manager <agent>] [--status <idle|assigned|working|blocked|paused|offline>] [--last-heartbeat <iso>] [--state <path>] [--json]
  bun src/cli.ts agents update <name> [--runtime <runtime>] [--role <role>] [--repo <repo>] [--workspace <path>] [--owner <name>] [--team <team>] [--manager <agent>] [--status <idle|assigned|working|blocked|paused|offline>] [--last-heartbeat <iso>] [--state <path>] [--json]
  bun src/cli.ts agents dashboard [--out <dir>] [--state <path>] [--json]
  bun src/cli.ts agents budget set --agent <name> [--window <daily|weekly|monthly>] [--max-runs <n>] [--max-minutes <n>] [--max-cost-units <n>] [--state <path>] [--json]
  bun src/cli.ts agents budget show [--agent <name>] [--state <path>] [--json]
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
  if (argv[0] === "budget") return parseBudgetArgs(argv.slice(1));
  const command = clean(argv[0]) as Command;
  if (command === "list") {
    const out: ListArgs = { command, json: false, statePath: "", team: "", status: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--team") out.team = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "show") {
    const name = clean(argv[1]);
    if (!name) throw new Error("Pass the agent name.");
    const out: ShowArgs = { command, json: false, statePath: "", name };
    for (let i = 2; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "add" || command === "update") {
    const implicitName = command === "update" ? clean(argv[1]) : "";
    const startIndex = command === "update" ? 2 : 1;
    const out: WriteArgs = {
      command,
      json: false,
      statePath: "",
      name: implicitName,
      runtime: command === "add" ? "codex" : "",
      role: "",
      repo: "",
      workspace: "",
      owner: "",
      team: "",
      manager: "",
      status: command === "add" ? "idle" : "",
      lastHeartbeat: "",
    };
    for (let i = startIndex; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--name") out.name = clean(argv[++i]);
      else if (arg === "--runtime") out.runtime = clean(argv[++i]);
      else if (arg === "--role") out.role = clean(argv[++i]);
      else if (arg === "--repo") out.repo = clean(argv[++i]);
      else if (arg === "--workspace") out.workspace = clean(argv[++i]);
      else if (arg === "--owner") out.owner = clean(argv[++i]);
      else if (arg === "--team") out.team = clean(argv[++i]);
      else if (arg === "--manager") out.manager = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else if (arg === "--last-heartbeat") out.lastHeartbeat = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.name) throw new Error("--name is required.");
    if (out.command === "add" && !out.role) throw new Error("--role is required.");
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

function parseBudgetArgs(argv: string[]): ParsedArgs {
  const budgetCommand = clean(argv[0]) as BudgetCommand;
  if (budgetCommand === "set") {
    const out: BudgetSetArgs = {
      command: "budget",
      budgetCommand,
      json: false,
      statePath: "",
      agent: "",
      window: "weekly",
      maxRuns: 0,
      maxMinutes: 0,
      maxCostUnits: 0,
    };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else if (arg === "--window") out.window = clean(argv[++i]);
      else if (arg === "--max-runs") out.maxRuns = parseNumber(argv[++i], 0);
      else if (arg === "--max-minutes") out.maxMinutes = parseNumber(argv[++i], 0);
      else if (arg === "--max-cost-units") out.maxCostUnits = parseNumber(argv[++i], 0);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.agent) throw new Error("--agent is required.");
    return out;
  }
  if (budgetCommand === "show") {
    const out: BudgetShowArgs = { command: "budget", budgetCommand, json: false, statePath: "", agent: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  usage();
}

function printAgent(agent: AgentRecord, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(agent, null, 2));
    return;
  }
  console.log(`${agent.name}\t${agent.role}\t${agent.runtime}\t${agent.team || "-"}\t${agent.manager || "-"}\t${agent.status}`);
}

function listAgents(args: ListArgs): void {
  const state = readState(args.statePath);
  const statusFilter = args.status ? normalizeAgentStatus(args.status) : "";
  const records = state.agents.filter((agent) => {
    if (args.team && agent.team !== args.team) return false;
    if (statusFilter && agent.status !== statusFilter) return false;
    return true;
  });
  if (args.json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  if (!records.length) {
    console.log("No agents registered.");
    return;
  }
  for (const agent of records) printAgent(agent, false);
}

function showAgent(args: ShowArgs): void {
  const state = readState(args.statePath);
  const agent = findAgent(state, args.name);
  if (!agent) throw new Error(`Unknown agent: ${JSON.stringify(args.name)}`);
  const payload = {
    ...agent,
    session: findSession(state, agent.name) || null,
    budget: findBudgetPolicy(state, agent.name)
      ? {
          policy: findBudgetPolicy(state, agent.name),
          usage: computeBudgetUsage(state, findBudgetPolicy(state, agent.name) as BudgetPolicyRecord),
        }
      : null,
  };
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  printAgent(agent, false);
  console.log(`Session next action: ${payload.session?.nextAction || "-"}`);
  console.log(`Budget: ${payload.budget ? `${payload.budget.usage.runs} runs/${payload.budget.usage.minutes} min/${payload.budget.usage.costUnits} cost` : "-"}`);
}

function writeAgent(args: WriteArgs): void {
  const state = readState(args.statePath);
  const existing = findAgent(state, args.name);
  const record = upsertAgent(state, {
    name: args.name,
    runtime: args.runtime || existing?.runtime || "codex",
    role: args.role || existing?.role || "worker",
    repo: args.repo || existing?.repo || "",
    workspace: args.workspace || existing?.workspace || "",
    owner: args.owner || existing?.owner || "",
    team: args.team || existing?.team || "",
    manager: args.manager || (args.command === "update" ? existing?.manager || "" : ""),
    status: normalizeAgentStatus(args.status || existing?.status || "idle"),
    lastHeartbeat: args.lastHeartbeat || existing?.lastHeartbeat || "",
  });
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, agent: record }, null, 2));
    return;
  }
  console.log(`${args.command === "add" ? "Registered" : "Updated"} agent ${record.name} in ${resolveStatePath(args.statePath)}`);
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

function budgetSet(args: BudgetSetArgs): void {
  const state = readState(args.statePath);
  const record = upsertBudgetPolicy(state, {
    agent: args.agent,
    window: normalizeBudgetWindow(args.window || "weekly"),
    maxRuns: args.maxRuns,
    maxMinutes: args.maxMinutes,
    maxCostUnits: args.maxCostUnits,
  });
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, budget: record }, null, 2));
    return;
  }
  console.log(`Updated budget policy for ${record.agent} in ${resolveStatePath(args.statePath)}`);
}

function budgetShow(args: BudgetShowArgs): void {
  const state = readState(args.statePath);
  const rows = state.budgets
    .filter((policy) => !args.agent || policy.agent === args.agent)
    .map((policy) => ({
      policy,
      usage: computeBudgetUsage(state, policy),
    }));
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("No budget policies configured.");
    return;
  }
  for (const row of rows) {
    console.log(`${row.policy.agent}\t${row.policy.window}\t${row.usage.runs}/${row.policy.maxRuns || "-"} runs\t${row.usage.minutes}/${row.policy.maxMinutes || "-"} min\t${row.usage.costUnits}/${row.policy.maxCostUnits || "-"} cost\t${row.usage.exceeded ? "exceeded" : "within-limit"}`);
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "list") listAgents(args);
  else if (args.command === "show") showAgent(args);
  else if (args.command === "add" || args.command === "update") writeAgent(args);
  else if (args.command === "dashboard") dashboard(args);
  else if (args.command === "budget" && args.budgetCommand === "set") budgetSet(args);
  else if (args.command === "budget" && args.budgetCommand === "show") budgetShow(args);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
