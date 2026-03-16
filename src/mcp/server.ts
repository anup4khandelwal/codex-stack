import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { allModes, findMode } from "../registry.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const BUN = process.execPath || "bun";
const PACKAGE_JSON = path.join(ROOT_DIR, "package.json");
const VERSION = readPackageVersion();
const MCP_DIR = path.join(ROOT_DIR, ".codex-stack", "mcp");

const TOOL_OUTPUT_SCHEMA = {
  ok: z.boolean(),
  tool: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  result: z.any(),
  stderr: z.string().optional(),
};

type JsonObject = Record<string, unknown>;
type JsonShape = Record<string, z.ZodTypeAny>;
type ToolInput = Record<string, unknown>;

interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonShape;
  script: string;
  buildArgs: (input: ToolInput) => string[];
}

interface ResourceDescriptor {
  name: string;
  uri: string;
  title: string;
  description: string;
  mimeType: string;
}

interface InspectManifest {
  server: {
    name: string;
    version: string;
    transport: "stdio";
    mutationPolicy: "read-only-plus-dry-run";
  };
  tools: Array<{
    name: string;
    title: string;
    description: string;
    script: string;
    inputKeys: string[];
  }>;
  resources: ResourceDescriptor[];
  resourceTemplates: Array<{
    name: string;
    uriTemplate: string;
    title: string;
    description: string;
    mimeType: string;
  }>;
}

function readPackageVersion(): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")) as { version?: string };
    return parsed.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rel(filePath: string): string {
  return path.relative(ROOT_DIR, filePath) || ".";
}

function writeScratchDir(): string {
  ensureDir(MCP_DIR);
  return MCP_DIR;
}

function textContent(text: string) {
  return [{ type: "text" as const, text }];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveFleetManifestPath(): string {
  const preferred = path.join(ROOT_DIR, ".codex-stack", "fleet.anup4khandelwal.json");
  const fallback = path.join(ROOT_DIR, ".codex-stack", "fleet.example.json");
  if (fs.existsSync(preferred)) return preferred;
  return fallback;
}

function listPublishedQaSlugs(): string[] {
  const qaDir = path.join(ROOT_DIR, "docs", "qa");
  if (!fs.existsSync(qaDir)) return [];
  return fs.readdirSync(qaDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => fs.existsSync(path.join(qaDir, slug, "report.json")))
    .sort();
}

function buildPublishedQaIndex(): JsonObject {
  const slugs = listPublishedQaSlugs();
  return {
    generatedAt: new Date().toISOString(),
    reports: slugs.map((slug) => ({
      slug,
      reportJsonUri: `codex-stack://qa/published/${slug}/report.json`,
      reportMarkdownUri: `codex-stack://qa/published/${slug}/report.md`,
      visualManifestUri: fs.existsSync(path.join(ROOT_DIR, "docs", "qa", slug, "visual", "manifest.json"))
        ? `codex-stack://qa/published/${slug}/visual/manifest.json`
        : "",
      localDir: rel(path.join(ROOT_DIR, "docs", "qa", slug)),
    })),
  };
}

function buildFleetStatusIndex(): JsonObject {
  const statusPath = path.join(ROOT_DIR, ".codex-stack", "fleet-status", "status.json");
  return {
    generatedAt: new Date().toISOString(),
    statusPath: fs.existsSync(statusPath) ? rel(statusPath) : "",
    available: fs.existsSync(statusPath),
    status: readJsonFile(statusPath, null),
  };
}

function readFileOrFallback(filePath: string, fallback: string): string {
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, "utf8");
}

function readJsonFile(filePath: string, fallback: unknown): unknown {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function jsonResource(uri: string, payload: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: `${JSON.stringify(payload, null, 2)}\n`,
      },
    ],
  };
}

function markdownResource(uri: string, text: string) {
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text,
      },
    ],
  };
}

function readResourceText(uri: string, filePath: string, mimeType: string, missingMessage: string) {
  const text = readFileOrFallback(filePath, missingMessage);
  return {
    contents: [
      {
        uri,
        mimeType,
        text,
      },
    ],
  };
}

function baseResourceDescriptors(): ResourceDescriptor[] {
  return [
    {
      name: "modes",
      uri: "codex-stack://modes",
      title: "Codex-stack modes",
      description: "Registered codex-stack modes and summaries.",
      mimeType: "application/json",
    },
    {
      name: "qa-latest-json",
      uri: "codex-stack://qa/latest/report.json",
      title: "Latest QA report JSON",
      description: "The latest local QA report under .codex-stack/qa/latest.json.",
      mimeType: "application/json",
    },
    {
      name: "qa-latest-markdown",
      uri: "codex-stack://qa/latest/report.md",
      title: "Latest QA report Markdown",
      description: "The latest local QA report under .codex-stack/qa/latest.md.",
      mimeType: "text/markdown",
    },
    {
      name: "qa-published-index",
      uri: "codex-stack://qa/published/index.json",
      title: "Published QA report index",
      description: "Published docs/qa report slugs and resource URIs.",
      mimeType: "application/json",
    },
    {
      name: "fleet-manifest",
      uri: "codex-stack://fleet/manifest.json",
      title: "Fleet manifest",
      description: "The active fleet manifest used by this repo.",
      mimeType: "application/json",
    },
    {
      name: "fleet-member-status-index",
      uri: "codex-stack://fleet/member-status/index.json",
      title: "Fleet member status index",
      description: "Local fleet-status payloads discovered in this repo.",
      mimeType: "application/json",
    },
  ];
}

function templateDescriptors() {
  return [
    {
      name: "skills",
      uriTemplate: "codex-stack://skills/{mode}",
      title: "Codex-stack skill",
      description: "Raw SKILL.md content for a registered codex-stack mode.",
      mimeType: "text/markdown",
    },
    {
      name: "qa-published-report-json",
      uriTemplate: "codex-stack://qa/published/{slug}/report.json",
      title: "Published QA report JSON",
      description: "Tracked docs/qa report JSON for a published slug.",
      mimeType: "application/json",
    },
    {
      name: "qa-published-report-markdown",
      uriTemplate: "codex-stack://qa/published/{slug}/report.md",
      title: "Published QA report Markdown",
      description: "Tracked docs/qa report markdown for a published slug.",
      mimeType: "text/markdown",
    },
    {
      name: "qa-published-visual-manifest",
      uriTemplate: "codex-stack://qa/published/{slug}/visual/manifest.json",
      title: "Published visual manifest",
      description: "Tracked visual manifest for a published QA report slug.",
      mimeType: "application/json",
    },
  ];
}

function toolDescriptors(): ToolDescriptor[] {
  return [
    {
      name: "codex_stack_review_diff",
      title: "Review diff",
      description: "Run codex-stack diff review and return the JSON result.",
      script: "scripts/review-diff.ts",
      inputSchema: {
        baseRef: z.string().optional().describe("Optional base ref, e.g. origin/main"),
      },
      buildArgs: (input) => {
        const args: string[] = ["--json"];
        const baseRef = normalizeString(input.baseRef);
        if (baseRef) args.push("--base", baseRef);
        return args;
      },
    },
    {
      name: "codex_stack_qa_run",
      title: "Run QA",
      description: "Run QA against a URL with flows, snapshot checks, a11y, and performance options.",
      script: "scripts/qa-run.ts",
      inputSchema: {
        url: z.string().describe("URL to verify"),
        flows: z.array(z.string()).optional(),
        snapshot: z.string().optional(),
        session: z.string().optional(),
        sessionBundle: z.string().optional(),
        mode: z.enum(["quick", "full", "regression", "diff-aware"]).optional(),
        baseRef: z.string().optional(),
        a11y: z.boolean().optional(),
        a11yScopes: z.array(z.string()).optional(),
        a11yImpact: z.enum(["critical", "serious", "moderate", "minor"]).optional(),
        perf: z.boolean().optional(),
        perfBudgets: z.array(z.string()).optional(),
        perfWaitMs: z.number().int().nonnegative().optional(),
      },
      buildArgs: (input) => {
        const args: string[] = [normalizeString(input.url), "--json"];
        for (const flow of normalizeStringArray(input.flows)) args.push("--flow", flow);
        const snapshot = normalizeString(input.snapshot);
        if (snapshot) args.push("--snapshot", snapshot);
        const session = normalizeString(input.session);
        if (session) args.push("--session", session);
        const sessionBundle = normalizeString(input.sessionBundle);
        if (sessionBundle) args.push("--session-bundle", sessionBundle);
        const mode = normalizeString(input.mode);
        if (mode) args.push("--mode", mode);
        const baseRef = normalizeString(input.baseRef);
        if (baseRef) args.push("--base-ref", baseRef);
        if (normalizeBoolean(input.a11y)) {
          args.push("--a11y");
          const impact = normalizeString(input.a11yImpact) || "serious";
          args.push("--a11y-impact", impact);
          for (const scope of normalizeStringArray(input.a11yScopes)) args.push("--a11y-scope", scope);
        }
        if (normalizeBoolean(input.perf)) {
          args.push("--perf");
          const perfWaitMs = normalizeNumber(input.perfWaitMs);
          if (perfWaitMs !== null) args.push("--perf-wait-ms", String(perfWaitMs));
          for (const budget of normalizeStringArray(input.perfBudgets)) args.push("--perf-budget", budget);
        }
        return args;
      },
    },
    {
      name: "codex_stack_preview_verify",
      title: "Verify preview",
      description: "Resolve and verify a preview URL with page/device checks and QA evidence.",
      script: "scripts/preview-verify.ts",
      inputSchema: {
        url: z.string().optional(),
        urlTemplate: z.string().optional(),
        pr: z.number().int().positive().optional(),
        branch: z.string().optional(),
        sha: z.string().optional(),
        repo: z.string().optional(),
        paths: z.array(z.string()).optional(),
        devices: z.array(z.enum(["desktop", "tablet", "mobile"])).optional(),
        flows: z.array(z.string()).optional(),
        snapshots: z.array(z.string()).optional(),
        session: z.string().optional(),
        sessionBundle: z.string().optional(),
        waitTimeout: z.number().int().positive().optional(),
        waitInterval: z.number().int().positive().optional(),
        strictConsole: z.boolean().optional(),
        strictHttp: z.boolean().optional(),
        a11y: z.boolean().optional(),
        a11yScopes: z.array(z.string()).optional(),
        a11yImpact: z.enum(["critical", "serious", "moderate", "minor"]).optional(),
        perf: z.boolean().optional(),
        perfBudgets: z.array(z.string()).optional(),
        perfWaitMs: z.number().int().nonnegative().optional(),
      },
      buildArgs: (input) => buildDeployLikeArgs(input),
    },
    {
      name: "codex_stack_deploy_verify",
      title: "Verify deploy",
      description: "Verify a preview or staging deploy across pages, devices, flows, and evidence checks.",
      script: "scripts/deploy-verify.ts",
      inputSchema: {
        url: z.string().optional(),
        urlTemplate: z.string().optional(),
        pr: z.number().int().positive().optional(),
        branch: z.string().optional(),
        sha: z.string().optional(),
        repo: z.string().optional(),
        paths: z.array(z.string()).optional(),
        devices: z.array(z.enum(["desktop", "tablet", "mobile"])).optional(),
        flows: z.array(z.string()).optional(),
        snapshots: z.array(z.string()).optional(),
        session: z.string().optional(),
        sessionBundle: z.string().optional(),
        waitTimeout: z.number().int().positive().optional(),
        waitInterval: z.number().int().positive().optional(),
        strictConsole: z.boolean().optional(),
        strictHttp: z.boolean().optional(),
        a11y: z.boolean().optional(),
        a11yScopes: z.array(z.string()).optional(),
        a11yImpact: z.enum(["critical", "serious", "moderate", "minor"]).optional(),
        perf: z.boolean().optional(),
        perfBudgets: z.array(z.string()).optional(),
        perfWaitMs: z.number().int().nonnegative().optional(),
      },
      buildArgs: (input) => buildDeployLikeArgs(input),
    },
    {
      name: "codex_stack_ship_plan",
      title: "Plan ship",
      description: "Run ship in dry-run mode and return the JSON shipping plan without git or GitHub mutation.",
      script: "scripts/ship-branch.ts",
      inputSchema: {
        message: z.string().optional(),
        title: z.string().optional(),
        body: z.string().optional(),
        bodyFile: z.string().optional(),
        template: z.string().optional(),
        reviewers: z.array(z.string()).optional(),
        teamReviewers: z.array(z.string()).optional(),
        assignees: z.array(z.string()).optional(),
        assignSelf: z.boolean().optional(),
        project: z.string().optional(),
        labels: z.array(z.string()).optional(),
        milestone: z.string().optional(),
        draft: z.boolean().optional(),
        noAutoLabels: z.boolean().optional(),
        noAutoReviewers: z.boolean().optional(),
      },
      buildArgs: (input) => {
        const args: string[] = ["--dry-run", "--json"];
        const pairs: Array<[string, string]> = [
          ["--message", normalizeString(input.message)],
          ["--title", normalizeString(input.title)],
          ["--body", normalizeString(input.body)],
          ["--body-file", normalizeString(input.bodyFile)],
          ["--template", normalizeString(input.template)],
          ["--project", normalizeString(input.project)],
          ["--milestone", normalizeString(input.milestone)],
        ];
        for (const [flag, value] of pairs) if (value) args.push(flag, value);
        for (const reviewer of normalizeStringArray(input.reviewers)) args.push("--reviewer", reviewer);
        for (const teamReviewer of normalizeStringArray(input.teamReviewers)) args.push("--team-reviewer", teamReviewer);
        for (const assignee of normalizeStringArray(input.assignees)) args.push("--assignee", assignee);
        for (const label of normalizeStringArray(input.labels)) args.push("--label", label);
        if (normalizeBoolean(input.assignSelf)) args.push("--assign-self");
        if (normalizeBoolean(input.draft)) args.push("--draft");
        if (normalizeBoolean(input.noAutoLabels)) args.push("--no-auto-labels");
        if (normalizeBoolean(input.noAutoReviewers)) args.push("--no-auto-reviewers");
        return args;
      },
    },
    {
      name: "codex_stack_fleet_validate",
      title: "Validate fleet",
      description: "Validate the fleet manifest and policy-pack references.",
      script: "scripts/fleet.ts",
      inputSchema: {
        manifest: z.string().describe("Fleet manifest path"),
      },
      buildArgs: (input) => ["validate", "--manifest", normalizeString(input.manifest), "--json"],
    },
    {
      name: "codex_stack_fleet_collect",
      title: "Collect fleet status",
      description: "Collect normalized health across the fleet manifest.",
      script: "scripts/fleet.ts",
      inputSchema: {
        manifest: z.string().describe("Fleet manifest path"),
      },
      buildArgs: (input) => ["collect", "--manifest", normalizeString(input.manifest), "--json"],
    },
    {
      name: "codex_stack_fleet_sync_plan",
      title: "Plan fleet sync",
      description: "Compute the dry-run rollout plan for the fleet manifest.",
      script: "scripts/fleet.ts",
      inputSchema: {
        manifest: z.string().describe("Fleet manifest path"),
        branchName: z.string().optional(),
      },
      buildArgs: (input) => {
        const args = ["sync", "--manifest", normalizeString(input.manifest), "--dry-run", "--json"];
        const branchName = normalizeString(input.branchName);
        if (branchName) args.push("--branch-name", branchName);
        return args;
      },
    },
    {
      name: "codex_stack_fleet_remediate_plan",
      title: "Plan fleet remediation",
      description: "Compute the dry-run remediation plan for the fleet manifest.",
      script: "scripts/fleet.ts",
      inputSchema: {
        manifest: z.string().describe("Fleet manifest path"),
        issueRepo: z.string().optional(),
      },
      buildArgs: (input) => {
        const args = ["remediate", "--manifest", normalizeString(input.manifest), "--dry-run", "--json"];
        const issueRepo = normalizeString(input.issueRepo);
        if (issueRepo) args.push("--issue-repo", issueRepo);
        return args;
      },
    },
    {
      name: "codex_stack_retro_summary",
      title: "Generate retrospective",
      description: "Generate a retrospective summary from git and optional GitHub metadata.",
      script: "scripts/retro-report.ts",
      inputSchema: {
        since: z.string().optional(),
        repo: z.string().optional(),
        noGithub: z.boolean().optional(),
        noArtifacts: z.boolean().optional(),
        githubLimit: z.number().int().positive().optional(),
      },
      buildArgs: (input) => {
        const args: string[] = ["--json"];
        const since = normalizeString(input.since);
        const repo = normalizeString(input.repo);
        const githubLimit = normalizeNumber(input.githubLimit);
        if (since) args.push("--since", since);
        if (repo) args.push("--repo", repo);
        if (githubLimit !== null) args.push("--github-limit", String(githubLimit));
        if (normalizeBoolean(input.noGithub)) args.push("--no-github");
        if (normalizeBoolean(input.noArtifacts)) args.push("--no-artifacts");
        return args;
      },
    },
    {
      name: "codex_stack_upgrade_check",
      title: "Check upgrades",
      description: "Audit dependency, workflow, and install drift.",
      script: "scripts/upgrade-check.ts",
      inputSchema: {
        repo: z.string().optional(),
        offline: z.boolean().optional(),
      },
      buildArgs: (input) => {
        const args: string[] = ["--json"];
        const repo = normalizeString(input.repo);
        if (repo) args.push("--repo", repo);
        if (normalizeBoolean(input.offline)) args.push("--offline");
        return args;
      },
    },
  ];
}

function buildDeployLikeArgs(input: ToolInput): string[] {
  const args: string[] = ["--json"];
  const url = normalizeString(input.url);
  const urlTemplate = normalizeString(input.urlTemplate);
  const branch = normalizeString(input.branch);
  const sha = normalizeString(input.sha);
  const repo = normalizeString(input.repo);
  const session = normalizeString(input.session);
  const sessionBundle = normalizeString(input.sessionBundle);
  const waitTimeout = normalizeNumber(input.waitTimeout);
  const waitInterval = normalizeNumber(input.waitInterval);
  const pr = normalizeNumber(input.pr);

  if (url) args.push("--url", url);
  if (urlTemplate) args.push("--url-template", urlTemplate);
  if (pr !== null) args.push("--pr", String(pr));
  if (branch) args.push("--branch", branch);
  if (sha) args.push("--sha", sha);
  if (repo) args.push("--repo", repo);
  for (const routePath of normalizeStringArray(input.paths)) args.push("--path", routePath);
  for (const device of normalizeStringArray(input.devices)) args.push("--device", device);
  for (const flow of normalizeStringArray(input.flows)) args.push("--flow", flow);
  for (const snapshot of normalizeStringArray(input.snapshots)) args.push("--snapshot", snapshot);
  if (session) args.push("--session", session);
  if (sessionBundle) args.push("--session-bundle", sessionBundle);
  if (waitTimeout !== null) args.push("--wait-timeout", String(waitTimeout));
  if (waitInterval !== null) args.push("--wait-interval", String(waitInterval));
  if (normalizeBoolean(input.strictConsole)) args.push("--strict-console");
  if (normalizeBoolean(input.strictHttp)) args.push("--strict-http");
  if (normalizeBoolean(input.a11y)) {
    args.push("--a11y");
    const impact = normalizeString(input.a11yImpact) || "serious";
    args.push("--a11y-impact", impact);
    for (const scope of normalizeStringArray(input.a11yScopes)) args.push("--a11y-scope", scope);
  }
  if (normalizeBoolean(input.perf)) {
    args.push("--perf");
    const perfWaitMs = normalizeNumber(input.perfWaitMs);
    if (perfWaitMs !== null) args.push("--perf-wait-ms", String(perfWaitMs));
    for (const budget of normalizeStringArray(input.perfBudgets)) args.push("--perf-budget", budget);
  }
  args.push("--publish-dir", path.join(rel(writeScratchDir()), "deploy-output"));
  return args;
}

function buildManifest(): InspectManifest {
  return {
    server: {
      name: "codex-stack",
      version: VERSION,
      transport: "stdio",
      mutationPolicy: "read-only-plus-dry-run",
    },
    tools: toolDescriptors().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      script: tool.script,
      inputKeys: Object.keys(tool.inputSchema),
    })),
    resources: baseResourceDescriptors(),
    resourceTemplates: templateDescriptors(),
  };
}

function runJsonScript(tool: ToolDescriptor, args: string[]) {
  const commandPath = path.join(ROOT_DIR, tool.script);
  const result = spawnSync(BUN, [commandPath, ...args], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  const stderr = String(result.stderr || "").trim();
  const stdout = String(result.stdout || "").trim();
  if (result.status !== 0) {
    return {
      ok: false,
      tool: tool.name,
      command: rel(commandPath),
      args,
      result: stderr || stdout || `Command exited with status ${result.status ?? 1}`,
      stderr,
    };
  }
  try {
    return {
      ok: true,
      tool: tool.name,
      command: rel(commandPath),
      args,
      result: stdout ? JSON.parse(stdout) : {},
      stderr,
    };
  } catch {
    return {
      ok: false,
      tool: tool.name,
      command: rel(commandPath),
      args,
      result: stdout,
      stderr: stderr || "Expected JSON output from wrapped codex-stack script.",
    };
  }
}

function toolText(payload: JsonObject): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "codex-stack",
    version: VERSION,
  });

  for (const descriptor of toolDescriptors()) {
    server.registerTool(descriptor.name, {
      title: descriptor.title,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      outputSchema: TOOL_OUTPUT_SCHEMA,
    }, async (input) => {
      const payload = runJsonScript(descriptor, descriptor.buildArgs((input || {}) as ToolInput));
      return {
        content: textContent(toolText(payload)),
        structuredContent: payload,
        isError: !payload.ok,
      };
    });
  }

  const modesUri = "codex-stack://modes";
  server.registerResource("modes", modesUri, {
    title: "Codex-stack modes",
    description: "Registered codex-stack modes and summaries.",
    mimeType: "application/json",
  }, async () => jsonResource(modesUri, {
    generatedAt: new Date().toISOString(),
    modes: allModes().map((mode) => ({
      name: mode.name,
      role: mode.role,
      summary: mode.summary,
      skillPath: mode.skillPath,
    })),
  }));

  const latestJsonUri = "codex-stack://qa/latest/report.json";
  server.registerResource("qa-latest-json", latestJsonUri, {
    title: "Latest QA report JSON",
    description: "Latest local QA report JSON.",
    mimeType: "application/json",
  }, async () => jsonResource(latestJsonUri, readJsonFile(path.join(ROOT_DIR, ".codex-stack", "qa", "latest.json"), {
    status: "missing",
    message: "No local QA latest report found.",
  })));

  const latestMarkdownUri = "codex-stack://qa/latest/report.md";
  server.registerResource("qa-latest-markdown", latestMarkdownUri, {
    title: "Latest QA report Markdown",
    description: "Latest local QA report markdown.",
    mimeType: "text/markdown",
  }, async () => markdownResource(latestMarkdownUri, readFileOrFallback(path.join(ROOT_DIR, ".codex-stack", "qa", "latest.md"), "# No local QA report\n\nNo `.codex-stack/qa/latest.md` file is present yet.\n")));

  const qaPublishedIndexUri = "codex-stack://qa/published/index.json";
  server.registerResource("qa-published-index", qaPublishedIndexUri, {
    title: "Published QA report index",
    description: "Tracked docs/qa report slugs and resource URIs.",
    mimeType: "application/json",
  }, async () => jsonResource(qaPublishedIndexUri, buildPublishedQaIndex()));

  const fleetManifestUri = "codex-stack://fleet/manifest.json";
  server.registerResource("fleet-manifest", fleetManifestUri, {
    title: "Fleet manifest",
    description: "The active fleet manifest used by this repo.",
    mimeType: "application/json",
  }, async () => {
    const manifestPath = resolveFleetManifestPath();
    return jsonResource(fleetManifestUri, readJsonFile(manifestPath, {
      status: "missing",
      message: `No fleet manifest found at ${rel(manifestPath)}.`,
    }));
  });

  const fleetStatusUri = "codex-stack://fleet/member-status/index.json";
  server.registerResource("fleet-member-status-index", fleetStatusUri, {
    title: "Fleet member status index",
    description: "Local fleet status payloads discovered in this repo.",
    mimeType: "application/json",
  }, async () => jsonResource(fleetStatusUri, buildFleetStatusIndex()));

  server.registerResource(
    "skill-resource",
    new ResourceTemplate("codex-stack://skills/{mode}", {
      list: async () => ({
        resources: allModes().map((mode) => ({
          uri: `codex-stack://skills/${mode.name}`,
          name: `${mode.name}-skill`,
          title: `${mode.name} skill`,
          description: mode.summary,
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "Codex-stack skill",
      description: "Raw SKILL.md content for a registered codex-stack mode.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const modeName = String(variables.mode || "");
      const mode = findMode(modeName);
      const text = mode
        ? fs.readFileSync(mode.skillPath, "utf8")
        : `# Missing skill\n\nNo skill was found for mode \`${modeName}\`.\n`;
      return markdownResource(uri.toString(), text);
    },
  );

  server.registerResource(
    "qa-published-report-json",
    new ResourceTemplate("codex-stack://qa/published/{slug}/report.json", {
      list: async () => ({
        resources: listPublishedQaSlugs().map((slug) => ({
          uri: `codex-stack://qa/published/${slug}/report.json`,
          name: `${slug}-report-json`,
          title: `${slug} report JSON`,
          description: `Tracked QA report JSON for ${slug}.`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Published QA report JSON",
      description: "Tracked docs/qa report JSON for a published slug.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const slug = String(variables.slug || "");
      const filePath = path.join(ROOT_DIR, "docs", "qa", slug, "report.json");
      return jsonResource(uri.toString(), readJsonFile(filePath, {
        status: "missing",
        slug,
        message: `No tracked report.json exists for docs/qa/${slug}.`,
      }));
    },
  );

  server.registerResource(
    "qa-published-report-markdown",
    new ResourceTemplate("codex-stack://qa/published/{slug}/report.md", {
      list: async () => ({
        resources: listPublishedQaSlugs().map((slug) => ({
          uri: `codex-stack://qa/published/${slug}/report.md`,
          name: `${slug}-report-markdown`,
          title: `${slug} report Markdown`,
          description: `Tracked QA report markdown for ${slug}.`,
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "Published QA report Markdown",
      description: "Tracked docs/qa report markdown for a published slug.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const slug = String(variables.slug || "");
      const filePath = path.join(ROOT_DIR, "docs", "qa", slug, "report.md");
      return readResourceText(uri.toString(), filePath, "text/markdown", `# Missing report\n\nNo tracked report.md exists for docs/qa/${slug}.\n`);
    },
  );

  server.registerResource(
    "qa-published-visual-manifest",
    new ResourceTemplate("codex-stack://qa/published/{slug}/visual/manifest.json", {
      list: async () => ({
        resources: listPublishedQaSlugs()
          .filter((slug) => fs.existsSync(path.join(ROOT_DIR, "docs", "qa", slug, "visual", "manifest.json")))
          .map((slug) => ({
            uri: `codex-stack://qa/published/${slug}/visual/manifest.json`,
            name: `${slug}-visual-manifest`,
            title: `${slug} visual manifest`,
            description: `Tracked visual manifest for ${slug}.`,
            mimeType: "application/json",
          })),
      }),
    }),
    {
      title: "Published visual manifest",
      description: "Tracked visual manifest for a published QA slug.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const slug = String(variables.slug || "");
      const filePath = path.join(ROOT_DIR, "docs", "qa", slug, "visual", "manifest.json");
      return jsonResource(uri.toString(), readJsonFile(filePath, {
        status: "missing",
        slug,
        message: `No tracked visual manifest exists for docs/qa/${slug}.`,
      }));
    },
  );

  return server;
}

export async function serveMcp(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("codex-stack MCP server running on stdio");
}

export function inspectMcp(): InspectManifest {
  return buildManifest();
}
