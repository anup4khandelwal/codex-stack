#!/usr/bin/env bun
import process from "node:process";
import {
  buildDecisionRecord,
  defaultAuthor,
  filterDecisionRecords,
  isDecisionExpired,
  isDecisionExpiringSoon,
  readDecisionRecords,
  removeDecisionFile,
  type QaDecisionCategory,
  type QaDecisionKind,
  type QaDecisionRecord,
  type QaDecisionType,
  writeDecisionRecord,
} from "./qa-decisions.ts";

type Subcommand = "approve" | "suppress" | "list" | "prune-expired";

interface WriteArgs {
  command: "approve" | "suppress";
  json: boolean;
  category: QaDecisionCategory;
  kind: QaDecisionKind;
  decisionType: QaDecisionType;
  snapshot: string;
  routePath: string;
  device: string;
  reason: string;
  author: string;
  selectors: string[];
  ruleId: string;
  metric: string;
  title: string;
  reviewAfter: string;
  expiresAt: string;
}

interface ListArgs {
  command: "list";
  json: boolean;
  category: QaDecisionCategory | "";
  kind: QaDecisionKind | "";
  snapshot: string;
  routePath: string;
  device: string;
  activeOnly: boolean;
}

interface PruneArgs {
  command: "prune-expired";
  json: boolean;
}

type ParsedArgs = WriteArgs | ListArgs | PruneArgs;

function usage(): never {
  console.log(`qa-decide

Usage:
  bun src/cli.ts qa-decide approve --snapshot <name> --route <path> --device <device> --reason <text> [--kind <snapshot-drift|missing-selectors|stale-baseline|accessibility-rule|performance-budget>] [--category <visual|accessibility|performance>] [--selector <css>] [--rule <axe-rule>] [--metric <name>] [--title <text>] [--review-after <iso>] [--expires-at <iso>] [--decision-type <approve-current|refresh-required>] [--author <name>] [--json]
  bun src/cli.ts qa-decide suppress --snapshot <name> --route <path> --device <device> --reason <text> [--kind <...>] [--category <...>] [--selector <css>] [--rule <axe-rule>] [--metric <name>] [--title <text>] [--review-after <iso>] [--expires-at <iso>] [--author <name>] [--json]
  bun src/cli.ts qa-decide list [--category <visual|accessibility|performance>] [--kind <...>] [--snapshot <name>] [--route <path>] [--device <device>] [--active-only] [--json]
  bun src/cli.ts qa-decide prune-expired [--json]
`);
  process.exit(0);
}

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseCategory(value: string): QaDecisionCategory {
  const normalized = cleanSubject(value).toLowerCase();
  if (normalized === "visual" || normalized === "accessibility" || normalized === "performance") return normalized;
  throw new Error(`Unknown category: ${JSON.stringify(value)}`);
}

function parseKind(value: string): QaDecisionKind {
  const normalized = cleanSubject(value).toLowerCase();
  if (
    normalized === "snapshot-drift"
    || normalized === "missing-selectors"
    || normalized === "stale-baseline"
    || normalized === "accessibility-rule"
    || normalized === "performance-budget"
  ) {
    return normalized;
  }
  throw new Error(`Unknown kind: ${JSON.stringify(value)}`);
}

function parseDecisionType(value: string): QaDecisionType {
  const normalized = cleanSubject(value).toLowerCase();
  if (normalized === "approve-current" || normalized === "suppress" || normalized === "refresh-required") return normalized;
  throw new Error(`Unknown decision type: ${JSON.stringify(value)}`);
}

function printRecords(records: QaDecisionRecord[], json: boolean): void {
  const enriched = records.map((record) => ({
    ...record,
    expired: isDecisionExpired(record),
    expiringSoon: isDecisionExpiringSoon(record),
  }));
  if (json) {
    console.log(JSON.stringify(enriched, null, 2));
    return;
  }
  if (!enriched.length) {
    console.log("No baseline decisions found.");
    return;
  }
  for (const record of enriched) {
    const flags = [record.expired ? "expired" : "active", record.expiringSoon ? "expiring-soon" : ""]
      .filter(Boolean)
      .join(", ");
    console.log(`${record.id}\t${record.decision}\t${record.category}/${record.kind}\t${record.snapshot || "-"}\t${record.routePath}\t${record.device}\t${flags}\t${record.file}`);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) usage();
  const command = cleanSubject(argv[0]) as Subcommand;
  if (command === "approve" || command === "suppress") {
    const out: WriteArgs = {
      command,
      json: false,
      category: "visual",
      kind: "snapshot-drift",
      decisionType: command === "suppress" ? "suppress" : "approve-current",
      snapshot: "",
      routePath: "/",
      device: "desktop",
      reason: "",
      author: defaultAuthor(),
      selectors: [],
      ruleId: "",
      metric: "",
      title: "",
      reviewAfter: "",
      expiresAt: "",
    };
    const rest = argv.slice(1);
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--category") out.category = parseCategory(rest[++i] || "");
      else if (arg === "--kind") out.kind = parseKind(rest[++i] || "");
      else if (arg === "--decision-type") out.decisionType = parseDecisionType(rest[++i] || "");
      else if (arg === "--snapshot") out.snapshot = cleanSubject(rest[++i]);
      else if (arg === "--route") out.routePath = cleanSubject(rest[++i] || "/") || "/";
      else if (arg === "--device") out.device = cleanSubject(rest[++i] || "desktop") || "desktop";
      else if (arg === "--reason") out.reason = cleanSubject(rest[++i]);
      else if (arg === "--author") out.author = cleanSubject(rest[++i]);
      else if (arg === "--selector") out.selectors.push(cleanSubject(rest[++i]));
      else if (arg === "--rule") out.ruleId = cleanSubject(rest[++i]);
      else if (arg === "--metric") out.metric = cleanSubject(rest[++i]).toLowerCase();
      else if (arg === "--title") out.title = cleanSubject(rest[++i]);
      else if (arg === "--review-after") out.reviewAfter = cleanSubject(rest[++i]);
      else if (arg === "--expires-at") out.expiresAt = cleanSubject(rest[++i]);
      else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!out.reason) throw new Error("--reason is required.");
    if (out.command === "suppress") out.decisionType = "suppress";
    if (out.category === "accessibility" || out.kind === "accessibility-rule") {
      out.category = "accessibility";
      out.kind = "accessibility-rule";
      if (!out.ruleId) throw new Error("--rule is required for accessibility decisions.");
    }
    if (out.category === "performance" || out.kind === "performance-budget") {
      out.category = "performance";
      out.kind = "performance-budget";
      if (!out.metric) throw new Error("--metric is required for performance decisions.");
    }
    if (out.decisionType === "suppress" && out.command !== "suppress") {
      throw new Error("Use `qa-decide suppress` instead of `approve --decision-type suppress`.");
    }
    return out;
  }

  if (command === "list") {
    const out: ListArgs = {
      command,
      json: false,
      category: "",
      kind: "",
      snapshot: "",
      routePath: "",
      device: "",
      activeOnly: false,
    };
    const rest = argv.slice(1);
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === "--json") out.json = true;
      else if (arg === "--category") out.category = parseCategory(rest[++i] || "");
      else if (arg === "--kind") out.kind = parseKind(rest[++i] || "");
      else if (arg === "--snapshot") out.snapshot = cleanSubject(rest[++i]);
      else if (arg === "--route") out.routePath = cleanSubject(rest[++i]);
      else if (arg === "--device") out.device = cleanSubject(rest[++i]);
      else if (arg === "--active-only") out.activeOnly = true;
      else throw new Error(`Unknown argument: ${arg}`);
    }
    return out;
  }

  if (command === "prune-expired") {
    return { command, json: argv.includes("--json") };
  }

  usage();
}

function writeDecision(args: WriteArgs): void {
  const record = writeDecisionRecord(
    buildDecisionRecord({
      decision: args.decisionType,
      category: args.category,
      kind: args.kind,
      snapshot: args.snapshot,
      routePath: args.routePath,
      device: args.device,
      reason: args.reason,
      author: args.author,
      selectors: args.selectors,
      ruleId: args.ruleId,
      metric: args.metric,
      title: args.title,
      reviewAfter: args.reviewAfter,
      expiresAt: args.expiresAt,
    }),
  );
  if (args.json) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  console.log(`Wrote ${record.decision} decision: ${record.file}`);
}

function listDecisions(args: ListArgs): void {
  const records = readDecisionRecords({
    filters: {
      category: args.category || undefined,
      kind: args.kind || undefined,
      snapshot: args.snapshot || undefined,
      routePath: args.routePath || undefined,
      device: args.device || undefined,
      activeOnly: args.activeOnly,
    },
  });
  printRecords(records, args.json);
}

function pruneExpired(json: boolean): void {
  const records = readDecisionRecords();
  const expired = filterDecisionRecords(records, {}).filter((record) => isDecisionExpired(record));
  const removed = expired.filter((record) => removeDecisionFile(record));
  if (json) {
    console.log(JSON.stringify({ removed: removed.map((record) => record.file), count: removed.length }, null, 2));
    return;
  }
  if (!removed.length) {
    console.log("No expired baseline decisions were removed.");
    return;
  }
  console.log(`Removed ${removed.length} expired decision file(s):`);
  for (const record of removed) {
    console.log(`- ${record.file}`);
  }
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "approve" || parsed.command === "suppress") {
    writeDecision(parsed);
    return;
  }
  if (parsed.command === "list") {
    listDecisions(parsed);
    return;
  }
  pruneExpired(parsed.json);
}

main();
