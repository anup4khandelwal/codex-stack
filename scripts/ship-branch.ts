#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, spawnSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";

interface RunOptions extends Partial<ExecSyncOptionsWithStringEncoding> {
  allowFailure?: boolean;
}

interface ShipArgs {
  dryRun: boolean;
  skipTests: boolean;
  push: boolean;
  pr: boolean;
  json: boolean;
  draft: boolean;
  noAutoLabels: boolean;
  noAutoReviewers: boolean;
  base: string;
  message: string;
  title: string;
  body: string;
  bodyFile: string;
  template: string;
  milestone: string;
  reviewers: string[];
  teamReviewers: string[];
  assignees: string[];
  projects: string[];
  labels: string[];
  assignSelf: boolean;
  verifyUrl: string;
  verifyPaths: string[];
  verifyDevices: string[];
  verifyFlows: string[];
  verifySnapshot: string;
  verifySession: string;
  verifyConsoleErrors: boolean;
  updateVerifySnapshot: boolean;
}

interface BaseParts {
  remote: string;
  branch: string;
  display: string;
}

interface DiffContext {
  range: string;
  commitSubjects: string[];
  changedFiles: string[];
  changedAreas: string[];
  latestCommitSubject: string;
}

interface GeneratedSectionsResult {
  sections: Record<string, string>;
  generatedBody: string;
}

interface PrContent {
  title: string;
  body: string;
  bodySource: string;
  templatePath: string;
  bodyPreview: string;
}

interface CodeownersEntry {
  pattern: string;
  owners: string[];
  regex?: RegExp;
}

interface ReviewerSplit {
  users: string[];
  teams: string[];
}

interface ReviewerInference extends ReviewerSplit {
  source: string;
  matchedRules: number;
}

interface LabelPreset {
  color: string;
  description: string;
}

interface AutomationPlan {
  repo: string;
  labels: string[];
  manualLabels: string[];
  autoLabels: string[];
  reviewers: string[];
  manualReviewers: string[];
  teamReviewers: string[];
  manualTeamReviewers: string[];
  assignees: string[];
  manualAssignees: string[];
  autoAssignees: string[];
  projects: string[];
  manualProjects: string[];
  autoReviewerSource: string;
  matchedCodeownersRules: number;
  milestone: string;
  createdLabels: string[];
}

interface QaFinding {
  severity?: string;
  category?: string;
  title?: string;
}

interface QaFlowResult {
  name?: string;
  status?: string;
  steps?: number;
}

interface QaSnapshotResult {
  name?: string;
  status?: string;
  annotation?: string;
  screenshot?: string;
}

interface QaPublishedArtifacts {
  markdown?: string;
  json?: string;
  annotation?: string;
  screenshot?: string;
}

interface QaArtifacts {
  markdown?: string;
  json?: string;
  annotation?: string;
  published?: QaPublishedArtifacts;
}

interface QaReportSummary {
  status?: string;
  healthScore?: number;
  recommendation?: string;
  findings?: QaFinding[];
  flowResults?: QaFlowResult[];
  snapshotResult?: QaSnapshotResult | null;
  artifacts?: QaArtifacts;
}

interface DeployVerificationRun {
  session: string;
  publishDir: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  report: DeployReportSummary | null;
}

interface DeployPathResult {
  path?: string;
  device?: string;
  status?: string;
  httpStatus?: number | null;
  screenshot?: string;
  console?: {
    errors?: string[];
    warnings?: string[];
  };
}

interface DeploySnapshotResult {
  name?: string;
  targetPath?: string;
  device?: string;
  status?: string;
  report?: string;
  annotation?: string;
  screenshot?: string;
}

interface DeployArtifacts {
  markdown?: string;
  json?: string;
  annotation?: string;
  screenshot?: string;
  published?: {
    markdown?: string;
    json?: string;
    annotation?: string;
    screenshot?: string;
  };
}

interface DeployQaReport {
  status?: string;
  healthScore?: number;
  recommendation?: string;
  findings?: QaFinding[];
  flowResults?: QaFlowResult[];
  snapshotResults?: DeploySnapshotResult[];
  artifacts?: DeployArtifacts;
}

interface DeployReportSummary {
  status?: string;
  recommendation?: string;
  artifactRoot?: string;
  screenshotManifest?: string;
  pathResults?: DeployPathResult[];
  qa?: DeployQaReport;
}

interface ValidationSummary {
  command: string;
  passed: boolean | null;
}

interface PrSummary {
  title: string;
  bodySource: string;
  templatePath: string;
  bodyPreview: string;
}

interface VerificationSummary {
  url: string;
  paths: string[];
  devices: string[];
  flows: string[];
  snapshot: string;
  session: string;
  status: string;
  healthScore: number | null;
  consoleErrors: number;
  reportPath: string;
  stableReportUrl: string;
  publishDir: string;
  commentPreview: string;
  commentPosted: boolean;
}

interface ShipResult {
  status: "ok" | "warning";
  branch: string;
  base: string;
  dryRun: boolean;
  dirtyBefore: boolean;
  validation: ValidationSummary;
  pr: PrSummary | null;
  prUrl: string;
  verification: VerificationSummary;
  automation: AutomationPlan;
  warnings: string[];
  steps: string[];
}

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

function usage(): never {
  console.log(`ship-branch

Usage:
  bun scripts/ship-branch.ts [--dry-run] [--skip-tests] [--base <ref>] [--message <msg>] [--push] [--pr] [--title <title>] [--body <body>] [--body-file <path>] [--template <path>] [--reviewer <user>] [--team-reviewer <org/team>] [--assignee <user>] [--assign-self] [--project <title>] [--label <name>] [--milestone <title>] [--verify-url <url>] [--verify-path <path>] [--verify-device <desktop|tablet|mobile>] [--verify-flow <name>] [--verify-snapshot <name>] [--verify-session <name>] [--verify-console-errors] [--update-verify-snapshot] [--draft] [--no-auto-labels] [--no-auto-reviewers] [--json]
`);
  process.exit(0);
}

function quote(value: string): string {
  return JSON.stringify(String(value));
}

function cleanSubject(text: unknown): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function run(cmd: string, options: RunOptions = {}): string {
  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    return typeof output === "string" ? output.trim() : "";
  } catch (error: unknown) {
    if (options.allowFailure) return "";
    const stderr = typeof error === "object" && error && "stderr" in error
      ? String((error as { stderr?: unknown }).stderr || "")
      : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(cleanSubject(stderr || message));
  }
}

const BUN_RUNTIME = process.execPath || "bun";

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function readPackageScripts(): Record<string, string> {
  try {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return parsed.scripts || {};
  } catch {
    return {};
  }
}

function parseArgs(argv: string[]): ShipArgs {
  const out: ShipArgs = {
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
    verifyPaths: [],
    verifyDevices: [],
    verifyFlows: [],
    verifySnapshot: "",
    verifySession: "",
    verifyConsoleErrors: false,
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
    } else if (arg === "--verify-path") {
      out.verifyPaths.push(argv[i + 1] || "");
      i += 1;
    } else if (arg === "--verify-device") {
      out.verifyDevices.push(argv[i + 1] || "");
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
    } else if (arg === "--verify-console-errors") {
      out.verifyConsoleErrors = true;
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
  out.verifyPaths = uniq(out.verifyPaths);
  out.verifyDevices = uniq(out.verifyDevices);
  out.verifyFlows = uniq(out.verifyFlows);
  out.labels = uniq(out.labels);
  return out;
}

function detectValidationCommand(): string {
  const scripts = readPackageScripts();
  if (scripts.smoke) return "bun run smoke";
  if (scripts.test) return "bun test";
  return "";
}

function baseParts(baseRef: string): BaseParts {
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

function deriveTitleFromBranch(branch: string): string {
  return (branch
    .split("/")
    .at(-1) || branch)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || `Ship ${branch}`;
}

function issueNumberFromBranch(branch: string): string {
  const match = String(branch || "").match(/^[^/]+\/(\d+)-/);
  return match ? match[1] : "";
}

function findTemplatePath(explicitPath: string): string {
  const candidates = explicitPath ? [explicitPath] : TEMPLATE_PATHS;
  for (const candidate of candidates) {
    const absolute = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }
  return "";
}

function collectDiffContext(base: string): DiffContext {
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

function bulletize(items: string[], emptyMessage: string, limit = 5): string[] {
  if (!items.length) return [`- ${emptyMessage}`];
  const lines = items.slice(0, limit).map((item) => `- ${item}`);
  if (items.length > limit) {
    lines.push(`- ...and ${items.length - limit} more`);
  }
  return lines;
}

function buildGeneratedSections({
  branch,
  base,
  validationCommand,
  diffContext,
}: {
  branch: string;
  base: string;
  validationCommand: string;
  diffContext: DiffContext;
}): GeneratedSectionsResult {
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
    ISSUE_CLOSER: issueNumberFromBranch(branch) ? `Closes #${issueNumberFromBranch(branch)}` : "",
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
    ...(sections.ISSUE_CLOSER ? [`- ${sections.ISSUE_CLOSER}`] : []),
  ].join("\n").trim() + "\n";

  return { sections, generatedBody };
}

function applyTemplate(templateContent: string, sections: Record<string, string>, generatedBody: string): string {
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

function resolvePrContent({
  args,
  branch,
  base,
  validationCommand,
  diffContext,
}: {
  args: ShipArgs;
  branch: string;
  base: string;
  validationCommand: string;
  diffContext: DiffContext;
}): PrContent {
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

function findCodeownersPath(): string {
  for (const candidate of CODEOWNERS_PATHS) {
    const absolute = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }
  return "";
}

function parseCodeownersEntries(filePath: string): CodeownersEntry[] {
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

function escapeRegex(text: string): string {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function codeownersPatternToRegex(pattern: string): RegExp {
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

function splitOwners(owners: string[]): ReviewerSplit {
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

function inferReviewersFromCodeowners(changedFiles: string[]): ReviewerInference {
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

  const owners: string[] = [];
  let matchedRules = 0;
  for (const file of changedFiles) {
    let matchOwners: string[] = [];
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

function inferLabels(branch: string, changedFiles: string[]): string[] {
  const labels = new Set<string>();
  const branchPrefix = branch.split("/")[0].toLowerCase();
  const lowerFiles = changedFiles.map((file) => file.toLowerCase());

  const branchMap: Record<string, string> = {
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

function getCurrentGitHubLogin(): string {
  return cleanSubject(run("gh api user --jq .login", { allowFailure: true }));
}

function inferGithubRepo(): string {
  if (process.env.GITHUB_REPOSITORY) {
    return cleanSubject(process.env.GITHUB_REPOSITORY);
  }
  const remote = run("git remote get-url origin", { allowFailure: true });
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : "";
}

function labelSpec(label: string): LabelPreset {
  const normalized = String(label || "").toLowerCase();
  const presets: Record<string, LabelPreset> = {
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

function ensureLabelExists(repo: string, label: string, result: ShipResult): void {
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
  } catch (error: unknown) {
    result.status = result.status === "ok" ? "warning" : result.status;
    result.warnings.push(`create label ${label}: ${cleanSubject(error instanceof Error ? error.message : String(error))}`);
  }
}

function buildAutomationPlan(args: ShipArgs, branch: string, diffContext: DiffContext, currentLogin = ""): AutomationPlan {
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

function safeGhEdit(result: ShipResult, description: string, cmd: string): void {
  try {
    run(cmd, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error: unknown) {
    result.status = result.status === "ok" ? "warning" : result.status;
    result.warnings.push(`${description}: ${cleanSubject(error instanceof Error ? error.message : String(error))}`);
  }
}

function defaultVerifySession(branch: string): string {
  return `ship-${String(branch || "verify").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60)}`;
}

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "qa";
}

function defaultVerifyPublishDir(branch: string): string {
  return path.join("docs", "qa", slugify(branch), "deploy");
}

function shouldRunVerification(args: ShipArgs): boolean {
  return Boolean(
    args.verifyUrl
    || args.verifyPaths.length
    || args.verifyDevices.length
    || args.verifyFlows.length
    || args.verifySnapshot
    || args.verifyConsoleErrors
  );
}

function runDeployVerification(args: ShipArgs, branch: string): DeployVerificationRun {
  if (!args.verifyUrl) {
    throw new Error("Verification requires --verify-url.");
  }

  const deployPath = path.resolve(process.cwd(), "scripts", "deploy-verify.ts");
  const sessionName = cleanSubject(args.verifySession) || defaultVerifySession(branch);
  const publishDir = defaultVerifyPublishDir(branch);
  const deployArgs = [
    deployPath,
    "--url",
    args.verifyUrl,
  ];
  for (const verifyPath of args.verifyPaths.length ? args.verifyPaths : ["/"]) {
    deployArgs.push("--path", verifyPath);
  }
  for (const device of args.verifyDevices.length ? args.verifyDevices : ["desktop"]) {
    deployArgs.push("--device", device);
  }
  deployArgs.push("--session", sessionName, "--publish-dir", publishDir, "--json");
  for (const flow of args.verifyFlows) {
    deployArgs.push("--flow", flow);
  }
  if (args.verifySnapshot) {
    deployArgs.push("--snapshot", args.verifySnapshot);
  }
  if (args.updateVerifySnapshot) {
    deployArgs.push("--update-snapshot");
  }
  if (args.verifyConsoleErrors) {
    deployArgs.push("--strict-console");
  }

  const child = spawnSync(BUN_RUNTIME, deployArgs, {
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

function trackedRepoPath(targetPath: string): string {
  const cleaned = cleanSubject(targetPath);
  if (!cleaned) return "";
  const absolute = path.resolve(process.cwd(), cleaned);
  const relative = path.relative(process.cwd(), absolute);
  if (relative.startsWith("..")) return "";
  return relative.replace(/\\/g, "/");
}

function repoBlobUrl(repo: string, branch: string, relativePath: string): string {
  if (!repo || !branch || !relativePath) return "";
  const encoded = relativePath.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${encoded}`;
}

function defaultPagesBaseUrl(repo: string): string {
  const [owner, name] = String(repo || "").split("/");
  if (!owner || !name) return "";
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${name}/`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function pagesBaseUrl(repo: string): string {
  return cleanSubject(process.env.CODEX_STACK_PAGES_BASE_URL || defaultPagesBaseUrl(repo));
}

function pagesSitePath(targetPath: string): string {
  const relative = trackedRepoPath(targetPath);
  if (!relative || !relative.startsWith("docs/qa/")) return "";
  const sitePath = relative.slice("docs/".length);
  return sitePath.endsWith("/report.md") || sitePath.endsWith("/report.json")
    ? `${sitePath.replace(/\/report\.(md|json)$/i, "/")}`
    : sitePath;
}

function pagesUrl(repo: string, targetPath: string): string {
  const baseUrl = pagesBaseUrl(repo);
  const sitePath = pagesSitePath(targetPath);
  if (!baseUrl || !sitePath) return "";
  return new URL(sitePath.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl)).toString();
}

function isTrackedPath(relativePath: string): boolean {
  if (!relativePath) return false;
  return Boolean(run(`git ls-files --error-unmatch -- ${quote(relativePath)}`, { allowFailure: true }));
}

function markdownReference(repo: string, branch: string, targetPath: string): string {
  const relative = trackedRepoPath(targetPath);
  if (!relative) return "";
  if (isTrackedPath(relative)) {
    return `[${relative}](${repoBlobUrl(repo, branch, relative)})`;
  }
  return `\`${relative}\` (local only)`;
}

function pagesReference(repo: string, targetPath: string, label = ""): string {
  const stableUrl = pagesUrl(repo, targetPath);
  const sitePath = pagesSitePath(targetPath);
  if (!stableUrl || !sitePath) return "";
  return `[${label || sitePath}](${stableUrl})`;
}

function qaFindingSummary(findings: QaFinding[] | undefined, limit = 5): string[] {
  if (!Array.isArray(findings) || !findings.length) return ["- No findings."];
  const lines = findings
    .slice(0, limit)
    .map((item) => `- ${String(item.severity || "info").toUpperCase()}${item.category ? `/${String(item.category).toUpperCase()}` : ""}: ${item.title}`);
  if (findings.length > limit) {
    lines.push(`- ...and ${findings.length - limit} more`);
  }
  return lines;
}

function deployCheckSummary(entries: DeployPathResult[] | undefined, limit = 6): string[] {
  if (!Array.isArray(entries) || !entries.length) return ["- No deploy checks recorded."];
  const lines = entries.slice(0, limit).map((entry) => {
    const parts = [
      `${entry.path || "/"} @ ${entry.device || "desktop"}`,
      `status=${entry.status || "unknown"}`,
      entry.httpStatus !== null && entry.httpStatus !== undefined ? `http=${entry.httpStatus}` : "http=n/a",
      entry.console?.errors?.length ? `consoleErrors=${entry.console.errors.length}` : "",
      entry.console?.warnings?.length ? `consoleWarnings=${entry.console.warnings.length}` : "",
      entry.screenshot ? `screenshot=${entry.screenshot}` : "",
    ].filter(Boolean);
    return `- ${parts.join(", ")}`;
  });
  if (entries.length > limit) {
    lines.push(`- ...and ${entries.length - limit} more`);
  }
  return lines;
}

function deploySnapshotSummary(entries: DeploySnapshotResult[] | undefined, limit = 6): string[] {
  if (!Array.isArray(entries) || !entries.length) return ["- No snapshot checks configured."];
  const lines = entries.slice(0, limit).map((entry) => {
    const parts = [
      `${entry.name || "snapshot"} @ ${entry.targetPath || "/"} (${entry.device || "desktop"})`,
      `status=${entry.status || "unknown"}`,
      entry.annotation ? `annotation=${entry.annotation}` : "",
      entry.screenshot ? `screenshot=${entry.screenshot}` : "",
      entry.report ? `report=${entry.report}` : "",
    ].filter(Boolean);
    return `- ${parts.join(", ")}`;
  });
  if (entries.length > limit) {
    lines.push(`- ...and ${entries.length - limit} more`);
  }
  return lines;
}

function buildDeployPrComment({
  report,
  repo,
  branch,
}: {
  report: DeployReportSummary | null;
  repo: string;
  branch: string;
}): string {
  if (!report) return "";
  const deployReportPath = report.artifactRoot ? path.join(report.artifactRoot, "report.md") : "";
  const qaArtifacts = report.qa?.artifacts?.published || report.qa?.artifacts || {};
  const primarySnapshot = report.qa?.snapshotResults?.[0];
  const trackedReportRef = markdownReference(repo, branch, deployReportPath || qaArtifacts.markdown || qaArtifacts.json || "");
  const trackedAnnotationRef = markdownReference(repo, branch, primarySnapshot?.annotation || qaArtifacts.annotation || "");
  const trackedScreenshotRef = markdownReference(repo, branch, primarySnapshot?.screenshot || qaArtifacts.screenshot || "");
  const stableReportRef = pagesReference(repo, deployReportPath || qaArtifacts.markdown || qaArtifacts.json || "", "deploy report");
  const stableAnnotationRef = pagesReference(repo, primarySnapshot?.annotation || qaArtifacts.annotation || "", "annotation");
  const stableScreenshotRef = pagesReference(repo, primarySnapshot?.screenshot || qaArtifacts.screenshot || "", "screenshot");
  const screenshotManifestRef = markdownReference(repo, branch, report.screenshotManifest || "");
  const stableScreenshotManifestRef = pagesReference(repo, report.screenshotManifest || "", "screenshot manifest");
  const flowLines = Array.isArray(report.qa?.flowResults) && report.qa?.flowResults.length
    ? report.qa?.flowResults.map((item) => `- ${item.name}: ${item.status}${item.steps ? ` (${item.steps} steps)` : ""}`) || []
    : ["- No flows configured."];

  const sections = [
    "## Deploy Verification",
    "",
    `- Status: ${report.status}`,
    `- Health score: ${report.qa?.healthScore ?? "n/a"}`,
    `- Recommendation: ${report.recommendation || report.qa?.recommendation || "n/a"}`,
    "",
    "### Findings",
    "",
    ...qaFindingSummary(report.qa?.findings),
    "",
    "### Deploy checks",
    "",
    ...deployCheckSummary(report.pathResults),
    "",
    "### Flow results",
    "",
    ...flowLines,
  ];

  if (report.qa?.snapshotResults?.length) {
    sections.push(
      "",
      "### Snapshot results",
      "",
      ...deploySnapshotSummary(report.qa.snapshotResults)
    );
  }

  if (trackedReportRef || stableReportRef || trackedAnnotationRef || trackedScreenshotRef || screenshotManifestRef) {
    sections.push("");
    if (trackedReportRef) sections.push(`Deploy branch artifact: ${trackedReportRef}`);
    if (stableReportRef) sections.push(`Stable Pages URL after merge: ${stableReportRef}`);
    if (trackedAnnotationRef) sections.push(`Branch annotation: ${trackedAnnotationRef}`);
    if (stableAnnotationRef) sections.push(`Stable annotation URL after merge: ${stableAnnotationRef}`);
    if (trackedScreenshotRef) sections.push(`Branch screenshot: ${trackedScreenshotRef}`);
    if (stableScreenshotRef) sections.push(`Stable screenshot URL after merge: ${stableScreenshotRef}`);
    if (screenshotManifestRef) sections.push(`Screenshot manifest: ${screenshotManifestRef}`);
    if (stableScreenshotManifestRef) sections.push(`Stable screenshot manifest URL after merge: ${stableScreenshotManifestRef}`);
  }

  return `${sections.join("\n").trim()}\n`;
}

function safeGhComment(result: ShipResult, prUrl: string, body: string): void {
  if (!prUrl || !body) return;
  const workDir = path.resolve(process.cwd(), ".codex-stack", "ship");
  const tempPath = path.join(workDir, `pr-comment-${Date.now()}-${process.pid}.md`);
  ensureDir(workDir);
  fs.writeFileSync(tempPath, body);
  try {
    run(`gh pr comment ${quote(prUrl)} --body-file ${quote(tempPath)}`, { stdio: ["ignore", "pipe", "pipe"] });
    result.verification.commentPosted = true;
  } catch (error: unknown) {
    result.status = result.status === "ok" ? "warning" : result.status;
    result.warnings.push(`post verification comment: ${cleanSubject(error instanceof Error ? error.message : String(error))}`);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function printText(result: ShipResult): void {
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
  if (result.verification.paths.length) {
    console.log(`- Verification paths: ${result.verification.paths.join(", ")}`);
  }
  if (result.verification.devices.length) {
    console.log(`- Verification devices: ${result.verification.devices.join(", ")}`);
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
  if (result.verification.consoleErrors) {
    console.log(`- Verification console errors: ${result.verification.consoleErrors}`);
  }
  if (result.verification.reportPath) {
    console.log(`- Verification report: ${result.verification.reportPath}`);
  }
  if (result.verification.stableReportUrl) {
    console.log(`- Verification Pages URL: ${result.verification.stableReportUrl}`);
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
const result: ShipResult = {
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
    paths: [...args.verifyPaths],
    devices: [...args.verifyDevices],
    flows: [...args.verifyFlows],
    snapshot: cleanSubject(args.verifySnapshot),
    session: cleanSubject(args.verifySession),
    status: "",
    healthScore: null,
    consoleErrors: 0,
    reportPath: "",
    stableReportUrl: "",
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
  const verificationParts: string[] = [];
  const effectivePaths = args.verifyPaths.length ? args.verifyPaths : ["/"];
  const effectiveDevices = args.verifyDevices.length ? args.verifyDevices : ["desktop"];
  if (effectivePaths.length) verificationParts.push(`paths ${effectivePaths.join(", ")}`);
  if (effectiveDevices.length) verificationParts.push(`devices ${effectiveDevices.join(", ")}`);
  if (args.verifyFlows.length) verificationParts.push(`flows ${args.verifyFlows.join(", ")}`);
  if (args.verifySnapshot) verificationParts.push(`${args.updateVerifySnapshot ? "refresh" : "compare"} snapshot ${args.verifySnapshot}`);
  if (args.verifyConsoleErrors) verificationParts.push("strict console errors");
  result.verification.session = result.verification.session || defaultVerifySession(result.branch);
  result.verification.publishDir = defaultVerifyPublishDir(result.branch);
  result.verification.paths = effectivePaths;
  result.verification.devices = effectiveDevices;
  result.verification.stableReportUrl = pagesUrl(
    result.automation.repo,
    path.join(result.verification.publishDir, "report.md")
  );
  result.steps.push(`verify deploy on ${args.verifyUrl}${verificationParts.length ? ` (${verificationParts.join("; ")})` : ""}`);
  result.steps.push(`publish deploy artifacts to ${result.verification.publishDir}`);
  if (!args.dryRun) {
    const verification = runDeployVerification(args, result.branch);
    result.verification.session = verification.session;
    result.verification.publishDir = verification.publishDir;
    if (!verification.ok || !verification.report) {
      console.error(verification.stderr || verification.stdout || "Deploy verification failed.");
      process.exit(1);
    }
    result.verification.status = verification.report.status || "";
    result.verification.healthScore = verification.report.qa?.healthScore ?? null;
    result.verification.consoleErrors = (verification.report.pathResults || []).reduce((count: number, entry: DeployPathResult) => (
      count + (Array.isArray(entry.console?.errors) ? entry.console?.errors.length : 0)
    ), 0);
    result.verification.reportPath = verification.report.artifactRoot
      ? path.join(verification.report.artifactRoot, "report.md")
      : "";
    result.verification.stableReportUrl = pagesUrl(
      result.automation.repo,
      result.verification.reportPath
    );
    verificationCommentBody = buildDeployPrComment({
      report: verification.report,
      repo: result.automation.repo,
      branch: result.branch,
    });
    result.verification.commentPreview = verificationCommentBody.split(/\r?\n/).slice(0, 20).join("\n");
    if (verification.report.status === "critical") {
      console.error(`Deploy verification failed: ${verification.report.recommendation}`);
      process.exit(1);
    }
    if (verification.report.status === "warning") {
      result.status = result.status === "ok" ? "warning" : result.status;
      result.warnings.push(`deploy verification: ${verification.report.recommendation}`);
    }
  }
}

const dirtyAfterVerification = run("git status --porcelain", { allowFailure: true });
if (dirtyAfterVerification) {
  let commitMessage = "";
  if (args.message) {
    commitMessage = args.message;
  } else if (!result.dirtyBefore && shouldRunVerification(args) && !args.dryRun && (args.push || args.pr)) {
    commitMessage = `chore: publish deploy artifacts for ${result.branch}`;
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
    result.steps.push("plan deploy verification comment");
  }
  result.steps.push("open pull request");

  if (!args.dryRun) {
    const workDir = path.resolve(process.cwd(), ".codex-stack", "ship");
    const tempPath = path.join(workDir, `pr-body-${Date.now()}-${process.pid}.md`);
    ensureDir(workDir);
    fs.writeFileSync(tempPath, prContent.body);
    try {
      const prCmd: string[] = [
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
