#!/usr/bin/env bun
import fs from "node:fs";
import process from "node:process";
import path from "node:path";
import { execSync, spawnSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";

interface RunOptions extends Partial<ExecSyncOptionsWithStringEncoding> {
  allowFailure?: boolean;
}

interface ParsedArgs {
  command: string;
  issueNumber: number;
  title: string;
  body: string;
  bodyFile: string;
  labels: string[];
  assignees: string[];
  milestone: string;
  repo: string;
  prefix: string;
  base: string;
  json: boolean;
  noFetch: boolean;
  noCheckout: boolean;
}

interface IssueRecord {
  repo: string;
  number: number;
  title: string;
  url: string;
}

interface BranchRecord {
  branch: string;
  baseRef: string;
  checkedOut: boolean;
}

interface BranchInput {
  issueNumber: number;
  title: string;
  prefix: string;
  base: string;
  noFetch: boolean;
  noCheckout: boolean;
}

interface IssueFlowResult {
  command: string;
  issue: IssueRecord | null;
  branch: BranchRecord | null;
}

function usage(): never {
  console.log(`issue-flow

Usage:
  bun scripts/issue-flow.ts create --title <title> [--body <text>] [--body-file <path>] [--label <name>] [--assignee <user>] [--milestone <title>] [--repo <owner/name>] [--json]
  bun scripts/issue-flow.ts branch <number> [--title <title>] [--prefix <name>] [--base <ref>] [--no-fetch] [--no-checkout] [--json]
  bun scripts/issue-flow.ts start --title <title> [--body <text>] [--body-file <path>] [--label <name>] [--assignee <user>] [--milestone <title>] [--repo <owner/name>] [--prefix <name>] [--base <ref>] [--no-fetch] [--json]
`);
  process.exit(0);
}

function quote(value: unknown): string {
  return JSON.stringify(String(value));
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function run(cmd: string, options: RunOptions = {}): string {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error: unknown) {
    if (options.allowFailure) return "";
    const stderr = typeof error === "object" && error && "stderr" in error ? String((error as { stderr?: unknown }).stderr || "") : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(clean(stderr || message));
  }
}

function runArgs(program: string, args: string[]): string {
  const result = spawnSync(program, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(clean(result.stderr || result.stdout || `${program} exited with status ${result.status ?? 1}`));
  }
  return clean(result.stdout || "");
}

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => clean(item)).filter(Boolean))];
}

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "work-item";
}

function inferRepo(): string {
  if (process.env.GITHUB_REPOSITORY) return clean(process.env.GITHUB_REPOSITORY);
  const remote = run("git remote get-url origin", { allowFailure: true });
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : "";
}

function resolveBaseRef(base: string): string {
  const candidates = [clean(base), "origin/main", "main", "origin/master", "master"].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = run(`git rev-parse --verify ${quote(candidate)}`, { allowFailure: true });
    if (resolved) return candidate;
  }
  throw new Error("Unable to resolve a base ref. Pass --base explicitly.");
}

function maybeFetch(baseRef: string, noFetch: boolean): void {
  if (noFetch) return;
  const remoteMatch = String(baseRef || "").match(/^([^/]+)\/(.+)$/);
  if (!remoteMatch) return;
  run(`git fetch ${quote(remoteMatch[1])} ${quote(remoteMatch[2])}`, { allowFailure: true });
}

function parseUrlIssue(url: string): number {
  const match = String(url || "").match(/\/issues\/(\d+)(?:$|[?#])/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = clean(argv[0]);
  if (!command || command === "--help" || command === "-h") usage();

  const out: ParsedArgs = {
    command,
    issueNumber: 0,
    title: "",
    body: "",
    bodyFile: "",
    labels: [],
    assignees: [],
    milestone: "",
    repo: "",
    prefix: "feat",
    base: "main",
    json: false,
    noFetch: false,
    noCheckout: false,
  };

  const rest = argv.slice(1);
  if (command === "branch") {
    const rawIssue = rest.shift();
    out.issueNumber = Number.parseInt(rawIssue || "", 10);
    if (!out.issueNumber) {
      throw new Error("`branch` requires an issue number.");
    }
  }

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--title") {
      out.title = rest[i + 1] || "";
      i += 1;
    } else if (arg === "--body") {
      out.body = rest[i + 1] || "";
      i += 1;
    } else if (arg === "--body-file") {
      out.bodyFile = rest[i + 1] || "";
      i += 1;
    } else if (arg === "--label") {
      out.labels.push(rest[i + 1] || "");
      i += 1;
    } else if (arg === "--assignee") {
      out.assignees.push(rest[i + 1] || "");
      i += 1;
    } else if (arg === "--milestone") {
      out.milestone = rest[i + 1] || "";
      i += 1;
    } else if (arg === "--repo") {
      out.repo = rest[i + 1] || "";
      i += 1;
    } else if (arg === "--prefix") {
      out.prefix = rest[i + 1] || out.prefix;
      i += 1;
    } else if (arg === "--base") {
      out.base = rest[i + 1] || out.base;
      i += 1;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--no-fetch") {
      out.noFetch = true;
    } else if (arg === "--no-checkout") {
      out.noCheckout = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }

  out.labels = uniq(out.labels);
  out.assignees = uniq(out.assignees);
  out.repo = clean(out.repo) || inferRepo();
  out.title = clean(out.title);
  out.milestone = clean(out.milestone);
  out.prefix = clean(out.prefix) || "feat";
  return out;
}

function loadBody(args: ParsedArgs): string {
  if (args.bodyFile) {
    return fs.readFileSync(path.resolve(process.cwd(), args.bodyFile), "utf8");
  }
  return args.body;
}

function createIssue(args: ParsedArgs): IssueRecord {
  if (!args.repo) {
    throw new Error("Unable to infer GitHub repo. Pass --repo <owner/name>.");
  }
  if (!args.title) {
    throw new Error("`create` and `start` require --title.");
  }

  const body = loadBody(args);
  const ghArgs = [
    "issue",
    "create",
    "--repo",
    args.repo,
    "--title",
    args.title,
  ];
  if (body) ghArgs.push("--body", body);
  for (const label of args.labels) ghArgs.push("--label", label);
  for (const assignee of args.assignees) ghArgs.push("--assignee", assignee);
  if (args.milestone) ghArgs.push("--milestone", args.milestone);

  const issueUrl = clean(runArgs("gh", ghArgs));
  const issueNumber = parseUrlIssue(issueUrl);
  return {
    repo: args.repo,
    number: issueNumber,
    url: issueUrl,
    title: args.title,
  };
}

function issueTitle(repo: string, issueNumber: number, fallbackTitle: string): string {
  if (fallbackTitle) return fallbackTitle;
  if (!repo || !issueNumber) {
    throw new Error("Issue title is required when repo lookup is unavailable.");
  }
  const title = clean(runArgs("gh", ["issue", "view", String(issueNumber), "--repo", repo, "--json", "title", "--jq", ".title"]));
  if (!title) {
    throw new Error(`Unable to load title for issue #${issueNumber}.`);
  }
  return title;
}

function createBranch({ issueNumber, title, prefix, base, noFetch, noCheckout }: BranchInput): BranchRecord {
  const baseRef = resolveBaseRef(base);
  maybeFetch(baseRef, noFetch);
  const branchName = `${prefix}/${issueNumber}-${slugify(title)}`;
  if (!noCheckout) {
    run(`git checkout -B ${quote(branchName)} ${quote(baseRef)}`);
  }
  return {
    branch: branchName,
    baseRef,
    checkedOut: !noCheckout,
  };
}

function printText(result: IssueFlowResult): void {
  console.log("# Issue Flow");
  console.log();
  if (result.issue?.number) console.log(`- Issue: #${result.issue.number}`);
  if (result.issue?.url) console.log(`- Issue URL: ${result.issue.url}`);
  if (result.issue?.title) console.log(`- Title: ${result.issue.title}`);
  if (result.branch?.branch) console.log(`- Branch: ${result.branch.branch}`);
  if (result.branch?.baseRef) console.log(`- Base: ${result.branch.baseRef}`);
  if (result.branch?.checkedOut === false) console.log("- Checkout: skipped");
}

const args = parseArgs(process.argv.slice(2));
const result: IssueFlowResult = {
  command: args.command,
  issue: null,
  branch: null,
};

if (args.command === "create") {
  result.issue = createIssue(args);
} else if (args.command === "branch") {
  const title = issueTitle(args.repo, args.issueNumber, args.title);
  result.issue = {
    repo: args.repo,
    number: args.issueNumber,
    title,
    url: args.repo ? `https://github.com/${args.repo}/issues/${args.issueNumber}` : "",
  };
  result.branch = createBranch({
    issueNumber: args.issueNumber,
    title,
    prefix: args.prefix,
    base: args.base,
    noFetch: args.noFetch,
    noCheckout: args.noCheckout,
  });
} else if (args.command === "start") {
  result.issue = createIssue(args);
  result.branch = createBranch({
    issueNumber: result.issue.number,
    title: result.issue.title,
    prefix: args.prefix,
    base: args.base,
    noFetch: args.noFetch,
    noCheckout: args.noCheckout,
  });
} else {
  usage();
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printText(result);
}
