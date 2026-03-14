#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";

type CheckStatus = "ok" | "warning" | "error" | "skipped";
type CheckCategory = "runtime" | "dependencies" | "workflows" | "installHealth";

interface RunOptions extends Partial<ExecSyncOptionsWithStringEncoding> {
  allowFailure?: boolean;
}

interface ParsedArgs {
  json: boolean;
  jsonOut: string;
  markdownOut: string;
  repo: string;
  offline: boolean;
}

interface PackageManifest {
  packageManager?: string;
  engines?: {
    bun?: string;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface CheckItem {
  category: CheckCategory;
  name: string;
  status: CheckStatus;
  detail: string;
  current?: string;
  latest?: string;
  source?: string;
}

interface CheckCounts {
  ok: number;
  warning: number;
  error: number;
  skipped: number;
}

interface UpgradeReport {
  marker: string;
  generatedAt: string;
  repo: string;
  offline: boolean;
  overallStatus: CheckStatus;
  counts: CheckCounts;
  checks: Record<CheckCategory, CheckItem[]>;
  recommendedActions: string[];
}

interface WorkflowReference {
  workflowPath: string;
  action: string;
  ref: string;
}

interface GitHubRefResult {
  latestRef: string;
  source: "release" | "tag";
}

function usage(): never {
  console.log(`upgrade-check

Usage:
  bun scripts/upgrade-check.ts [--json] [--json-out <path>] [--markdown-out <path>] [--repo <owner/name>] [--offline]
`);
  process.exit(0);
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
    const stderr = typeof error === "object" && error && "stderr" in error ? String((error as { stderr?: unknown }).stderr || "") : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(stderr || message);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    json: false,
    jsonOut: "",
    markdownOut: "",
    repo: "",
    offline: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--json-out") {
      args.jsonOut = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--markdown-out") {
      args.markdownOut = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--repo") {
      args.repo = String(argv[i + 1] || "").trim();
      i += 1;
    } else if (arg === "--offline") {
      args.offline = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  return args;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetPath: string, content: string): void {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
}

function inferGithubRepo(): string {
  if (process.env.GITHUB_REPOSITORY) return String(process.env.GITHUB_REPOSITORY).trim();
  const remote = run("git remote get-url origin", { allowFailure: true });
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : path.basename(process.cwd());
}

function readPackageManifest(): PackageManifest {
  const packagePath = path.join(process.cwd(), "package.json");
  return JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageManifest;
}

function normalizeVersion(value: string): string {
  const match = String(value || "").match(/v?\d+(?:\.\d+){0,2}/);
  return match ? match[0].replace(/^v/, "") : "";
}

function parseVersion(value: string): number[] {
  const token = normalizeVersion(value);
  if (!token) return [0, 0, 0];
  const parts = token.split(".").map((part) => Number.parseInt(part, 10));
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3).map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

function classifyDrift(current: string, latest: string): "major" | "minor" | "patch" | "current" {
  const left = parseVersion(current);
  const right = parseVersion(latest);
  if (left[0] !== right[0]) return "major";
  if (left[1] !== right[1]) return "minor";
  if (left[2] !== right[2]) return "patch";
  return "current";
}

function readModeNames(): string[] {
  const skillsDir = path.join(process.cwd(), "skills");
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function collectRuntimeChecks(manifest: PackageManifest): CheckItem[] {
  const checks: CheckItem[] = [];
  const currentBun = run("bun --version", { allowFailure: true });
  const packageManagerVersion = String(manifest.packageManager || "").startsWith("bun@")
    ? String(manifest.packageManager || "").slice(4)
    : "";
  const engineRequirement = String(manifest.engines?.bun || "").trim();

  if (!currentBun) {
    checks.push({
      category: "runtime",
      name: "Bun runtime",
      status: "error",
      detail: "Bun is required but `bun --version` did not return a version.",
    });
    return checks;
  }

  if (packageManagerVersion && compareVersions(currentBun, packageManagerVersion) < 0) {
    checks.push({
      category: "runtime",
      name: "Bun packageManager alignment",
      status: "warning",
      current: currentBun,
      latest: packageManagerVersion,
      detail: `Installed Bun ${currentBun} is older than packageManager bun@${packageManagerVersion}.`,
    });
  } else {
    checks.push({
      category: "runtime",
      name: "Bun packageManager alignment",
      status: "ok",
      current: currentBun,
      latest: packageManagerVersion || currentBun,
      detail: packageManagerVersion
        ? `Installed Bun ${currentBun} satisfies packageManager bun@${packageManagerVersion}.`
        : `Installed Bun ${currentBun} is available.`,
    });
  }

  const minEngineVersion = normalizeVersion(engineRequirement);
  if (minEngineVersion && compareVersions(currentBun, minEngineVersion) < 0) {
    checks.push({
      category: "runtime",
      name: "Bun engines alignment",
      status: "error",
      current: currentBun,
      latest: minEngineVersion,
      detail: `Installed Bun ${currentBun} does not satisfy engines.bun ${engineRequirement}.`,
    });
  } else {
    checks.push({
      category: "runtime",
      name: "Bun engines alignment",
      status: "ok",
      current: currentBun,
      latest: engineRequirement || currentBun,
      detail: engineRequirement
        ? `Installed Bun ${currentBun} satisfies engines.bun ${engineRequirement}.`
        : `No explicit engines.bun constraint is set.`,
    });
  }

  return checks;
}

async function fetchJson(url: string, token: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers = new Headers({ Accept: "application/json" });
  if (token && url.startsWith("https://api.github.com/")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { headers });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

async function collectDependencyChecks(manifest: PackageManifest, offline: boolean): Promise<CheckItem[]> {
  const checks: CheckItem[] = [];
  const allPackages = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };
  const entries = Object.entries(allPackages).sort(([left], [right]) => left.localeCompare(right));

  if (!entries.length) {
    return [{
      category: "dependencies",
      name: "Dependencies",
      status: "ok",
      detail: "No package dependencies are declared.",
    }];
  }

  if (offline) {
    return [{
      category: "dependencies",
      name: "Dependency drift",
      status: "skipped",
      detail: "Dependency drift checks were skipped because the run is offline.",
    }];
  }

  const token = process.env.GITHUB_TOKEN || "";
  let outdatedCount = 0;
  let skippedCount = 0;

  for (const [packageName, packageRange] of entries) {
    const result = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, token);
    const latestVersion = typeof result.data === "object" && result.data && "version" in result.data
      ? String((result.data as { version?: unknown }).version || "")
      : "";
    const currentVersion = normalizeVersion(packageRange);

    if (!result.ok || !latestVersion) {
      skippedCount += 1;
      checks.push({
        category: "dependencies",
        name: packageName,
        status: "skipped",
        current: packageRange,
        detail: `Unable to resolve the latest npm version for ${packageName}.`,
      });
      continue;
    }

    if (!currentVersion) {
      outdatedCount += 1;
      checks.push({
        category: "dependencies",
        name: packageName,
        status: "warning",
        current: packageRange,
        latest: latestVersion,
        detail: `The declared range ${packageRange} could not be normalized for comparison against ${latestVersion}.`,
      });
      continue;
    }

    if (compareVersions(currentVersion, latestVersion) < 0) {
      outdatedCount += 1;
      const drift = classifyDrift(currentVersion, latestVersion);
      checks.push({
        category: "dependencies",
        name: packageName,
        status: "warning",
        current: packageRange,
        latest: latestVersion,
        detail: `${drift} update available: ${packageRange} -> ${latestVersion}.`,
      });
    }
  }

  if (!outdatedCount && !skippedCount) {
    checks.push({
      category: "dependencies",
      name: "Dependency drift",
      status: "ok",
      detail: `All ${entries.length} declared dependencies match the latest npm tags checked in this run.`,
    });
  }

  return checks;
}

function parseWorkflowReferences(): WorkflowReference[] {
  const workflowsDir = path.join(process.cwd(), ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) return [];
  const references: WorkflowReference[] = [];
  for (const entry of fs.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml")).sort()) {
    const workflowPath = path.join(workflowsDir, entry);
    const content = fs.readFileSync(workflowPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)/);
      if (!match) continue;
      references.push({
        workflowPath: path.relative(process.cwd(), workflowPath),
        action: match[1],
        ref: match[2],
      });
    }
  }
  return references;
}

function looksLikeCommitRef(ref: string): boolean {
  return /^[a-f0-9]{7,40}$/i.test(ref.trim());
}

async function fetchLatestGitHubRef(action: string, token: string): Promise<GitHubRefResult | null> {
  const release = await fetchJson(`https://api.github.com/repos/${action}/releases/latest`, token);
  const releaseTag = typeof release.data === "object" && release.data && "tag_name" in release.data
    ? String((release.data as { tag_name?: unknown }).tag_name || "")
    : "";
  if (release.ok && releaseTag) {
    return { latestRef: releaseTag, source: "release" };
  }

  const tags = await fetchJson(`https://api.github.com/repos/${action}/tags?per_page=1`, token);
  const tagName = Array.isArray(tags.data) && tags.data[0] && typeof tags.data[0] === "object" && "name" in tags.data[0]
    ? String((tags.data[0] as { name?: unknown }).name || "")
    : "";
  if (tags.ok && tagName) {
    return { latestRef: tagName, source: "tag" };
  }

  return null;
}

function classifyWorkflowRef(currentRef: string, latestRef: string): { status: CheckStatus; detail: string } {
  if (looksLikeCommitRef(currentRef)) {
    return {
      status: "ok",
      detail: `Pinned to commit ${currentRef}; review manually when you want to refresh this action.`,
    };
  }

  const currentTrimmed = currentRef.trim();
  if (/^v?\d+$/.test(currentTrimmed)) {
    const currentMajor = parseVersion(currentTrimmed)[0];
    const latestMajor = parseVersion(latestRef)[0];
    if (currentMajor < latestMajor) {
      return {
        status: "warning",
        detail: `Major update available: ${currentRef} -> ${latestRef}.`,
      };
    }
    return {
      status: "ok",
      detail: `Major-pinned ref ${currentRef} still covers the latest major ${latestMajor}.`,
    };
  }

  if (normalizeVersion(currentTrimmed) && normalizeVersion(latestRef) && compareVersions(currentTrimmed, latestRef) < 0) {
    return {
      status: "warning",
      detail: `Update available: ${currentRef} -> ${latestRef}.`,
    };
  }

  return {
    status: "ok",
    detail: `Pinned ref ${currentRef} is current for the resolution used in this run.`,
  };
}

async function collectWorkflowChecks(offline: boolean): Promise<CheckItem[]> {
  const references = parseWorkflowReferences();
  if (!references.length) {
    return [{
      category: "workflows",
      name: "Workflow action refs",
      status: "ok",
      detail: "No GitHub Action `uses:` refs were found.",
    }];
  }

  if (offline) {
    return [{
      category: "workflows",
      name: "Workflow action drift",
      status: "skipped",
      detail: "Workflow action drift checks were skipped because the run is offline.",
    }];
  }

  const token = process.env.GITHUB_TOKEN || "";
  const checks: CheckItem[] = [];
  let warningCount = 0;

  for (const reference of references) {
    const latest = await fetchLatestGitHubRef(reference.action, token);
    if (!latest) {
      checks.push({
        category: "workflows",
        name: `${reference.action} in ${reference.workflowPath}`,
        status: "skipped",
        current: reference.ref,
        source: reference.workflowPath,
        detail: `Unable to resolve the latest tag for ${reference.action}.`,
      });
      continue;
    }

    const classification = classifyWorkflowRef(reference.ref, latest.latestRef);
    if (classification.status === "warning") warningCount += 1;
    checks.push({
      category: "workflows",
      name: `${reference.action} in ${reference.workflowPath}`,
      status: classification.status,
      current: reference.ref,
      latest: latest.latestRef,
      source: latest.source,
      detail: classification.detail,
    });
  }

  if (!warningCount && checks.every((item) => item.status !== "skipped")) {
    checks.push({
      category: "workflows",
      name: "Workflow action drift",
      status: "ok",
      detail: `All ${references.length} workflow action refs are current for the resolution used in this run.`,
    });
  }

  return checks;
}

function collectInstallHealthChecks(modeNames: string[]): CheckItem[] {
  const checks: CheckItem[] = [];
  const wrapperRoot = path.join(process.cwd(), ".codex-stack", "bin");
  const expectedWrappers = ["codex-stack", "codex-stack-browse", ...modeNames];
  const missingWrappers = expectedWrappers.filter((name) => {
    const target = path.join(wrapperRoot, name);
    return !fs.existsSync(target) || !fs.statSync(target).isFile();
  });

  if (missingWrappers.length) {
    checks.push({
      category: "installHealth",
      name: "Local wrappers",
      status: "warning",
      detail: `Missing local wrappers: ${missingWrappers.join(", ")}.`,
      source: path.relative(process.cwd(), wrapperRoot),
    });
  } else {
    checks.push({
      category: "installHealth",
      name: "Local wrappers",
      status: "ok",
      detail: `All ${expectedWrappers.length} local wrappers exist under ${path.relative(process.cwd(), wrapperRoot)}.`,
      source: path.relative(process.cwd(), wrapperRoot),
    });
  }

  const installTargets = [
    { label: "User skill links", root: path.join(process.env.HOME || "", ".codex", "skills"), installMode: "user" },
    { label: "Project skill links", root: path.join(process.cwd(), ".codex", "skills"), installMode: `project ${process.cwd()}` },
  ];

  for (const target of installTargets) {
    if (!target.root || !fs.existsSync(target.root)) {
      checks.push({
        category: "installHealth",
        name: target.label,
        status: "skipped",
        detail: `${target.root} does not exist in this environment.`,
        source: target.root,
      });
      continue;
    }

    const brokenLinks: string[] = [];
    const missingLinks: string[] = [];
    for (const modeName of modeNames) {
      const skillPath = path.join(target.root, `codex-stack-${modeName}`);
      if (!fs.existsSync(skillPath)) {
        missingLinks.push(`codex-stack-${modeName}`);
        continue;
      }
      const stats = fs.lstatSync(skillPath);
      if (stats.isSymbolicLink()) {
        const resolved = fs.realpathSync(skillPath);
        if (!resolved.startsWith(path.join(process.cwd(), "skills"))) {
          brokenLinks.push(`codex-stack-${modeName}`);
        }
      }
    }

    if (brokenLinks.length || missingLinks.length) {
      checks.push({
        category: "installHealth",
        name: target.label,
        status: "warning",
        detail: `Missing links: ${missingLinks.join(", ") || "none"}; mismatched links: ${brokenLinks.join(", ") || "none"}.`,
        source: target.root,
      });
    } else {
      checks.push({
        category: "installHealth",
        name: target.label,
        status: "ok",
        detail: `All ${modeNames.length} codex-stack skill links are present under ${target.root}.`,
        source: target.root,
      });
    }
  }

  return checks;
}

function flattenChecks(checks: Record<CheckCategory, CheckItem[]>): CheckItem[] {
  return [...checks.runtime, ...checks.dependencies, ...checks.workflows, ...checks.installHealth];
}

function countStatuses(items: CheckItem[]): CheckCounts {
  return items.reduce<CheckCounts>((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, { ok: 0, warning: 0, error: 0, skipped: 0 });
}

function overallStatus(counts: CheckCounts): CheckStatus {
  if (counts.error) return "error";
  if (counts.warning) return "warning";
  if (counts.ok) return "ok";
  return "skipped";
}

function recommendedActions(checks: Record<CheckCategory, CheckItem[]>): string[] {
  const actions = new Set<string>();
  if (checks.runtime.some((item) => item.status === "warning" || item.status === "error")) {
    actions.add("Upgrade Bun so the local runtime satisfies packageManager and engines.bun.");
  }
  if (checks.dependencies.some((item) => item.status === "warning")) {
    actions.add("Review package.json versions, update the outdated dependencies, then run `bun install`.");
  }
  if (checks.workflows.some((item) => item.status === "warning")) {
    actions.add("Review the stale GitHub Action refs under `.github/workflows/` and bump the pinned versions intentionally.");
  }
  if (checks.installHealth.some((item) => item.name === "Local wrappers" && item.status === "warning")) {
    actions.add("Run `bash ./setup` to regenerate the local codex-stack wrappers.");
  }
  if (checks.installHealth.some((item) => item.name === "User skill links" && item.status === "warning")) {
    actions.add("Run `bash scripts/install-skills.sh user` to refresh the user-level Codex skill links.");
  }
  if (checks.installHealth.some((item) => item.name === "Project skill links" && item.status === "warning")) {
    actions.add("Run `bash scripts/install-skills.sh project $(pwd)` to refresh the project-level Codex skill links.");
  }
  if (!actions.size) {
    actions.add("No upgrade action is required right now.");
  }
  return [...actions];
}

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "warning":
      return "WARNING";
    case "error":
      return "ERROR";
    default:
      return "SKIPPED";
  }
}

function renderSection(items: CheckItem[], emptyMessage: string): string {
  if (!items.length) return `- ${emptyMessage}`;
  return items
    .map((item) => {
      const detailParts = [item.detail];
      if (item.current) detailParts.push(`current: ${item.current}`);
      if (item.latest) detailParts.push(`latest: ${item.latest}`);
      return `- **${statusIcon(item.status)}** ${item.name}: ${detailParts.join(" | ")}`;
    })
    .join("\n");
}

function renderMarkdown(report: UpgradeReport): string {
  return `${report.marker}
# codex-stack daily update check

- Repo: ${report.repo}
- Generated: ${report.generatedAt}
- Overall status: ${report.overallStatus}
- Counts: ok ${report.counts.ok}, warning ${report.counts.warning}, error ${report.counts.error}, skipped ${report.counts.skipped}
- Offline mode: ${report.offline ? "yes" : "no"}

## Runtime alignment

${renderSection(report.checks.runtime, "No runtime checks were generated.")}

## Dependency drift

${renderSection(report.checks.dependencies, "No dependency checks were generated.")}

## Workflow action drift

${renderSection(report.checks.workflows, "No workflow checks were generated.")}

## Install health

${renderSection(report.checks.installHealth, "No install health checks were generated.")}

## Recommended actions

${report.recommendedActions.map((item) => `- ${item}`).join("\n")}
`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readPackageManifest();
  const modeNames = readModeNames();
  const repo = args.repo || inferGithubRepo();

  const checks: Record<CheckCategory, CheckItem[]> = {
    runtime: collectRuntimeChecks(manifest),
    dependencies: await collectDependencyChecks(manifest, args.offline),
    workflows: await collectWorkflowChecks(args.offline),
    installHealth: collectInstallHealthChecks(modeNames),
  };

  const allChecks = flattenChecks(checks);
  const counts = countStatuses(allChecks);
  const report: UpgradeReport = {
    marker: "<!-- codex-stack:daily-update-check -->",
    generatedAt: new Date().toISOString(),
    repo,
    offline: args.offline,
    overallStatus: overallStatus(counts),
    counts,
    checks,
    recommendedActions: recommendedActions(checks),
  };

  const markdown = renderMarkdown(report);
  if (args.markdownOut) {
    writeFile(args.markdownOut, markdown);
  }
  if (args.jsonOut) {
    writeFile(args.jsonOut, JSON.stringify(report, null, 2));
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(markdown);
}

await main();
