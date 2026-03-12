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

const CODEOWNERS_PATHS = [
  ".github/CODEOWNERS",
  "CODEOWNERS",
  "docs/CODEOWNERS",
];

function usage() {
  console.log(`ship-branch

Usage:
  node scripts/ship-branch.mjs [--dry-run] [--skip-tests] [--base <ref>] [--message <msg>] [--push] [--pr] [--title <title>] [--body <body>] [--body-file <path>] [--template <path>] [--reviewer <user>] [--team-reviewer <org/team>] [--label <name>] [--milestone <title>] [--draft] [--no-auto-labels] [--no-auto-reviewers] [--json]
`);
  process.exit(0);
}

function quote(value) {
  return JSON.stringify(String(value));
}

function cleanSubject(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
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
    throw new Error(cleanSubject(stderr || error.message));
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function uniq(items) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
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
    noAutoLabels: false,
    noAutoReviewers: false,
    base: "origin/main",
    message: "",
    title: "",
    body: "",
    bodyFile: "",
    template: "",
    milestone: "",
    reviewers: [],
    teamReviewers: [],
    labels: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--skip-tests") out.skipTests = true;
    else if (arg === "--push") out.push = true;
    else if (arg === "--pr") out.pr = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--draft") out.draft = true;
    else if (arg === "--no-auto-labels") out.noAutoLabels = true;
    else if (arg === "--no-auto-reviewers") out.noAutoReviewers = true;
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
    } else if (arg === "--reviewer") {
      out.reviewers.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--team-reviewer") {
      out.teamReviewers.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--label") {
      out.labels.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--milestone") {
      out.milestone = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  out.reviewers = uniq(out.reviewers);
  out.teamReviewers = uniq(out.teamReviewers);
  out.labels = uniq(out.labels);
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
  const committedChangedFiles = run(`git diff --name-only ${quote(range)}`, { allowFailure: true })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const workingTreeFiles = run("git diff --name-only", { allowFailure: true })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const stagedFiles = run("git diff --name-only --cached", { allowFailure: true })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const changedFiles = uniq([...committedChangedFiles, ...workingTreeFiles, ...stagedFiles]);
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

function resolvePrContent({ args, branch, base, validationCommand, diffContext }) {
  const templatePath = findTemplatePath(args.template);
  const templateContent = templatePath ? fs.readFileSync(templatePath, "utf8") : "";
  const generated = buildGeneratedSections({ branch, base, validationCommand, diffContext });

  let title = cleanSubject(args.title);
  if (!title) {
    title = cleanSubject(args.message)
      || (diffContext.commitSubjects.length ? diffContext.latestCommitSubject : "")
      || deriveTitleFromBranch(branch);
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
    bodyPreview: body.split(/\r?\n/).slice(0, 12).join("\n"),
  };
}

function findCodeownersPath() {
  for (const candidate of CODEOWNERS_PATHS) {
    const absolute = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }
  return "";
}

function parseCodeownersEntries(filePath) {
  if (!filePath) return [];
  const content = fs.readFileSync(filePath, "utf8");
  const entries = [];
  for (const line of content.split(/\r?\n/)) {
    const stripped = line.replace(/\s+#.*$/, "").trim();
    if (!stripped || stripped.startsWith("#") || stripped.startsWith("!")) continue;
    const parts = stripped.split(/\s+/);
    if (parts.length < 2) continue;
    const pattern = parts[0];
    const owners = parts.slice(1).filter((owner) => owner.startsWith("@"));
    if (!owners.length) continue;
    entries.push({ pattern, owners });
  }
  return entries;
}

function escapeRegex(text) {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function codeownersPatternToRegex(pattern) {
  let normalized = pattern.trim();
  const anchored = normalized.startsWith("/");
  normalized = normalized.replace(/^\/+/, "");
  if (normalized.endsWith("/")) {
    normalized += "**";
  }

  let body = "";
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === "*" && next === "*") {
      body += ".*";
      i += 1;
      continue;
    }
    if (char === "*") {
      body += "[^/]*";
      continue;
    }
    if (char === "?") {
      body += "[^/]";
      continue;
    }
    body += escapeRegex(char);
  }

  const prefix = anchored ? "^" : "(?:^|.*/)";
  return new RegExp(`${prefix}${body}$`);
}

function splitOwners(owners) {
  const users = [];
  const teams = [];
  for (const owner of owners) {
    const normalized = owner.replace(/^@/, "");
    if (!normalized) continue;
    if (normalized.includes("/")) teams.push(normalized);
    else users.push(normalized);
  }
  return {
    users: uniq(users),
    teams: uniq(teams),
  };
}

function inferReviewersFromCodeowners(changedFiles) {
  const codeownersPath = findCodeownersPath();
  if (!codeownersPath) {
    return {
      users: [],
      teams: [],
      source: "none",
      matchedRules: 0,
    };
  }

  const entries = parseCodeownersEntries(codeownersPath).map((entry) => ({
    ...entry,
    regex: codeownersPatternToRegex(entry.pattern),
  }));

  const owners = [];
  let matchedRules = 0;
  for (const file of changedFiles) {
    let matchOwners = [];
    for (const entry of entries) {
      if (entry.regex.test(file)) {
        matchOwners = entry.owners;
      }
    }
    if (matchOwners.length) {
      matchedRules += 1;
      owners.push(...matchOwners);
    }
  }

  const split = splitOwners(owners);
  return {
    ...split,
    source: path.relative(process.cwd(), codeownersPath),
    matchedRules,
  };
}

function inferLabels(branch, changedFiles) {
  const labels = new Set();
  const branchPrefix = branch.split("/")[0].toLowerCase();
  const lowerFiles = changedFiles.map((file) => file.toLowerCase());

  const branchMap = {
    feat: "feature",
    feature: "feature",
    fix: "bugfix",
    bugfix: "bugfix",
    hotfix: "bugfix",
    docs: "docs",
    chore: "chore",
    refactor: "refactor",
    release: "release",
  };
  if (branchMap[branchPrefix]) {
    labels.add(branchMap[branchPrefix]);
  }

  if (lowerFiles.length && lowerFiles.every((file) => file.endsWith(".md") || file.startsWith("docs/"))) {
    labels.add("docs");
  }
  if (lowerFiles.some((file) => file.startsWith(".github/") || file.includes("/workflows/") || file === "dockerfile")) {
    labels.add("ci");
  }
  if (lowerFiles.some((file) => file.startsWith("infra/") || file.startsWith("terraform/") || file.startsWith("k8s/") || file.startsWith("helm/"))) {
    labels.add("infra");
  }
  if (lowerFiles.some((file) => file.endsWith(".tsx") || file.endsWith(".jsx") || file.endsWith(".css") || file.startsWith("frontend/") || file.startsWith("components/") || file.startsWith("pages/"))) {
    labels.add("frontend");
  }
  if (lowerFiles.some((file) => file.endsWith(".py") || file.endsWith(".go") || file.endsWith(".rb") || file.startsWith("api/") || file.startsWith("server/") || file.startsWith("backend/") || file.startsWith("db/") || file.startsWith("prisma/"))) {
    labels.add("backend");
  }
  if (lowerFiles.some((file) => file.includes("__tests__") || file.includes("/test") || /(^|\/).+\.(spec|test)\./.test(file) || file.startsWith("e2e/"))) {
    labels.add("tests");
  }

  return [...labels];
}

function getCurrentGitHubLogin() {
  return cleanSubject(run("gh api user --jq .login", { allowFailure: true }));
}

function inferGithubRepo() {
  const remote = run("git remote get-url origin", { allowFailure: true });
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : "";
}

function labelSpec(label) {
  const normalized = String(label || "").toLowerCase();
  const presets = {
    feature: { color: "1f6feb", description: "Feature work" },
    bugfix: { color: "d73a4a", description: "Bug fix" },
    docs: { color: "0e8a16", description: "Documentation change" },
    ci: { color: "5319e7", description: "CI or workflow change" },
    infra: { color: "0052cc", description: "Infrastructure or platform change" },
    frontend: { color: "fbca04", description: "Frontend change" },
    backend: { color: "c2e0c6", description: "Backend change" },
    tests: { color: "bfd4f2", description: "Test coverage or test-only change" },
    chore: { color: "d4c5f9", description: "Maintenance task" },
    refactor: { color: "c5def5", description: "Refactor" },
    release: { color: "b60205", description: "Release activity" },
  };
  return presets[normalized] || {
    color: "ededed",
    description: `codex-stack ship label for ${label}`,
  };
}

function ensureLabelExists(repo, label, result) {
  if (!repo || !label) return;
  const encoded = encodeURIComponent(label);
  const exists = run(`gh api repos/${repo}/labels/${encoded}`, { allowFailure: true });
  if (exists) return;
  const spec = labelSpec(label);
  try {
    run(
      `gh api repos/${repo}/labels -X POST -f name=${quote(label)} -f color=${quote(spec.color)} -f description=${quote(spec.description)}`,
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    result.automation.createdLabels.push(label);
  } catch (error) {
    result.status = result.status === "ok" ? "warning" : result.status;
    result.warnings.push(`create label ${label}: ${cleanSubject(error.message)}`);
  }
}

function buildAutomationPlan(args, branch, diffContext, currentLogin = "") {
  const autoLabels = args.noAutoLabels ? [] : inferLabels(branch, diffContext.changedFiles);
  const codeowners = args.noAutoReviewers
    ? { users: [], teams: [], source: "disabled", matchedRules: 0 }
    : inferReviewersFromCodeowners(diffContext.changedFiles);

  const filteredAutoUsers = codeowners.users.filter((user) => !currentLogin || user.toLowerCase() !== currentLogin.toLowerCase());
  const labels = uniq([...args.labels, ...autoLabels]);
  const reviewers = uniq([...args.reviewers, ...filteredAutoUsers]);
  const teamReviewers = uniq([...args.teamReviewers, ...codeowners.teams]);

  return {
    repo: inferGithubRepo(),
    labels,
    manualLabels: args.labels,
    autoLabels,
    reviewers,
    manualReviewers: args.reviewers,
    teamReviewers,
    manualTeamReviewers: args.teamReviewers,
    autoReviewerSource: codeowners.source,
    matchedCodeownersRules: codeowners.matchedRules,
    milestone: cleanSubject(args.milestone),
    createdLabels: [],
  };
}

function safeGhEdit(result, description, cmd) {
  try {
    run(cmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    result.status = result.status === "ok" ? "warning" : result.status;
    result.warnings.push(`${description}: ${cleanSubject(error.message)}`);
  }
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
  if (result.automation.labels.length) {
    console.log(`- Labels: ${result.automation.labels.join(", ")}`);
  }
  if (result.automation.reviewers.length || result.automation.teamReviewers.length) {
    console.log(`- Reviewers: ${[...result.automation.reviewers, ...result.automation.teamReviewers].join(", ")}`);
  }
  if (result.automation.milestone) {
    console.log(`- Milestone: ${result.automation.milestone}`);
  }
  if (result.automation.createdLabels.length) {
    console.log(`- Created labels: ${result.automation.createdLabels.join(", ")}`);
  }
  console.log();
  for (const step of result.steps) {
    console.log(`- ${step}`);
  }
  if (result.prUrl) {
    console.log(`- PR: ${result.prUrl}`);
  }
  if (result.warnings.length) {
    console.log();
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
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
  automation: {
    labels: [],
    manualLabels: [],
    autoLabels: [],
    reviewers: [],
    manualReviewers: [],
    teamReviewers: [],
    manualTeamReviewers: [],
    autoReviewerSource: "none",
    matchedCodeownersRules: 0,
    milestone: "",
    repo: "",
    createdLabels: [],
  },
  warnings: [],
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

const diffContext = collectDiffContext(args.base);
const currentLogin = !args.dryRun && args.pr ? getCurrentGitHubLogin() : "";
result.automation = buildAutomationPlan(args, result.branch, diffContext, currentLogin);
if (result.automation.autoLabels.length) {
  result.steps.push(`infer labels ${result.automation.autoLabels.join(", ")}`);
}
if (result.automation.autoReviewerSource !== "none" && result.automation.autoReviewerSource !== "disabled") {
  result.steps.push(`infer reviewers from ${result.automation.autoReviewerSource}`);
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
    diffContext,
  });
  result.pr = {
    title: prContent.title,
    bodySource: prContent.bodySource,
    templatePath: prContent.templatePath ? path.relative(process.cwd(), prContent.templatePath) : "",
    bodyPreview: prContent.bodyPreview,
  };
  result.steps.push(`prepare PR title ${JSON.stringify(prContent.title)}`);
  result.steps.push(`prepare PR body from ${prContent.bodySource}`);
  if (result.automation.labels.length) {
    result.steps.push(`plan labels ${result.automation.labels.join(", ")}`);
  }
  if (result.automation.reviewers.length || result.automation.teamReviewers.length) {
    result.steps.push(`plan reviewers ${[...result.automation.reviewers, ...result.automation.teamReviewers].join(", ")}`);
  }
  if (result.automation.milestone) {
    result.steps.push(`plan milestone ${result.automation.milestone}`);
  }
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

      if (result.prUrl && result.automation.labels.length) {
        for (const label of result.automation.labels) {
          ensureLabelExists(result.automation.repo, label, result);
        }
        safeGhEdit(
          result,
          "apply labels",
          `gh pr edit ${quote(result.prUrl)} --add-label ${quote(result.automation.labels.join(","))}`
        );
      }
      const allReviewers = uniq([...result.automation.reviewers, ...result.automation.teamReviewers]);
      if (result.prUrl && allReviewers.length) {
        safeGhEdit(
          result,
          "request reviewers",
          `gh pr edit ${quote(result.prUrl)} --add-reviewer ${quote(allReviewers.join(","))}`
        );
      }
      if (result.prUrl && result.automation.milestone) {
        safeGhEdit(
          result,
          "set milestone",
          `gh pr edit ${quote(result.prUrl)} --milestone ${quote(result.automation.milestone)}`
        );
      }
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

if (args.json) console.log(JSON.stringify(result, null, 2));
else printText(result);
