#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { execSync } from "node:child_process";

function usage() {
  console.log(`issue-flow

Usage:
  bun scripts/issue-flow.mjs create --title <title> [--body <text>] [--body-file <path>] [--label <name>] [--assignee <user>] [--milestone <title>] [--repo <owner/name>] [--json]
  bun scripts/issue-flow.mjs branch <number> [--title <title>] [--prefix <name>] [--base <ref>] [--no-fetch] [--no-checkout] [--json]
  bun scripts/issue-flow.mjs start --title <title> [--body <text>] [--body-file <path>] [--label <name>] [--assignee <user>] [--milestone <title>] [--repo <owner/name>] [--prefix <name>] [--base <ref>] [--no-fetch] [--json]
`);
  process.exit(0);
}

function quote(value) {
  return JSON.stringify(String(value));
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    const stderr = error.stderr ? String(error.stderr) : "";
    throw new Error(clean(stderr || error.message));
  }
}

function uniq(items) {
  return [...new Set(items.map((item) => clean(item)).filter(Boolean))];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "work-item";
}

function inferRepo() {
  if (process.env.GITHUB_REPOSITORY) return clean(process.env.GITHUB_REPOSITORY);
  const remote = run("git remote get-url origin", { allowFailure: true });
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : "";
}

function resolveBaseRef(base) {
  const candidates = [clean(base), "origin/main", "main", "origin/master", "master"].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = run(`git rev-parse --verify ${quote(candidate)}`, { allowFailure: true });
    if (resolved) return candidate;
  }
  throw new Error("Unable to resolve a base ref. Pass --base explicitly.");
}

function maybeFetch(baseRef, noFetch) {
  if (noFetch) return;
  const remoteMatch = String(baseRef || "").match(/^([^/]+)\/(.+)$/);
  if (!remoteMatch) return;
  run(`git fetch ${quote(remoteMatch[1])} ${quote(remoteMatch[2])}`, { allowFailure: true });
}

function parseUrlIssue(url) {
  const match = String(url || "").match(/\/issues\/(\d+)(?:$|[?#])/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseArgs(argv) {
  const command = clean(argv[0]);
  if (!command || command === "--help" || command === "-h") usage();
  const out = {
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

function loadBody(args) {
  if (args.bodyFile) {
    return run(`cat ${quote(path.resolve(process.cwd(), args.bodyFile))}`);
  }
  return args.body;
}

function createIssue(args) {
  if (!args.repo) {
    throw new Error("Unable to infer GitHub repo. Pass --repo <owner/name>.");
  }
  if (!args.title) {
    throw new Error("`create` and `start` require --title.");
  }

  const body = loadBody(args);
  const cmd = [
    "gh issue create",
    `--repo ${quote(args.repo)}`,
    `--title ${quote(args.title)}`,
  ];
  if (body) cmd.push(`--body ${quote(body)}`);
  for (const label of args.labels) cmd.push(`--label ${quote(label)}`);
  for (const assignee of args.assignees) cmd.push(`--assignee ${quote(assignee)}`);
  if (args.milestone) cmd.push(`--milestone ${quote(args.milestone)}`);

  const issueUrl = clean(run(cmd.join(" ")));
  const issueNumber = parseUrlIssue(issueUrl);
  return {
    repo: args.repo,
    number: issueNumber,
    url: issueUrl,
    title: args.title,
  };
}

function issueTitle(repo, issueNumber, fallbackTitle) {
  if (fallbackTitle) return fallbackTitle;
  if (!repo || !issueNumber) {
    throw new Error("Issue title is required when repo lookup is unavailable.");
  }
  const title = clean(run(`gh issue view ${quote(String(issueNumber))} --repo ${quote(repo)} --json title --jq .title`));
  if (!title) {
    throw new Error(`Unable to load title for issue #${issueNumber}.`);
  }
  return title;
}

function createBranch({ issueNumber, title, prefix, base, noFetch, noCheckout }) {
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

function printText(result) {
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
const result = {
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
