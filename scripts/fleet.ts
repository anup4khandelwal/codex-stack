#!/usr/bin/env bun
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execSync, spawnSync, type ExecSyncOptionsWithStringEncoding } from "node:child_process";

const DEFAULT_STATUS_ARTIFACT = "codex-stack-fleet-status";
const DEFAULT_BRANCH = "main";
const DEFAULT_SYNC_BRANCH = "chore/codex-stack-fleet-sync";
const DEFAULT_POLICY_DIR = ".codex-stack/policies";
const FLEET_MEMBER_PATH = ".codex-stack/fleet-member.json";
const FLEET_STATUS_SCRIPT_PATH = ".github/codex-stack/fleet-status.js";
const FLEET_STATUS_WORKFLOW_PATH = ".github/workflows/codex-stack-fleet-status.yml";
const FLEET_STATUS_DIR = ".codex-stack/fleet-status";
const FLEET_STATUS_JSON = `${FLEET_STATUS_DIR}/status.json`;
const FLEET_STATUS_MD = `${FLEET_STATUS_DIR}/summary.md`;
const ALLOWED_CHECKS = new Set(["review", "qa", "preview", "deploy", "ship", "fleet-status"]);

type FleetCheck = "review" | "qa" | "preview" | "deploy" | "ship" | "fleet-status";
type DriftState = "healthy" | "missing" | "outdated" | "diverged";
type RepoHealth = "healthy" | "warning" | "critical" | "missing" | "unknown";

interface RunOptions extends Partial<ExecSyncOptionsWithStringEncoding> {
  allowFailure?: boolean;
}

interface ParsedArgs {
  command: "validate" | "sync" | "collect" | "dashboard";
  manifestPath: string;
  json: boolean;
  jsonOut: string;
  markdownOut: string;
  outDir: string;
  dryRun: boolean;
  openPrs: boolean;
  branchName: string;
}

interface FleetManifest {
  schemaVersion?: number;
  controlRepo?: string;
  defaultBranch?: string;
  policyDir?: string;
  syncBranch?: string;
  statusArtifactName?: string;
  repos?: FleetTarget[];
}

interface FleetTarget {
  repo: string;
  branch?: string;
  team?: string;
  localPath?: string;
  policyPack?: string;
  previewUrlTemplate?: string;
  enabledChecks?: string[];
  qa?: FleetQaConfig;
  preview?: FleetPreviewConfig;
  decisions?: FleetDecisionConfig;
  metadata?: Record<string, string>;
}

interface FleetQaConfig {
  mode?: string;
  paths?: string[];
  devices?: string[];
  flows?: string[];
  snapshots?: string[];
  a11y?: boolean;
  perf?: boolean;
  perfBudgets?: string[];
}

interface FleetPreviewConfig {
  paths?: string[];
  devices?: string[];
  flows?: string[];
  snapshots?: string[];
  waitTimeout?: number;
  waitInterval?: number;
  strictConsole?: boolean;
  strictHttp?: boolean;
  urlTemplate?: string;
}

interface FleetDecisionConfig {
  staleAfterDays?: number;
  expiringSoonDays?: number;
}

interface FleetPolicyPack {
  name?: string;
  description?: string;
  requiredChecks?: FleetCheck[];
  qa?: FleetQaConfig;
  preview?: FleetPreviewConfig;
  decisions?: FleetDecisionConfig;
  schedule?: {
    cron?: string;
  };
}

interface FleetContext {
  manifestPath: string;
  manifestDir: string;
  manifest: FleetManifest;
  controlRepo: string;
  controlRef: string;
  statusArtifactName: string;
  syncBranch: string;
  policyDir: string;
}

interface FleetMemberConfig {
  schemaVersion: number;
  generatedAt: string;
  controlRepo: string;
  controlRef: string;
  sourceManifest: string;
  repo: string;
  branch: string;
  team: string;
  policyPack: string;
  requiredChecks: FleetCheck[];
  previewUrlTemplate: string;
  metadata: Record<string, string>;
  qa: FleetQaConfig;
  preview: FleetPreviewConfig;
  decisions: FleetDecisionConfig;
  schedule: {
    cron: string;
  };
  statusArtifactName: string;
}

interface GeneratedFiles {
  memberConfigJson: string;
  workflowYaml: string;
  statusScriptJs: string;
}

interface SyncFilePlan {
  path: string;
  changed: boolean;
}

interface SyncPlan {
  repo: string;
  branch: string;
  team: string;
  policyPack: string;
  localPath: string;
  drift: DriftState;
  files: SyncFilePlan[];
  memberConfig: FleetMemberConfig;
  generated: GeneratedFiles;
  existing: Record<string, string>;
  reasons: string[];
}

interface SyncResult {
  repo: string;
  drift: DriftState;
  action: "planned" | "written" | "opened-pr" | "skipped";
  branch: string;
  localPath: string;
  prUrl: string;
  filesChanged: string[];
}

interface FleetStatusReport {
  marker?: string;
  generatedAt?: string;
  repo?: string;
  branch?: string;
  installed?: boolean;
  controlRepo?: string;
  team?: string;
  policyPack?: string;
  requiredChecks?: string[];
  status?: RepoHealth;
  riskScore?: number;
  latestReport?: {
    generatedAt?: string;
    status?: string;
    recommendation?: string;
    healthScore?: number;
    visualRiskScore?: number | null;
    visualRiskLevel?: string;
    unresolvedRegressions?: number;
    approvedRegressions?: number;
    expiredDecisions?: number;
    staleBaselines?: number;
    accessibilityViolations?: number | null;
    performanceBudgetViolations?: number | null;
    reportPath?: string;
  } | null;
}

interface CollectedFleetRepo {
  repo: string;
  branch: string;
  team: string;
  policyPack: string;
  installed: boolean;
  drift: DriftState;
  status: RepoHealth;
  riskScore: number;
  requiredChecks: string[];
  latestReport: FleetStatusReport["latestReport"];
  source: "local" | "artifact" | "repo-files" | "missing";
}

interface FleetCollectReport {
  marker: string;
  generatedAt: string;
  controlRepo: string;
  manifestPath: string;
  counts: {
    repos: number;
    healthy: number;
    warning: number;
    critical: number;
    missing: number;
    unknown: number;
    drifted: number;
  };
  repos: CollectedFleetRepo[];
  topRisks: CollectedFleetRepo[];
}

function normalizeMemberConfigText(text: string): string {
  if (!clean(text)) return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    delete parsed.generatedAt;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return clean(text);
  }
}

function usage(): never {
  console.log(`fleet

Usage:
  bun scripts/fleet.ts validate --manifest <path> [--json] [--json-out <path>] [--markdown-out <path>]
  bun scripts/fleet.ts sync --manifest <path> [--dry-run] [--open-prs] [--branch-name <name>] [--json] [--json-out <path>] [--markdown-out <path>]
  bun scripts/fleet.ts collect --manifest <path> [--json] [--json-out <path>] [--markdown-out <path>]
  bun scripts/fleet.ts dashboard --manifest <path> --out <dir> [--json] [--json-out <path>]
`);
  process.exit(0);
}

function clean(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetPath: string, content: string): void {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
}

function sortUnique(items: string[]): string[] {
  return [...new Set(items.map((item) => clean(item)).filter(Boolean))].sort();
}

function uniqChecks(items: string[]): FleetCheck[] {
  return sortUnique(items).filter((item): item is FleetCheck => ALLOWED_CHECKS.has(item as FleetCheck));
}

function asObject<T>(value: unknown): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

function runArgs(program: string, args: string[], cwd = process.cwd()): string {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(clean(result.stderr || result.stdout || `${program} exited with status ${result.status ?? 1}`));
  }
  return clean(result.stdout || "");
}

function inferControlRepo(): string {
  if (process.env.GITHUB_REPOSITORY) return clean(process.env.GITHUB_REPOSITORY);
  const remote = run("git remote get-url origin", { allowFailure: true });
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : "";
}

function inferControlRef(): string {
  return clean(run("git rev-parse HEAD", { allowFailure: true })) || "local";
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = clean(argv[0]) as ParsedArgs["command"];
  if (!command || !(command === "validate" || command === "sync" || command === "collect" || command === "dashboard")) usage();

  const out: ParsedArgs = {
    command,
    manifestPath: "",
    json: false,
    jsonOut: "",
    markdownOut: "",
    outDir: path.resolve(process.cwd(), ".fleet-site"),
    dryRun: false,
    openPrs: false,
    branchName: DEFAULT_SYNC_BRANCH,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--manifest") {
      out.manifestPath = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--json-out") {
      out.jsonOut = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--markdown-out") {
      out.markdownOut = path.resolve(process.cwd(), argv[i + 1] || "");
      i += 1;
    } else if (arg === "--out") {
      out.outDir = path.resolve(process.cwd(), argv[i + 1] || ".fleet-site");
      i += 1;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--open-prs") {
      out.openPrs = true;
    } else if (arg === "--branch-name") {
      out.branchName = clean(argv[i + 1] || DEFAULT_SYNC_BRANCH) || DEFAULT_SYNC_BRANCH;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }

  if (!out.manifestPath) {
    throw new Error("Pass --manifest <path>.");
  }
  return out;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalizeQaConfig(value: unknown): FleetQaConfig {
  const input = asObject<FleetQaConfig>(value);
  return {
    mode: clean(input.mode || "") || undefined,
    paths: sortUnique(asArray<string>(input.paths)),
    devices: sortUnique(asArray<string>(input.devices)),
    flows: sortUnique(asArray<string>(input.flows)),
    snapshots: sortUnique(asArray<string>(input.snapshots)),
    a11y: Boolean(input.a11y),
    perf: Boolean(input.perf),
    perfBudgets: sortUnique(asArray<string>(input.perfBudgets)),
  };
}

function normalizePreviewConfig(value: unknown): FleetPreviewConfig {
  const input = asObject<FleetPreviewConfig>(value);
  return {
    paths: sortUnique(asArray<string>(input.paths)),
    devices: sortUnique(asArray<string>(input.devices)),
    flows: sortUnique(asArray<string>(input.flows)),
    snapshots: sortUnique(asArray<string>(input.snapshots)),
    waitTimeout: Number.isFinite(Number(input.waitTimeout)) ? Number(input.waitTimeout) : undefined,
    waitInterval: Number.isFinite(Number(input.waitInterval)) ? Number(input.waitInterval) : undefined,
    strictConsole: Boolean(input.strictConsole),
    strictHttp: Boolean(input.strictHttp),
    urlTemplate: clean(input.urlTemplate || "") || undefined,
  };
}

function normalizeDecisionConfig(value: unknown): FleetDecisionConfig {
  const input = asObject<FleetDecisionConfig>(value);
  return {
    staleAfterDays: Number.isFinite(Number(input.staleAfterDays)) ? Number(input.staleAfterDays) : undefined,
    expiringSoonDays: Number.isFinite(Number(input.expiringSoonDays)) ? Number(input.expiringSoonDays) : undefined,
  };
}

function loadFleetContext(manifestPath: string): FleetContext {
  if (!fs.existsSync(manifestPath)) throw new Error(`Fleet manifest not found: ${manifestPath}`);
  const manifest = readJsonFile<FleetManifest>(manifestPath);
  if (Number(manifest.schemaVersion || 1) !== 1) {
    throw new Error(`Unsupported fleet schemaVersion: ${manifest.schemaVersion}`);
  }
  const repos = asArray<FleetTarget>(manifest.repos);
  if (!repos.length) throw new Error("Fleet manifest must declare at least one repo.");

  const context: FleetContext = {
    manifestPath,
    manifestDir: path.dirname(manifestPath),
    manifest,
    controlRepo: clean(manifest.controlRepo || "") || inferControlRepo(),
    controlRef: inferControlRef(),
    statusArtifactName: clean(manifest.statusArtifactName || "") || DEFAULT_STATUS_ARTIFACT,
    syncBranch: clean(manifest.syncBranch || "") || DEFAULT_SYNC_BRANCH,
    policyDir: path.resolve(path.dirname(manifestPath), clean(manifest.policyDir || "") || DEFAULT_POLICY_DIR),
  };
  if (!context.controlRepo) throw new Error("Unable to infer control repo. Set controlRepo in the manifest.");
  return context;
}

function loadPolicyPack(context: FleetContext, name: string): FleetPolicyPack {
  const policyName = clean(name) || "default";
  const policyPath = path.join(context.policyDir, `${policyName}.json`);
  if (!fs.existsSync(policyPath)) {
    throw new Error(`Policy pack not found: ${policyPath}`);
  }
  const raw = readJsonFile<FleetPolicyPack>(policyPath);
  const requiredChecks = uniqChecks(asArray<string>(raw.requiredChecks));
  if (!requiredChecks.length) {
    throw new Error(`Policy pack ${policyName} must declare at least one required check.`);
  }
  return {
    name: policyName,
    description: clean(raw.description || "") || undefined,
    requiredChecks,
    qa: normalizeQaConfig(raw.qa),
    preview: normalizePreviewConfig(raw.preview),
    decisions: normalizeDecisionConfig(raw.decisions),
    schedule: {
      cron: clean(raw.schedule?.cron || "") || "17 8 * * 1-5",
    },
  };
}

function mergeQaConfig(base: FleetQaConfig, extra: FleetQaConfig): FleetQaConfig {
  return {
    mode: clean(extra.mode || "") || clean(base.mode || "") || undefined,
    paths: sortUnique([...(base.paths || []), ...(extra.paths || [])]),
    devices: sortUnique([...(base.devices || []), ...(extra.devices || [])]),
    flows: sortUnique([...(base.flows || []), ...(extra.flows || [])]),
    snapshots: sortUnique([...(base.snapshots || []), ...(extra.snapshots || [])]),
    a11y: Boolean(base.a11y || extra.a11y),
    perf: Boolean(base.perf || extra.perf),
    perfBudgets: sortUnique([...(base.perfBudgets || []), ...(extra.perfBudgets || [])]),
  };
}

function mergePreviewConfig(base: FleetPreviewConfig, extra: FleetPreviewConfig): FleetPreviewConfig {
  return {
    paths: sortUnique([...(base.paths || []), ...(extra.paths || [])]),
    devices: sortUnique([...(base.devices || []), ...(extra.devices || [])]),
    flows: sortUnique([...(base.flows || []), ...(extra.flows || [])]),
    snapshots: sortUnique([...(base.snapshots || []), ...(extra.snapshots || [])]),
    waitTimeout: Number.isFinite(Number(extra.waitTimeout)) ? Number(extra.waitTimeout) : base.waitTimeout,
    waitInterval: Number.isFinite(Number(extra.waitInterval)) ? Number(extra.waitInterval) : base.waitInterval,
    strictConsole: Boolean(base.strictConsole || extra.strictConsole),
    strictHttp: Boolean(base.strictHttp || extra.strictHttp),
    urlTemplate: clean(extra.urlTemplate || "") || clean(base.urlTemplate || "") || undefined,
  };
}

function mergeDecisionConfig(base: FleetDecisionConfig, extra: FleetDecisionConfig): FleetDecisionConfig {
  return {
    staleAfterDays: Number.isFinite(Number(extra.staleAfterDays)) ? Number(extra.staleAfterDays) : base.staleAfterDays,
    expiringSoonDays: Number.isFinite(Number(extra.expiringSoonDays)) ? Number(extra.expiringSoonDays) : base.expiringSoonDays,
  };
}

function compileMemberConfig(context: FleetContext, target: FleetTarget): FleetMemberConfig {
  const repo = clean(target.repo);
  if (!repo || !repo.includes("/")) throw new Error(`Invalid repo entry: ${JSON.stringify(target.repo)}`);
  const policyPackName = clean(target.policyPack || "") || "default";
  const policyPack = loadPolicyPack(context, policyPackName);
  const enabledChecks = uniqChecks([...(policyPack.requiredChecks || []), ...asArray<string>(target.enabledChecks)]);
  if (!enabledChecks.length) {
    throw new Error(`Repo ${repo} resolved to zero required checks.`);
  }
  const qa = mergeQaConfig(policyPack.qa || {}, normalizeQaConfig(target.qa));
  const preview = mergePreviewConfig(policyPack.preview || {}, normalizePreviewConfig(target.preview));
  const decisions = mergeDecisionConfig(policyPack.decisions || {}, normalizeDecisionConfig(target.decisions));
  const previewUrlTemplate = clean(target.previewUrlTemplate || preview.urlTemplate || "");
  const branch = clean(target.branch || "") || clean(context.manifest.defaultBranch || "") || DEFAULT_BRANCH;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    controlRepo: context.controlRepo,
    controlRef: context.controlRef,
    sourceManifest: path.relative(process.cwd(), context.manifestPath) || path.basename(context.manifestPath),
    repo,
    branch,
    team: clean(target.team || ""),
    policyPack: policyPackName,
    requiredChecks: enabledChecks,
    previewUrlTemplate,
    metadata: asObject<Record<string, string>>(target.metadata),
    qa,
    preview,
    decisions,
    schedule: {
      cron: clean(policyPack.schedule?.cron || "") || "17 8 * * 1-5",
    },
    statusArtifactName: context.statusArtifactName,
  };
}

function loadStatusScriptTemplate(): string {
  const templatePath = path.resolve(process.cwd(), "templates", "fleet", "fleet-status.js");
  return fs.readFileSync(templatePath, "utf8");
}

function generateStatusWorkflow(member: FleetMemberConfig): string {
  const branch = member.branch || DEFAULT_BRANCH;
  return `name: codex-stack fleet status

on:
  push:
    branches:
      - ${branch}
  workflow_dispatch:
  schedule:
    - cron: '${member.schedule.cron || "17 8 * * 1-5"}'

jobs:
  status:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6.0.2

      - name: Build fleet status payload
        run: |
          node .github/codex-stack/fleet-status.js \
            --out ${FLEET_STATUS_JSON} \
            --markdown-out ${FLEET_STATUS_MD}

      - name: Upload fleet status artifact
        uses: actions/upload-artifact@v7.0.0
        with:
          name: ${member.statusArtifactName}
          path: ${FLEET_STATUS_DIR}/
          if-no-files-found: error
`;
}

function generateFiles(member: FleetMemberConfig): GeneratedFiles {
  return {
    memberConfigJson: `${JSON.stringify(member, null, 2)}\n`,
    workflowYaml: generateStatusWorkflow(member),
    statusScriptJs: loadStatusScriptTemplate(),
  };
}

function readLocalFile(root: string, relativePath: string): string {
  const targetPath = path.join(root, relativePath);
  return fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
}

function readRemoteFile(repo: string, relativePath: string, ref: string): string {
  const endpoint = `repos/${repo}/contents/${relativePath}?ref=${encodeURIComponent(ref)}`;
  const result = spawnSync("gh", ["api", "-H", "Accept: application/vnd.github.raw", endpoint], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if ((result.status ?? 1) !== 0) return "";
  return clean(result.stdout || "");
}

function detectDrift(existing: Record<string, string>, generated: GeneratedFiles, member: FleetMemberConfig): { drift: DriftState; reasons: string[]; files: SyncFilePlan[] } {
  const files = [
    { path: FLEET_MEMBER_PATH, current: normalizeMemberConfigText(existing[FLEET_MEMBER_PATH] || ""), expected: normalizeMemberConfigText(generated.memberConfigJson) },
    { path: FLEET_STATUS_SCRIPT_PATH, current: existing[FLEET_STATUS_SCRIPT_PATH] || "", expected: generated.statusScriptJs },
    { path: FLEET_STATUS_WORKFLOW_PATH, current: existing[FLEET_STATUS_WORKFLOW_PATH] || "", expected: generated.workflowYaml },
  ];
  const changed = files.filter((file) => file.current !== file.expected);
  if (!changed.length) {
    return {
      drift: "healthy",
      reasons: [],
      files: files.map((file) => ({ path: file.path, changed: false })),
    };
  }

  const currentMember = existing[FLEET_MEMBER_PATH] ? (() => {
    try {
      return JSON.parse(existing[FLEET_MEMBER_PATH]) as Partial<FleetMemberConfig>;
    } catch {
      return null;
    }
  })() : null;

  let drift: DriftState = "outdated";
  const reasons: string[] = [];
  const missingCount = files.filter((file) => !file.current).length;
  if (missingCount === files.length) {
    drift = "missing";
    reasons.push("Required fleet files are missing.");
  } else if (!currentMember || clean(currentMember.controlRepo || "") !== member.controlRepo) {
    drift = "diverged";
    reasons.push("Existing fleet member config is unmanaged or points at a different control repo.");
  } else if (clean(currentMember.policyPack || "") !== member.policyPack) {
    drift = "outdated";
    reasons.push(`Policy pack drift detected (${clean(currentMember.policyPack || "unknown")} -> ${member.policyPack}).`);
  } else {
    drift = "outdated";
    reasons.push("Generated fleet files differ from the desired control-plane state.");
  }

  return {
    drift,
    reasons,
    files: files.map((file) => ({ path: file.path, changed: file.current !== file.expected })),
  };
}

function planSync(context: FleetContext, target: FleetTarget): SyncPlan {
  const member = compileMemberConfig(context, target);
  const generated = generateFiles(member);
  const localPath = clean(target.localPath || "");
  const existing: Record<string, string> = {};
  const branch = member.branch || DEFAULT_BRANCH;

  if (localPath) {
    existing[FLEET_MEMBER_PATH] = readLocalFile(localPath, FLEET_MEMBER_PATH);
    existing[FLEET_STATUS_SCRIPT_PATH] = readLocalFile(localPath, FLEET_STATUS_SCRIPT_PATH);
    existing[FLEET_STATUS_WORKFLOW_PATH] = readLocalFile(localPath, FLEET_STATUS_WORKFLOW_PATH);
  } else {
    existing[FLEET_MEMBER_PATH] = readRemoteFile(member.repo, FLEET_MEMBER_PATH, branch);
    existing[FLEET_STATUS_SCRIPT_PATH] = readRemoteFile(member.repo, FLEET_STATUS_SCRIPT_PATH, branch);
    existing[FLEET_STATUS_WORKFLOW_PATH] = readRemoteFile(member.repo, FLEET_STATUS_WORKFLOW_PATH, branch);
  }

  const drift = detectDrift(existing, generated, member);
  return {
    repo: member.repo,
    branch,
    team: member.team,
    policyPack: member.policyPack,
    localPath,
    drift: drift.drift,
    files: drift.files,
    memberConfig: member,
    generated,
    existing,
    reasons: drift.reasons,
  };
}

function writeGeneratedFiles(root: string, plan: SyncPlan): string[] {
  const changed: string[] = [];
  const outputs: Array<{ path: string; content: string }> = [
    { path: FLEET_MEMBER_PATH, content: plan.generated.memberConfigJson },
    { path: FLEET_STATUS_SCRIPT_PATH, content: plan.generated.statusScriptJs },
    { path: FLEET_STATUS_WORKFLOW_PATH, content: plan.generated.workflowYaml },
  ];
  for (const output of outputs) {
    const absolute = path.join(root, output.path);
    const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
    if (output.path === FLEET_MEMBER_PATH) {
      if (normalizeMemberConfigText(current) === normalizeMemberConfigText(output.content)) continue;
    } else if (current === output.content) {
      continue;
    }
    writeFile(absolute, output.content);
    changed.push(output.path);
  }
  return changed;
}

function syncLocalRepo(plan: SyncPlan): SyncResult {
  if (!plan.localPath) {
    return {
      repo: plan.repo,
      drift: plan.drift,
      action: "skipped",
      branch: plan.branch,
      localPath: "",
      prUrl: "",
      filesChanged: [],
    };
  }
  const filesChanged = writeGeneratedFiles(plan.localPath, plan);
  return {
    repo: plan.repo,
    drift: plan.drift,
    action: filesChanged.length ? "written" : "skipped",
    branch: plan.branch,
    localPath: plan.localPath,
    prUrl: "",
    filesChanged,
  };
}

function checkoutBranch(repoDir: string, branchName: string, baseRef: string): void {
  runArgs("git", ["checkout", "-B", branchName, `origin/${baseRef}`], repoDir);
}

function maybeCreateOrUpdatePr(repo: string, branchName: string, baseRef: string): string {
  const currentOwner = clean(runArgs("gh", ["api", "user", "--jq", ".login"], process.cwd()));
  const existing = runArgs("gh", ["pr", "list", "--repo", repo, "--head", `${currentOwner}:${branchName}`, "--json", "number,url", "--jq", ".[] | .url"], process.cwd());
  if (existing) return clean(existing.split(/\r?\n/)[0]);
  return runArgs("gh", [
    "pr",
    "create",
    "--repo",
    repo,
    "--base",
    baseRef,
    "--head",
    branchName,
    "--title",
    "chore: sync codex-stack fleet rollout",
    "--body",
    `Sync codex-stack fleet rollout files.\n\n- refresh \`${FLEET_MEMBER_PATH}\`\n- refresh \`${FLEET_STATUS_SCRIPT_PATH}\`\n- refresh \`${FLEET_STATUS_WORKFLOW_PATH}\``,
  ], process.cwd());
}

function openPrSync(plan: SyncPlan, syncBranch: string): SyncResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-fleet-sync-"));
  const repoDir = path.join(tempDir, plan.repo.replace(/\//g, "-"));
  try {
    runArgs("gh", ["repo", "clone", plan.repo, repoDir, "--", "-q"], process.cwd());
    checkoutBranch(repoDir, syncBranch, plan.branch);
    const filesChanged = writeGeneratedFiles(repoDir, plan);
    if (!filesChanged.length) {
      return {
        repo: plan.repo,
        drift: "healthy",
        action: "skipped",
        branch: plan.branch,
        localPath: repoDir,
        prUrl: "",
        filesChanged: [],
      };
    }
    runArgs("git", ["add", FLEET_MEMBER_PATH, FLEET_STATUS_SCRIPT_PATH, FLEET_STATUS_WORKFLOW_PATH], repoDir);
    runArgs("git", ["commit", "-m", "chore: sync codex-stack fleet rollout"], repoDir);
    runArgs("git", ["push", "-u", "origin", syncBranch, "--force-with-lease"], repoDir);
    const prUrl = maybeCreateOrUpdatePr(plan.repo, syncBranch, plan.branch);
    return {
      repo: plan.repo,
      drift: plan.drift,
      action: "opened-pr",
      branch: plan.branch,
      localPath: repoDir,
      prUrl,
      filesChanged,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function latestQaReportFromRepoRoot(repoRoot: string): FleetStatusReport["latestReport"] {
  const docsQa = path.join(repoRoot, "docs", "qa");
  if (!fs.existsSync(docsQa)) return null;
  const reportPaths: string[] = [];
  const stack = [docsQa];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name === "report.json") reportPaths.push(absolute);
    }
  }
  let bestPath = "";
  let bestScore = 0;
  let bestData: Record<string, unknown> | null = null;
  for (const reportPath of reportPaths) {
    try {
      const data = readJsonFile<Record<string, unknown>>(reportPath);
      const generatedAt = clean(data.generatedAt || data.timestamp || "");
      const score = generatedAt ? Date.parse(generatedAt) : fs.statSync(reportPath).mtimeMs;
      if (!bestPath || score > bestScore) {
        bestPath = reportPath;
        bestScore = score;
        bestData = data;
      }
    } catch {
      // Ignore malformed files.
    }
  }
  if (!bestData) return null;
  const visualRisk = asObject<Record<string, unknown>>(bestData.visualRisk);
  const decisions = asObject<Record<string, unknown>>(bestData.decisionSummary);
  const accessibility = asObject<Record<string, unknown>>(bestData.accessibility);
  const performance = asObject<Record<string, unknown>>(bestData.performance);
  return {
    generatedAt: clean(bestData.generatedAt || ""),
    status: clean(bestData.status || ""),
    recommendation: clean(bestData.recommendation || ""),
    healthScore: Number(bestData.healthScore || 0) || 0,
    visualRiskScore: Number(visualRisk.score || 0) || null,
    visualRiskLevel: clean(visualRisk.level || "") || "none",
    unresolvedRegressions: Number(decisions.unresolvedCount || 0),
    approvedRegressions: Number(decisions.approvedCount || 0),
    expiredDecisions: Number(decisions.expiredCount || 0),
    staleBaselines: Number(visualRisk.staleBaselines || 0),
    accessibilityViolations: Number(accessibility.violationCount || 0) || 0,
    performanceBudgetViolations: Number(performance.budgetViolationCount || 0) || 0,
    reportPath: bestPath,
  };
}

function computeCollectedStatus(installed: boolean, drift: DriftState, latestReport: FleetStatusReport["latestReport"]): { status: RepoHealth; riskScore: number } {
  if (!installed) {
    return { status: "missing", riskScore: 85 };
  }
  let riskScore = 0;
  if (drift === "diverged") riskScore += 45;
  if (drift === "missing") riskScore += 35;
  if (drift === "outdated") riskScore += 20;
  if (!latestReport) riskScore += 15;
  if (latestReport?.status === "critical") riskScore += 40;
  if (latestReport?.status === "warning") riskScore += 20;
  riskScore += Math.min(24, Number(latestReport?.unresolvedRegressions || 0) * 8);
  riskScore += Math.min(12, Number(latestReport?.expiredDecisions || 0) * 4);
  riskScore += Math.min(12, Number(latestReport?.staleBaselines || 0) * 3);
  riskScore += Math.min(25, Math.round(Number(latestReport?.visualRiskScore || 0) * 0.25));
  riskScore += Math.min(10, Number(latestReport?.accessibilityViolations || 0) * 2);
  riskScore += Math.min(12, Number(latestReport?.performanceBudgetViolations || 0) * 4);
  riskScore = Math.min(100, riskScore);

  if (latestReport?.status === "critical" || drift === "diverged") {
    return { status: "critical", riskScore };
  }
  if (latestReport?.status === "warning" || drift === "outdated" || drift === "missing" || Number(latestReport?.unresolvedRegressions || 0) > 0 || Number(latestReport?.expiredDecisions || 0) > 0) {
    return { status: "warning", riskScore };
  }
  return { status: "healthy", riskScore };
}

function readRemoteMemberConfig(repo: string, branch: string): FleetMemberConfig | null {
  const raw = readRemoteFile(repo, FLEET_MEMBER_PATH, branch);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FleetMemberConfig;
  } catch {
    return null;
  }
}

function readLocalMemberConfig(repoRoot: string): FleetMemberConfig | null {
  const filePath = path.join(repoRoot, FLEET_MEMBER_PATH);
  if (!fs.existsSync(filePath)) return null;
  try {
    return readJsonFile<FleetMemberConfig>(filePath);
  } catch {
    return null;
  }
}

function downloadLatestArtifactStatus(repo: string, branch: string, artifactName: string): FleetStatusReport | null {
  const runsJson = runArgs("gh", ["api", `repos/${repo}/actions/workflows/${path.basename(FLEET_STATUS_WORKFLOW_PATH)}/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=10`], process.cwd());
  const runs = JSON.parse(runsJson) as { workflow_runs?: Array<{ id: number; conclusion?: string }> };
  const runId = asArray<{ id: number; conclusion?: string }>(runs.workflow_runs).find((item) => item.conclusion === "success")?.id;
  if (!runId) return null;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-fleet-artifact-"));
  try {
    runArgs("gh", ["run", "download", String(runId), "-R", repo, "-n", artifactName, "-D", tempDir], process.cwd());
    const statusPath = path.join(tempDir, "status.json");
    if (!fs.existsSync(statusPath)) return null;
    return readJsonFile<FleetStatusReport>(statusPath);
  } catch {
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function collectRepo(context: FleetContext, target: FleetTarget): CollectedFleetRepo {
  const plan = planSync(context, target);
  if (plan.localPath) {
    const member = readLocalMemberConfig(plan.localPath) || plan.memberConfig;
    const latestReport = latestQaReportFromRepoRoot(plan.localPath);
    const computed = computeCollectedStatus(Boolean(member), plan.drift, latestReport);
    return {
      repo: plan.repo,
      branch: plan.branch,
      team: member.team,
      policyPack: member.policyPack,
      installed: Boolean(member),
      drift: plan.drift,
      status: computed.status,
      riskScore: computed.riskScore,
      requiredChecks: member.requiredChecks,
      latestReport,
      source: latestReport ? "local" : "repo-files",
    };
  }

  const member = readRemoteMemberConfig(plan.repo, plan.branch) || (plan.drift === "healthy" ? plan.memberConfig : null);
  const statusReport = member ? downloadLatestArtifactStatus(plan.repo, plan.branch, member.statusArtifactName || context.statusArtifactName) : null;
  const latestReport = statusReport?.latestReport || null;
  const computed = computeCollectedStatus(Boolean(member), plan.drift, latestReport);
  return {
    repo: plan.repo,
    branch: plan.branch,
    team: member?.team || plan.team,
    policyPack: member?.policyPack || plan.policyPack,
    installed: Boolean(member),
    drift: plan.drift,
    status: statusReport?.status || computed.status,
    riskScore: statusReport?.riskScore ?? computed.riskScore,
    requiredChecks: asArray<string>(member?.requiredChecks || []),
    latestReport,
    source: statusReport ? "artifact" : member ? "repo-files" : "missing",
  };
}

function collectFleet(context: FleetContext): FleetCollectReport {
  const repos = asArray<FleetTarget>(context.manifest.repos).map((target) => collectRepo(context, target));
  repos.sort((left, right) => right.riskScore - left.riskScore || left.repo.localeCompare(right.repo));
  const counts = {
    repos: repos.length,
    healthy: repos.filter((repo) => repo.status === "healthy").length,
    warning: repos.filter((repo) => repo.status === "warning").length,
    critical: repos.filter((repo) => repo.status === "critical").length,
    missing: repos.filter((repo) => repo.status === "missing").length,
    unknown: repos.filter((repo) => repo.status === "unknown").length,
    drifted: repos.filter((repo) => repo.drift !== "healthy").length,
  };
  return {
    marker: "<!-- codex-stack:fleet-report -->",
    generatedAt: new Date().toISOString(),
    controlRepo: context.controlRepo,
    manifestPath: context.manifestPath,
    counts,
    repos,
    topRisks: repos.slice(0, 5),
  };
}

function renderFleetMarkdown(report: FleetCollectReport): string {
  const lines = [
    "# codex-stack fleet report",
    "",
    `- Control repo: ${report.controlRepo}`,
    `- Generated: ${report.generatedAt}`,
    `- Repos: ${report.counts.repos}`,
    `- Healthy: ${report.counts.healthy}`,
    `- Warning: ${report.counts.warning}`,
    `- Critical: ${report.counts.critical}`,
    `- Missing: ${report.counts.missing}`,
    `- Drifted: ${report.counts.drifted}`,
    "",
    "## Top risks",
    "",
    ...report.topRisks.map((repo) => `- ${repo.repo}: ${repo.status.toUpperCase()} (${repo.riskScore}/100) • drift=${repo.drift} • unresolved=${repo.latestReport?.unresolvedRegressions ?? 0}`),
  ];
  return `${lines.join("\n")}\n`;
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFleetDashboard(report: FleetCollectReport, outDir: string): void {
  ensureDir(outDir);
  const repoRows = report.repos.map((repo) => `
      <tr>
        <td><strong>${escapeHtml(repo.repo)}</strong><div class="muted">${escapeHtml(repo.team || "unassigned")}</div></td>
        <td>${escapeHtml(repo.status.toUpperCase())}</td>
        <td>${escapeHtml(repo.drift.toUpperCase())}</td>
        <td>${escapeHtml(repo.riskScore)}</td>
        <td>${escapeHtml(repo.latestReport?.status || "missing")}</td>
        <td>${escapeHtml(repo.latestReport?.unresolvedRegressions ?? 0)}</td>
        <td>${escapeHtml(repo.latestReport?.visualRiskScore ?? "-")}</td>
      </tr>`).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>codex-stack fleet dashboard</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 32px; background: #0b1020; color: #f7f9fc; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #151d35; border: 1px solid #263355; border-radius: 16px; padding: 18px; }
    .card strong { display: block; font-size: 1.6rem; }
    table { width: 100%; border-collapse: collapse; background: #151d35; border-radius: 16px; overflow: hidden; }
    th, td { padding: 14px 16px; border-bottom: 1px solid #263355; text-align: left; }
    th { background: #10172b; }
    .muted { color: #93a3c7; font-size: 0.9rem; margin-top: 4px; }
    .top-risks { margin: 24px 0; }
    ul { padding-left: 20px; }
    a { color: #7cd4ff; }
  </style>
</head>
<body>
  <h1>codex-stack fleet dashboard</h1>
  <p>Control repo: ${escapeHtml(report.controlRepo)}</p>
  <div class="cards">
    <div class="card"><span>Repos</span><strong>${report.counts.repos}</strong></div>
    <div class="card"><span>Healthy</span><strong>${report.counts.healthy}</strong></div>
    <div class="card"><span>Warning</span><strong>${report.counts.warning}</strong></div>
    <div class="card"><span>Critical</span><strong>${report.counts.critical}</strong></div>
    <div class="card"><span>Missing</span><strong>${report.counts.missing}</strong></div>
    <div class="card"><span>Drifted</span><strong>${report.counts.drifted}</strong></div>
  </div>
  <section class="top-risks">
    <h2>Top risks</h2>
    <ul>${report.topRisks.map((repo) => `<li><strong>${escapeHtml(repo.repo)}</strong> — ${escapeHtml(repo.status.toUpperCase())} (${escapeHtml(repo.riskScore)}/100), drift=${escapeHtml(repo.drift)}, unresolved=${escapeHtml(repo.latestReport?.unresolvedRegressions ?? 0)}</li>`).join("")}</ul>
  </section>
  <section>
    <h2>Repo status</h2>
    <table>
      <thead>
        <tr><th>Repo</th><th>Status</th><th>Drift</th><th>Risk</th><th>Latest QA</th><th>Unresolved</th><th>Visual risk</th></tr>
      </thead>
      <tbody>${repoRows}</tbody>
    </table>
  </section>
</body>
</html>`;
  writeFile(path.join(outDir, "index.html"), html);
  writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFile(path.join(outDir, "summary.md"), renderFleetMarkdown(report));
}

function buildValidationReport(context: FleetContext): { marker: string; generatedAt: string; controlRepo: string; repos: Array<{ repo: string; policyPack: string; branch: string; valid: boolean; previewUrlTemplate: string; requiredChecks: string[] }> } {
  const repos = asArray<FleetTarget>(context.manifest.repos).map((target) => {
    const member = compileMemberConfig(context, target);
    return {
      repo: member.repo,
      policyPack: member.policyPack,
      branch: member.branch,
      valid: true,
      previewUrlTemplate: member.previewUrlTemplate,
      requiredChecks: member.requiredChecks,
    };
  });
  return {
    marker: "<!-- codex-stack:fleet-validate -->",
    generatedAt: new Date().toISOString(),
    controlRepo: context.controlRepo,
    repos,
  };
}

function renderSyncMarkdown(results: SyncResult[]): string {
  const lines = ["# codex-stack fleet sync", ""];
  for (const result of results) {
    lines.push(`- ${result.repo}: ${result.action} (${result.drift})${result.prUrl ? ` • ${result.prUrl}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

function handleValidate(args: ParsedArgs, context: FleetContext): void {
  const report = buildValidationReport(context);
  const jsonText = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = [
    "# codex-stack fleet validation",
    "",
    `- Control repo: ${report.controlRepo}`,
    `- Repos: ${report.repos.length}`,
    "",
    ...report.repos.map((repo) => `- ${repo.repo} (${repo.branch}) • pack=${repo.policyPack} • checks=${repo.requiredChecks.join(", ") || "none"}`),
  ].join("\n") + "\n";
  if (args.jsonOut) writeFile(args.jsonOut, jsonText);
  if (args.markdownOut) writeFile(args.markdownOut, markdown);
  process.stdout.write(args.json ? jsonText : markdown);
}

function handleSync(args: ParsedArgs, context: FleetContext): void {
  const plans = asArray<FleetTarget>(context.manifest.repos).map((target) => planSync(context, target));
  const results: SyncResult[] = [];
  for (const plan of plans) {
    if (args.dryRun) {
      results.push({
        repo: plan.repo,
        drift: plan.drift,
        action: "planned",
        branch: plan.branch,
        localPath: plan.localPath,
        prUrl: "",
        filesChanged: plan.files.filter((item) => item.changed).map((item) => item.path),
      });
      continue;
    }
    if (args.openPrs) {
      results.push(openPrSync(plan, args.branchName || context.syncBranch));
      continue;
    }
    results.push(syncLocalRepo(plan));
  }

  const payload = {
    marker: "<!-- codex-stack:fleet-sync -->",
    generatedAt: new Date().toISOString(),
    controlRepo: context.controlRepo,
    dryRun: args.dryRun,
    openPrs: args.openPrs,
    results,
  };
  const jsonText = `${JSON.stringify(payload, null, 2)}\n`;
  const markdown = renderSyncMarkdown(results);
  if (args.jsonOut) writeFile(args.jsonOut, jsonText);
  if (args.markdownOut) writeFile(args.markdownOut, markdown);
  process.stdout.write(args.json ? jsonText : markdown);
}

function handleCollect(args: ParsedArgs, context: FleetContext): void {
  const report = collectFleet(context);
  const jsonText = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderFleetMarkdown(report);
  if (args.jsonOut) writeFile(args.jsonOut, jsonText);
  if (args.markdownOut) writeFile(args.markdownOut, markdown);
  process.stdout.write(args.json ? jsonText : markdown);
}

function handleDashboard(args: ParsedArgs, context: FleetContext): void {
  const report = collectFleet(context);
  renderFleetDashboard(report, args.outDir);
  const jsonText = `${JSON.stringify(report, null, 2)}\n`;
  if (args.jsonOut) writeFile(args.jsonOut, jsonText);
  process.stdout.write(args.json ? jsonText : `fleet dashboard written to ${args.outDir}\n`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const context = loadFleetContext(args.manifestPath);
  if (args.command === "validate") return handleValidate(args, context);
  if (args.command === "sync") return handleSync(args, context);
  if (args.command === "collect") return handleCollect(args, context);
  if (args.command === "dashboard") return handleDashboard(args, context);
  usage();
}

main();
