#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, spawnSync } from "node:child_process";

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
  node scripts/ship-branch.mjs [--dry-run] [--skip-tests] [--base <ref>] [--message <msg>] [--push] [--pr] [--title <title>] [--body <body>] [--body-file <path>] [--template <path>] [--reviewer <user>] [--team-reviewer <org/team>] [--assignee <user>] [--assign-self] [--project <title>] [--label <name>] [--milestone <title>] [--verify-url <url>] [--verify-flow <name>] [--verify-snapshot <name>] [--verify-session <name>] [--update-verify-snapshot] [--draft] [--no-auto-labels] [--no-auto-reviewers] [--json]
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
    assignees: [],
    projects: [],
    labels: [],
    assignSelf: false,
    verifyUrl: "",
    verifyFlows: [],
    verifySnapshot: "",
    verifySession: "",
    updateVerifySnapshot: false,
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
    } else if (arg === "--assignee") {
      out.assignees.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--project") {
      out.projects.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--verify-url") {
      out.verifyUrl = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--verify-flow") {
      out.verifyFlows.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--verify-snapshot") {
      out.verifySnapshot = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--verify-session") {
      out.verifySession = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--update-verify-snapshot") {
      out.updateVerifySnapshot = true;
    } else if (arg === "--label") {
      out.labels.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--milestone") {
      out.milestone = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--assign-self") {
      out.assignSelf = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  out.reviewers = uniq(out.reviewers);
  out.teamReviewers = uniq(out.teamReviewers);
  out.assignees = uniq(out.assignees);
  out.projects = uniq(out.projects);
  out.verifyFlows = uniq(out.verifyFlows);
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
  const autoAssignees = args.assignSelf ? [currentLogin || "@me"] : [];

  const filteredAutoUsers = codeowners.users.filter((user) => !currentLogin || user.toLowerCase() !== currentLogin.toLowerCase());
  const labels = uniq([...args.labels, ...autoLabels]);
  const reviewers = uniq([...args.reviewers, ...filteredAutoUsers]);
  const teamReviewers = uniq([...args.teamReviewers, ...codeowners.teams]);
  const assignees = uniq([...args.assignees, ...autoAssignees]);
  const projects = uniq(args.projects);

  return {
    repo: inferGithubRepo(),
    labels,
    manualLabels: args.labels,
    autoLabels,
    reviewers,
    manualReviewers: args.reviewers,
    teamReviewers,
    manualTeamReviewers: args.teamReviewers,
    assignees,
    manualAssignees: args.assignees,
    autoAssignees,
    projects,
    manualProjects: args.projects,
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

function defaultVerifySession(branch) {
  return `ship-${String(branch || "verify").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60)}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "qa";
}

function defaultVerifyPublishDir(branch) {
  return path.join("docs", "qa", slugify(branch));
}

function shouldRunVerification(args) {
  return Boolean(args.verifyUrl || args.verifyFlows.length || args.verifySnapshot);
}

function runQaVerification(args, branch) {
  if (!args.verifyUrl) {
    throw new Error("Verification requires --verify-url.");
  }

  const qaPath = path.resolve(process.cwd(), "scripts", "qa-run.mjs");
  const sessionName = cleanSubject(args.verifySession) || defaultVerifySession(branch);
  const publishDir = defaultVerifyPublishDir(branch);
  const qaArgs = [
    qaPath,
    args.verifyUrl,
    "--session",
    sessionName,
    "--publish-dir",
    publishDir,
    "--json",
  ];
  for (const flow of args.verifyFlows) {
    qaArgs.push("--flow", flow);
  }
  if (args.verifySnapshot) {
    qaArgs.push("--snapshot", args.verifySnapshot);
  }
  if (args.updateVerifySnapshot) {
    qaArgs.push("--update-snapshot");
  }

  const child = spawnSync("node", qaArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const stdout = String(child.stdout || "").trim();
  const stderr = String(child.stderr || "").trim();
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch {
      parsed = null;
    }
  }

  return {
    session: sessionName,
    publishDir,
    ok: (child.status ?? 1) === 0 && Boolean(parsed),
    stdout,
    stderr,
    report: parsed,
  };
}

function trackedRepoPath(targetPath) {
  const cleaned = cleanSubject(targetPath);
  if (!cleaned) return "";
  const absolute = path.resolve(process.cwd(), cleaned);
  const relative = path.relative(process.cwd(), absolute);
  if (relative.startsWith("..")) return "";
  return relative.replace(/\\/g, "/");
}

function repoBlobUrl(repo, branch, relativePath) {
  if (!repo || !branch || !relativePath) return "";
  const encoded = relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${encoded}`;
}

function isTrackedPath(relativePath) {
  if (!relativePath) return false;
  return Boolean(run(`git ls-files --error-unmatch -- ${quote(relativePath)}`, { allowFailure: true }));
}

function markdownReference(repo, branch, targetPath) {
  const relative = trackedRepoPath(targetPath);
  if (!relative) return "";
  if (isTrackedPath(relative)) {
    return `[${relative}](${repoBlobUrl(repo, branch, relative)})`;
  }
  return `\`${relative}\` (local only)`;
}

function qaFindingSummary(findings, limit = 5) {
  if (!Array.isArray(findings) || !findings.length) return ["- No findings."];
  const lines = findings.slice(0, limit).map((item) => `- ${String(item.severity || "info").toUpperCase()}: ${item.title}`);
  if (findings.length > limit) {
    lines.push(`- ...and ${findings.length - limit} more`);
  }
  return lines;
}

function buildQaPrComment({ report, repo, branch }) {
  if (!report) return "";
  const published = report.artifacts?.published || {};
  const reportRef = markdownReference(repo, branch, published.markdown || published.json || report.artifacts?.markdown || report.artifacts?.json || "");
  const annotationRef = markdownReference(repo, branch, published.annotation || report.snapshotResult?.annotation || report.artifacts?.annotation || "");
  const screenshotRef = markdownReference(repo, branch, published.screenshot || report.snapshotResult?.screenshot || "");
  const flowLines = Array.isArray(report.flowResults) && report.flowResults.length
    ? report.flowResults.map((item) => `- ${item.name}: ${item.status}${item.steps ? ` (${item.steps} steps)` : ""}`)
    : ["- No flows configured."];

  const sections = [
    "## QA Verification",
    "",
    `- Status: ${report.status}`,
    `- Health score: ${report.healthScore}`,
    `- Recommendation: ${report.recommendation}`,
    "",
    "### Findings",
    "",
    ...qaFindingSummary(report.findings),
    "",
    "### Flow results",
    "",
    ...flowLines,
  ];

  if (report.snapshotResult) {
    sections.push(
      "",
      "### Snapshot evidence",
      "",
      `- Snapshot: ${report.snapshotResult.name || "n/a"} (${report.snapshotResult.status || "unknown"})`
    );
    if (reportRef) sections.push(`- QA report: ${reportRef}`);
    if (annotationRef) sections.push(`- Annotation: ${annotationRef}`);
    if (screenshotRef) sections.push(`- Screenshot: ${screenshotRef}`);
  } else if (reportRef) {
    sections.push("", `QA report: ${reportRef}`);
  }

  return `${sections.join("\n").trim()}\n`;
}

function safeGhComment(result, prUrl, body) {
  if (!prUrl || !body) return;
  const workDir = path.resolve(process.cwd(), ".codex-stack", "ship");
  const tempPath = path.join(workDir, `pr-comment-${Date.now()}-${process.pid}.md`);
  ensureDir(workDir);
  fs.writeFileSync(tempPath, body);
  try {
    run(`gh pr comment ${quote(prUrl)} --body-file ${quote(tempPath)}`, { stdio: ["ignore", "pipe", "pipe"] });
    result.verification.commentPosted = true;
  } catch (error) {
    result.status = result.status === "ok" ? "warning" : result.status;
    result.warnings.push(`post qa comment: ${cleanSubject(error.message)}`);
  } finally {
    fs.rmSync(tempPath, { force: true });
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
  if (result.automation.assignees.length) {
    console.log(`- Assignees: ${result.automation.assignees.join(", ")}`);
  }
  if (result.automation.projects.length) {
    console.log(`- Projects: ${result.automation.projects.join(", ")}`);
  }
  if (result.verification.url) {
    console.log(`- Verification URL: ${result.verification.url}`);
  }
  if (result.verification.flows.length || result.verification.snapshot) {
    const checks = [];
    if (result.verification.flows.length) checks.push(`flows=${result.verification.flows.join(",")}`);
    if (result.verification.snapshot) checks.push(`snapshot=${result.verification.snapshot}`);
    console.log(`- Verification checks: ${checks.join(" ")}`);
  }
  if (result.verification.status) {
    console.log(`- Verification status: ${result.verification.status}`);
  }
  if (result.verification.healthScore !== null) {
    console.log(`- Verification health score: ${result.verification.healthScore}`);
  }
  if (result.verification.reportPath) {
    console.log(`- Verification report: ${result.verification.reportPath}`);
  }
  if (result.verification.commentPosted) {
    console.log("- Verification comment: posted");
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
  verification: {
    url: cleanSubject(args.verifyUrl),
    flows: [...args.verifyFlows],
    snapshot: cleanSubject(args.verifySnapshot),
    session: cleanSubject(args.verifySession),
    status: "",
    healthScore: null,
    reportPath: "",
    publishDir: "",
    commentPreview: "",
    commentPosted: false,
  },
  automation: {
    labels: [],
    manualLabels: [],
    autoLabels: [],
    reviewers: [],
    manualReviewers: [],
    teamReviewers: [],
    manualTeamReviewers: [],
    assignees: [],
    manualAssignees: [],
    autoAssignees: [],
    projects: [],
    manualProjects: [],
    autoReviewerSource: "none",
    matchedCodeownersRules: 0,
    milestone: "",
    repo: "",
    createdLabels: [],
  },
  warnings: [],
  steps: [],
};
let verificationCommentBody = "";

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

const diffContext = collectDiffContext(args.base);
const currentLogin = args.pr || args.assignSelf ? getCurrentGitHubLogin() : "";
result.automation = buildAutomationPlan(args, result.branch, diffContext, currentLogin);
if (result.automation.autoLabels.length) {
  result.steps.push(`infer labels ${result.automation.autoLabels.join(", ")}`);
}
if (result.automation.autoReviewerSource !== "none" && result.automation.autoReviewerSource !== "disabled") {
  result.steps.push(`infer reviewers from ${result.automation.autoReviewerSource}`);
}
if (result.automation.autoAssignees.length) {
  result.steps.push(`infer assignees ${result.automation.autoAssignees.join(", ")}`);
}

if (shouldRunVerification(args)) {
  if (!args.verifyUrl) {
    console.error("Verification requires --verify-url.");
    process.exit(1);
  }
  const verificationParts = [];
  if (args.verifyFlows.length) verificationParts.push(`flows ${args.verifyFlows.join(", ")}`);
  if (args.verifySnapshot) verificationParts.push(`${args.updateVerifySnapshot ? "refresh" : "compare"} snapshot ${args.verifySnapshot}`);
  result.verification.session = result.verification.session || defaultVerifySession(result.branch);
  result.verification.publishDir = defaultVerifyPublishDir(result.branch);
  result.steps.push(`verify via qa on ${args.verifyUrl}${verificationParts.length ? ` (${verificationParts.join("; ")})` : ""}`);
  result.steps.push(`publish qa artifacts to ${result.verification.publishDir}`);
  if (!args.dryRun) {
    const verification = runQaVerification(args, result.branch);
    result.verification.session = verification.session;
    result.verification.publishDir = verification.publishDir;
    if (!verification.ok || !verification.report) {
      console.error(verification.stderr || verification.stdout || "QA verification failed.");
      process.exit(1);
    }
    result.verification.status = verification.report.status;
    result.verification.healthScore = verification.report.healthScore;
    result.verification.reportPath = verification.report.artifacts?.published?.markdown || verification.report.artifacts?.published?.json || verification.report.artifacts?.markdown || verification.report.artifacts?.json || "";
    verificationCommentBody = buildQaPrComment({
      report: verification.report,
      repo: result.automation.repo,
      branch: result.branch,
    });
    result.verification.commentPreview = verificationCommentBody.split(/\r?\n/).slice(0, 20).join("\n");
    if (verification.report.status === "critical") {
      console.error(`QA verification failed: ${verification.report.recommendation}`);
      process.exit(1);
    }
    if (verification.report.status === "warning") {
      result.status = result.status === "ok" ? "warning" : result.status;
      result.warnings.push(`qa verification: ${verification.report.recommendation}`);
    }
  }
}

const dirtyAfterVerification = run("git status --porcelain", { allowFailure: true });
if (dirtyAfterVerification) {
  let commitMessage = "";
  if (args.message) {
    commitMessage = args.message;
  } else if (!result.dirtyBefore && shouldRunVerification(args) && !args.dryRun && (args.push || args.pr)) {
    commitMessage = `chore: publish QA artifacts for ${result.branch}`;
  }

  if (commitMessage) {
    result.steps.push(`commit with message ${JSON.stringify(commitMessage)}`);
    if (!args.dryRun) {
      run("git add -A");
      run(`git commit -m ${quote(commitMessage)}`);
    }
  } else if (!args.dryRun && (args.push || args.pr)) {
    console.error("Working tree has changes after verification. Pass --message to create a commit before push/PR.");
    process.exit(1);
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
  if (result.automation.assignees.length) {
    result.steps.push(`plan assignees ${result.automation.assignees.join(", ")}`);
  }
  if (result.automation.projects.length) {
    result.steps.push(`plan projects ${result.automation.projects.join(", ")}`);
  }
  if (result.automation.milestone) {
    result.steps.push(`plan milestone ${result.automation.milestone}`);
  }
  if (shouldRunVerification(args)) {
    result.steps.push("plan qa verification comment");
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
      if (result.prUrl && result.automation.assignees.length) {
        for (const assignee of result.automation.assignees) {
          safeGhEdit(
            result,
            `assign ${assignee}`,
            `gh pr edit ${quote(result.prUrl)} --add-assignee ${quote(assignee)}`
          );
        }
      }
      if (result.prUrl && result.automation.projects.length) {
        for (const project of result.automation.projects) {
          safeGhEdit(
            result,
            `add project ${project}`,
            `gh pr edit ${quote(result.prUrl)} --add-project ${quote(project)}`
          );
        }
      }
      if (result.prUrl && result.automation.milestone) {
        safeGhEdit(
          result,
          "set milestone",
          `gh pr edit ${quote(result.prUrl)} --milestone ${quote(result.automation.milestone)}`
        );
      }
      if (result.prUrl && verificationCommentBody) {
        safeGhComment(result, result.prUrl, verificationCommentBody);
      }
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

if (args.json) console.log(JSON.stringify(result, null, 2));
else printText(result);
