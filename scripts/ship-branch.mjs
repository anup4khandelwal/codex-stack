#!/usr/bin/env node
import process from "node:process";
import { execSync } from "node:child_process";

function usage() {
  console.log(`ship-branch

Usage:
  node scripts/ship-branch.mjs [--dry-run] [--skip-tests] [--base <ref>] [--message <msg>] [--push] [--pr] [--title <title>] [--body <body>] [--json]
`);
  process.exit(0);
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
    throw new Error(stderr || error.message);
  }
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    skipTests: false,
    push: false,
    pr: false,
    json: false,
    base: "origin/main",
    message: "",
    title: "",
    body: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--skip-tests") out.skipTests = true;
    else if (arg === "--push") out.push = true;
    else if (arg === "--pr") out.pr = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--base") {
      out.base = argv[i + 1] || out.base;
      i += 1;
    } else if (arg === "--message") {
      out.message = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--title") {
      out.title = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--body") {
      out.body = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  return out;
}

function detectValidationCommand() {
  const options = [
    "npm run smoke",
    "npm test",
  ];
  for (const cmd of options) {
    const exists = run(`${cmd.split(" ").slice(0, 2).join(" ")} --silent`, { allowFailure: true });
    if (cmd === "npm run smoke" && run("node -p \"Boolean(require('./package.json').scripts && require('./package.json').scripts.smoke)\"", { allowFailure: true }) === "true") {
      return cmd;
    }
    if (cmd === "npm test" && run("node -p \"Boolean(require('./package.json').scripts && require('./package.json').scripts.test)\"", { allowFailure: true }) === "true") {
      return cmd;
    }
    if (exists) return cmd;
  }
  return "";
}

function printText(result) {
  console.log("# Ship Summary");
  console.log();
  console.log(`- Branch: ${result.branch}`);
  console.log(`- Base: ${result.base}`);
  console.log(`- Validation: ${result.validation.command || "none"}`);
  console.log(`- Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`- Dirty before commit: ${result.dirtyBefore ? "yes" : "no"}`);
  console.log();
  for (const step of result.steps) {
    console.log(`- ${step}`);
  }
  if (result.prUrl) {
    console.log(`- PR: ${result.prUrl}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const result = {
  status: "ok",
  branch: "",
  base: args.base,
  dryRun: args.dryRun,
  dirtyBefore: false,
  validation: { command: "", passed: null },
  prUrl: "",
  steps: [],
};

result.branch = run("git branch --show-current");
if (!result.branch) {
  console.error("Unable to determine current branch.");
  process.exit(1);
}

if (["main", "master"].includes(result.branch)) {
  console.error("Refusing to ship from the default branch.");
  process.exit(1);
}

result.steps.push(`fetch ${args.base}`);
if (!args.dryRun) {
  run(`git fetch ${args.base.startsWith("origin/") ? "origin" : "origin"} ${args.base.split("/").slice(1).join("/") || "main"}`, { allowFailure: true });
}

const validationCommand = args.skipTests ? "" : detectValidationCommand();
result.validation.command = validationCommand;
if (validationCommand) {
  result.steps.push(`validate via ${validationCommand}`);
  if (!args.dryRun) {
    run(validationCommand, { stdio: "inherit" });
    result.validation.passed = true;
  }
}

const dirty = run("git status --porcelain", { allowFailure: true });
result.dirtyBefore = Boolean(dirty);

if (dirty && !args.message && (args.push || args.pr)) {
  console.error("Working tree has changes. Pass --message to create a commit before push/PR.");
  process.exit(1);
}

if (dirty && args.message) {
  result.steps.push(`commit with message "${args.message}"`);
  if (!args.dryRun) {
    run("git add -A");
    run(`git commit -m ${JSON.stringify(args.message)}`);
  }
}

if (args.push || args.pr) {
  result.steps.push(`push branch ${result.branch}`);
  if (!args.dryRun) {
    run(`git push -u origin ${result.branch}`, { stdio: "inherit" });
  }
}

if (args.pr) {
  result.steps.push("open pull request");
  if (!args.dryRun) {
    const prCmd = args.title
      ? `gh pr create --base ${args.base.replace(/^origin\//, "")} --head ${result.branch} --title ${JSON.stringify(args.title)}${args.body ? ` --body ${JSON.stringify(args.body)}` : ""}`
      : `gh pr create --base ${args.base.replace(/^origin\//, "")} --head ${result.branch} --fill`;
    result.prUrl = run(prCmd, { stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/).at(-1) || "";
  }
}

if (args.json) console.log(JSON.stringify(result, null, 2));
else printText(result);
