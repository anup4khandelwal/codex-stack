#!/usr/bin/env bun
import process from "node:process";
import {
  buildApprovalGate,
  normalizeApprovalKind,
  normalizeApprovalStatus,
  readState,
  requestApproval,
  resolveApproval,
  resolveStatePath,
  writeState,
} from "./control-plane.ts";

type Command = "request" | "list" | "show" | "approve" | "reject" | "cancel" | "gate";

type ParsedArgs = RequestArgs | ListArgs | ShowArgs | ResolveArgs | GateArgs;

interface BaseArgs {
  command: Command;
  json: boolean;
  statePath: string;
}

interface RequestArgs extends BaseArgs {
  command: "request";
  agent: string;
  kind: string;
  target: string;
  summary: string;
  requestedBy: string;
}

interface ListArgs extends BaseArgs {
  command: "list";
  agent: string;
  kind: string;
  status: string;
}

interface ShowArgs extends BaseArgs {
  command: "show";
  id: string;
}

interface ResolveArgs extends BaseArgs {
  command: "approve" | "reject" | "cancel";
  id: string;
  by: string;
  note: string;
}

interface GateArgs extends BaseArgs {
  command: "gate";
  agent: string;
  kind: string;
  target: string;
}

function usage(): never {
  console.log(`approvals

Usage:
  bun src/cli.ts approvals request --agent <name> --kind <ship-pr|merge-pr|update-snapshot|fleet-remediate|budget-override|custom> [--target <id>] --summary <text> [--requested-by <name>] [--state <path>] [--json]
  bun src/cli.ts approvals list [--agent <name>] [--kind <kind>] [--status <pending|approved|rejected|cancelled>] [--state <path>] [--json]
  bun src/cli.ts approvals show <id> [--state <path>] [--json]
  bun src/cli.ts approvals approve <id> --by <name> [--note <text>] [--state <path>] [--json]
  bun src/cli.ts approvals reject <id> --by <name> [--note <text>] [--state <path>] [--json]
  bun src/cli.ts approvals cancel <id> --by <name> [--note <text>] [--state <path>] [--json]
  bun src/cli.ts approvals gate --agent <name> --kind <kind> [--target <id>] [--state <path>] [--json]
`);
  process.exit(0);
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseArgs(argv: string[]): ParsedArgs {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
  const command = clean(argv[0]) as Command;
  if (command === "request") {
    const out: RequestArgs = { command, json: false, statePath: "", agent: "", kind: "custom", target: "", summary: "", requestedBy: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else if (arg === "--kind") out.kind = clean(argv[++i]);
      else if (arg === "--target") out.target = clean(argv[++i]);
      else if (arg === "--summary") out.summary = clean(argv[++i]);
      else if (arg === "--requested-by") out.requestedBy = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.agent || !out.summary) throw new Error("--agent and --summary are required.");
    return out;
  }
  if (command === "list") {
    const out: ListArgs = { command, json: false, statePath: "", agent: "", kind: "", status: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else if (arg === "--kind") out.kind = clean(argv[++i]);
      else if (arg === "--status") out.status = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "show") {
    const id = clean(argv[1]);
    if (!id) throw new Error("Pass the approval id.");
    const out: ShowArgs = { command, json: false, statePath: "", id };
    for (let i = 2; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }
  if (command === "approve" || command === "reject" || command === "cancel") {
    const id = clean(argv[1]);
    if (!id) throw new Error("Pass the approval id.");
    const out: ResolveArgs = { command, json: false, statePath: "", id, by: "", note: "" };
    for (let i = 2; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--by") out.by = clean(argv[++i]);
      else if (arg === "--note") out.note = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.by) throw new Error("--by is required.");
    return out;
  }
  if (command === "gate") {
    const out: GateArgs = { command, json: false, statePath: "", agent: "", kind: "custom", target: "" };
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--state") out.statePath = clean(argv[++i]);
      else if (arg === "--agent") out.agent = clean(argv[++i]);
      else if (arg === "--kind") out.kind = clean(argv[++i]);
      else if (arg === "--target") out.target = clean(argv[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.agent) throw new Error("--agent is required.");
    return out;
  }
  usage();
}

function listApprovals(args: ListArgs): void {
  const state = readState(args.statePath);
  const kindFilter = args.kind ? normalizeApprovalKind(args.kind) : "";
  const statusFilter = args.status ? normalizeApprovalStatus(args.status) : "";
  const rows = state.approvals.filter((approval) => {
    if (args.agent && approval.agent !== args.agent) return false;
    if (kindFilter && approval.kind !== kindFilter) return false;
    if (statusFilter && approval.status !== statusFilter) return false;
    return true;
  });
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (!rows.length) {
    console.log("No approvals recorded.");
    return;
  }
  for (const row of rows) {
    console.log(`${row.id}\t${row.agent}\t${row.kind}\t${row.target || "-"}\t${row.status}\t${row.summary}`);
  }
}

function request(args: RequestArgs): void {
  const state = readState(args.statePath);
  const record = requestApproval(state, {
    agent: args.agent,
    kind: normalizeApprovalKind(args.kind || "custom"),
    target: args.target || args.agent,
    summary: args.summary,
    requestedBy: args.requestedBy || args.agent,
  });
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, approval: record }, null, 2));
    return;
  }
  console.log(`Requested approval ${record.id} in ${resolveStatePath(args.statePath)}`);
}

function show(args: ShowArgs): void {
  const state = readState(args.statePath);
  const row = state.approvals.find((approval) => approval.id === args.id);
  if (!row) throw new Error(`Unknown approval: ${JSON.stringify(args.id)}`);
  if (args.json) {
    console.log(JSON.stringify(row, null, 2));
    return;
  }
  console.log(`${row.id}\t${row.agent}\t${row.kind}\t${row.status}\t${row.summary}`);
}

function resolve(args: ResolveArgs): void {
  const state = readState(args.statePath);
  const status = args.command === "approve" ? "approved" : args.command === "reject" ? "rejected" : "cancelled";
  const row = resolveApproval(state, args.id, status, args.by, args.note);
  const statePath = writeState(state, args.statePath);
  if (args.json) {
    console.log(JSON.stringify({ statePath, approval: row }, null, 2));
    return;
  }
  console.log(`${status} approval ${row.id}`);
}

function gate(args: GateArgs): void {
  const state = readState(args.statePath);
  const payload = buildApprovalGate(state, {
    agent: args.agent,
    kind: normalizeApprovalKind(args.kind || "custom"),
    target: args.target || args.agent,
  });
  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`${payload.allowed ? "allowed" : "blocked"}\tapproved=${payload.approved?.id || "-"}\tpending=${payload.pending?.id || "-"}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "request") request(args);
  else if (args.command === "list") listApprovals(args);
  else if (args.command === "show") show(args);
  else if (args.command === "approve" || args.command === "reject" || args.command === "cancel") resolve(args);
  else if (args.command === "gate") gate(args);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
