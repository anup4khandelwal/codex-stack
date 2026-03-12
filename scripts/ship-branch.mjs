#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

const TEMPLATE_PATHS = [
  ".github/pull_request_template.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "PULL_REQUEST_TEMPLATE.md",
  "docs/pull_request_template.md",
  "docs/PULL_REQUEST_TEMPLATE.md",
];

function usage() {
  console.log(`ship-branch

Usage:
  node scripts/ship-branch.mjs [--dry-run] [--skip-tests] [--base <ref>] [--message <msg>] [--push] [--pr] [--title <title>] [--body <body>] [--body-file <path>] [--template <path>] [--draft] [--json]
`);
  process.exit(0);
}

function quote(value) {
  return JSON.stringify(String(value));
}

function run(cmd, options = {}) {
  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    return typeof output === "string" ? output.trim() : "";
  } catch (error) {
    if (options.allowFailure) return "";
    const stderr = error.stderr ? String(error.stderr) : "";
    throw new Error(stderr || error.message);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readPackageScripts() {
  try {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return parsed.scripts || {};
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    skipTests: false,
    push: false,
    pr: false,
    json: false,
    draft: false,
    base: "origin/main",
    message: "",
    title: "",
    body: "",
    bodyFile: "",
    template: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--skip-tests") out.skipTests = true;
    else if (arg === "--push") out.push = true;
    else if (arg === "--pr") out.pr = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--draft") out.draft = true;
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
    } else if (arg === "--body-file") {
      out.bodyFile = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--template") {
      out.template = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  return out;
}

function detectValidationCommand() {
  const scripts = readPackageScripts();
  if (scripts.smoke) return "npm run smoke";
  if (scripts.test) return "npm test";
  return "";
}

function baseParts(baseRef) {
  if (baseRef.includes("/")) {
    const [remote, ...rest] = baseRef.split("/");
    return {
      remote,
      branch: rest.join("/") || "main",
      display: baseRef,
    };
  }
  return {
    remote: "origin",
    branch: baseRef,
    display: baseRef,
  };
}

function cleanSubject(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveTitleFromBranch(branch) {
  return branch
    .split("/")
    .at(-1)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || `Ship ${branch}`;
}

function findTemplatePath(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : TEMPLATE_PATHS;
  for (const candidate of candidates) {
    const absolute = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }
  return "";
}

function collectDiffContext(base) {
  const range = `${base}...HEAD`;
  const commitSubjects = run(`git log --format=%s ${quote(`${base}..HEAD`)}`, { allowFailure: true })
    .split(/\r?\n/)
    .map(cleanSubject)
    .filter(Boolean)
    .filter((subject, index, items) => items.indexOf(subject) === index);
  const changedFiles = run(`git diff --name-only ${quote(range)}`, { allowFailure: true })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const changedAreas = [...new Set(changedFiles.map((file) => file.split("/")[0] || "root"))].slice(0, 6);
  return {
    range,
    commitSubjects,
    changedFiles,
    changedAreas,
    latestCommitSubject: cleanSubject(run("git log --format=%s -1", { allowFailure: true })),
  };
}

function bulletize(items, emptyMessage, limit = 5) {
  if (!items.length) return [`- ${emptyMessage}`];
  const lines = items.slice(0, limit).map((item) => `- ${item}`);
  if (items.length > limit) {
    lines.push(`- ...and ${items.length - limit} more`);
  }
  return lines;
}

function buildGeneratedSections({ branch, base, validationCommand, diffContext }) {
  const summaryItems = diffContext.commitSubjects.length
    ? diffContext.commitSubjects
    : diffContext.changedAreas.map((area) => `Touches ${area}`);
  const validationItems = validationCommand
    ? [`Ran \`${validationCommand}\``]
    : ["Validation command not configured for this repository"];
  const changedFileItems = diffContext.changedFiles.length
    ? diffContext.changedFiles
    : ["No file changes detected against the base branch"];

  const sections = {
    SUMMARY: bulletize(summaryItems, "No change summary available").join("\n"),
    VALIDATION: bulletize(validationItems, "Validation not recorded").join("\n"),
    CHANGED_FILES: bulletize(changedFileItems, "No changed files detected", 10).join("\n"),
    BRANCH: `\`${branch}\``,
    BASE: `\`${base.replace(/^origin\//, "")}\``,
  };

  const generatedBody = [
    "## Summary",
    "",
    sections.SUMMARY,
    "",
    "## Validation",
    "",
    sections.VALIDATION,
    "",
    "## Changed Files",
    "",
    sections.CHANGED_FILES,
    "",
    "## Context",
    "",
    `- Branch: ${sections.BRANCH}`,
    `- Base: ${sections.BASE}`,
  ].join("\n").trim() + "\n";

  return { sections, generatedBody };
}

function applyTemplate(templateContent, sections, generatedBody) {
  let replaced = false;
  const rendered = templateContent.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(sections, key)) {
      replaced = true;
      return sections[key];
    }
    return match;
  }).trim();

  if (replaced) {
    return `${rendered}\n`;
  }

  if (!rendered) {
    return generatedBody;
  }

  return `${rendered}\n\n---\n\n${generatedBody}`;
}

function resolvePrContent({ args, branch, base, validationCommand }) {
  const diffContext = collectDiffContext(base);
  const templatePath = findTemplatePath(args.template);
  const templateContent = templatePath ? fs.readFileSync(templatePath, "utf8") : "";
  const generated = buildGeneratedSections({ branch, base, validationCommand, diffContext });

  let title = cleanSubject(args.title);
  if (!title) {
    title = cleanSubject(args.message) || diffContext.latestCommitSubject || deriveTitleFromBranch(branch);
  }

  let body = "";
  let bodySource = "generated";
  if (args.bodyFile) {
    body = fs.readFileSync(path.resolve(process.cwd(), args.bodyFile), "utf8");
    bodySource = "body-file";
  } else if (args.body) {
    body = args.body;
    bodySource = "body-flag";
  } else if (templateContent) {
    body = applyTemplate(templateContent, { ...generated.sections, TITLE: title }, generated.generatedBody);
    bodySource = `template:${path.relative(process.cwd(), templatePath)}`;
  } else {
    body = generated.generatedBody;
  }

  return {
    title,
    body,
    bodySource,
    templatePath,
    changedFiles: diffContext.changedFiles,
    commitSubjects: diffContext.commitSubjects,
    bodyPreview: body.split(/\r?\n/).slice(0, 12).join("\n"),
  };
}

function printText(result) {
  console.log("# Ship Summary");
  console.log();
  console.log(`- Branch: ${result.branch}`);
  console.log(`- Base: ${result.base}`);
  console.log(`- Validation: ${result.validation.command || "none"}`);
  console.log(`- Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`- Dirty before commit: ${result.dirtyBefore ? "yes" : "no"}`);
  if (result.pr?.title) {
    console.log(`- PR title: ${result.pr.title}`);
    console.log(`- PR body source: ${result.pr.bodySource}`);
  }
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
  pr: null,
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

const baseRef = baseParts(args.base);
result.steps.push(`fetch ${baseRef.display}`);
if (!args.dryRun) {
  run(`git fetch ${quote(baseRef.remote)} ${quote(baseRef.branch)}`, { allowFailure: true });
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

if (dirty && !args.message && !args.dryRun && (args.push || args.pr)) {
  console.error("Working tree has changes. Pass --message to create a commit before push/PR.");
  process.exit(1);
}

if (dirty && args.message) {
  result.steps.push(`commit with message ${JSON.stringify(args.message)}`);
  if (!args.dryRun) {
    run("git add -A");
    run(`git commit -m ${quote(args.message)}`);
  }
}

if (args.push || args.pr) {
  result.steps.push(`push branch ${result.branch}`);
  if (!args.dryRun) {
    run(`git push -u origin ${quote(result.branch)}`, { stdio: "inherit" });
  }
}

if (args.pr) {
  const prContent = resolvePrContent({
    args,
    branch: result.branch,
    base: args.base,
    validationCommand,
  });
  result.pr = {
    title: prContent.title,
    bodySource: prContent.bodySource,
    templatePath: prContent.templatePath ? path.relative(process.cwd(), prContent.templatePath) : "",
    bodyPreview: prContent.bodyPreview,
  };
  result.steps.push(`prepare PR title ${JSON.stringify(prContent.title)}`);
  result.steps.push(`prepare PR body from ${prContent.bodySource}`);
  result.steps.push("open pull request");

  if (!args.dryRun) {
    const workDir = path.resolve(process.cwd(), ".codex-stack", "ship");
    const tempPath = path.join(workDir, `pr-body-${Date.now()}-${process.pid}.md`);
    ensureDir(workDir);
    fs.writeFileSync(tempPath, prContent.body);
    try {
      const prCmd = [
        "gh pr create",
        `--base ${quote(args.base.replace(/^origin\//, ""))}`,
        `--head ${quote(result.branch)}`,
        `--title ${quote(prContent.title)}`,
        `--body-file ${quote(tempPath)}`,
      ];
      if (args.draft) prCmd.push("--draft");
      result.prUrl = run(prCmd.join(" "), { stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/).at(-1) || "";
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

if (args.json) console.log(JSON.stringify(result, null, 2));
else printText(result);
