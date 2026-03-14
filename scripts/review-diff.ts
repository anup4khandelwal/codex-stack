#!/usr/bin/env bun
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

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

function usage() {
  console.log(`review-diff

Usage:
  bun scripts/review-diff.ts [--json] [--base <ref>]
`);
  process.exit(0);
}

function parseArgs(argv) {
  const args = { json: false, base: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--base") {
      args.base = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  return args;
}

function resolveBaseRef(explicitBase) {
  if (explicitBase) return explicitBase;
  const candidates = ["origin/main", "main", "origin/master", "master"];
  for (const candidate of candidates) {
    const ok = run(`git rev-parse --verify ${candidate}`, { allowFailure: true });
    if (ok) return candidate;
  }
  return "";
}

function resolveBranchName(): string {
  const envBranch = String(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "").trim();
  if (envBranch && envBranch !== "HEAD") {
    return envBranch;
  }
  const current = run("git branch --show-current", { allowFailure: true });
  if (current && current !== "HEAD") {
    return current;
  }
  const fallback = run("git rev-parse --abbrev-ref HEAD", { allowFailure: true });
  if (fallback && fallback !== "HEAD") {
    return fallback;
  }
  const shortSha = run("git rev-parse --short HEAD", { allowFailure: true });
  return shortSha ? `detached-${shortSha}` : "";
}

function readChecklist() {
  const filePath = path.join(process.cwd(), "skills", "review", "checklist.md");
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function countChangedLines(diffText) {
  return diffText
    .split(/\r?\n/)
    .filter((line) => (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")).length;
}

function finding(severity, title, detail, files = []) {
  return { severity, title, detail, files };
}

function analyze({ diffText, fileNames, branch, baseRef }) {
  const findings = [];
  const hasTests = fileNames.some((file) => /(test|spec)\.(ts|tsx|js|jsx|py|go|rb)$/.test(file) || /(^|\/)(tests?|__tests__)\//.test(file));
  const changedLines = countChangedLines(diffText);
  const sensitiveFiles = fileNames.filter((file) => /auth|oauth|jwt|session|permission|secret|token|payment|billing|workflow|terraform|k8s|docker/i.test(file));
  const dbFiles = fileNames.filter((file) => /migration|schema|sql|prisma|db\//i.test(file));
  const aiFiles = fileNames.filter((file) => /prompt|llm|openai|anthropic|agent|rag|embedding/i.test(file));
  const workflowFiles = fileNames.filter((file) => /^\.github\/workflows\//.test(file));
  const frontendFiles = fileNames.filter((file) => /\.(tsx|jsx|css|scss|vue)$/.test(file) || /(^|\/)(components|pages|app|web|ui)\//.test(file));

  if (changedLines > 800) {
    findings.push(finding("warning", "Large review surface", `Diff against ${baseRef} is ${changedLines} changed lines. Split the change or expect shallow review quality.`, fileNames.slice(0, 10)));
  }

  if (sensitiveFiles.length && !hasTests) {
    findings.push(
      finding(
        "critical",
        "Sensitive paths changed without tests",
        "Security- or release-sensitive files changed, but no test updates were detected in the diff.",
        sensitiveFiles
      )
    );
  }

  if (dbFiles.length && /drop table|delete from|truncate|alter table/i.test(diffText)) {
    findings.push(
      finding(
        "critical",
        "Potentially destructive database change",
        "The diff includes destructive SQL or schema operations. Confirm rollback and data safety before merge.",
        dbFiles
      )
    );
  }

  if (/dangerouslysetinnerhtml|innerhtml\s*=|eval\(|new function\(/i.test(diffText)) {
    findings.push(
      finding(
        "critical",
        "Unsafe code execution or HTML injection",
        "The diff introduces dynamic HTML or code execution paths. Review the trust boundary and sanitization strategy.",
        fileNames.filter((file) => /\.(tsx|jsx|ts|js|html)$/.test(file))
      )
    );
  }

  if (aiFiles.length && /req\.body|request\.body|userinput|external data|search results|web data/i.test(diffText)) {
    findings.push(
      finding(
        "warning",
        "LLM trust boundary risk",
        "Model or prompt-related code changed alongside external/user-controlled input. Check prompt injection handling and output validation.",
        aiFiles
      )
    );
  }

  if (/retry|backoff|cron|queue|job/i.test(diffText) && !/idempot/i.test(diffText)) {
    findings.push(
      finding(
        "warning",
        "Retry or background job logic needs idempotency review",
        "The diff changes retry, cron, queue, or job behavior but does not show explicit idempotency handling.",
        fileNames
      )
    );
  }

  if (workflowFiles.length) {
    findings.push(
      finding(
        "warning",
        "Workflow or release automation changed",
        "CI/CD changes deserve a second reviewer and a dry run because failures often show up after merge.",
        workflowFiles
      )
    );
  }

  if (frontendFiles.length && !hasTests) {
    findings.push(
      finding(
        "warning",
        "Frontend changes without test coverage",
        "UI-impacting files changed without matching tests. Add targeted tests or document manual QA coverage.",
        frontendFiles
      )
    );
  }

  if (!findings.length) {
    findings.push(
      finding(
        "info",
        "No obvious structural issues detected",
        `Reviewed branch ${branch} against ${baseRef}. No heuristic findings triggered. Human review is still required.`,
        []
      )
    );
  }

  return findings;
}

function printText(result) {
  console.log(`# Pre-Landing Review`);
  console.log();
  console.log(`- Branch: ${result.branch}`);
  console.log(`- Base: ${result.baseRef}`);
  console.log(`- Files changed: ${result.fileNames.length}`);
  console.log(`- Checklist: ${result.checklistPath}`);
  console.log();
  for (const item of result.findings) {
    console.log(`## ${item.severity.toUpperCase()}: ${item.title}`);
    console.log(item.detail);
    if (item.files.length) {
      console.log(`Files: ${item.files.join(", ")}`);
    }
    console.log();
  }
}

const args = parseArgs(process.argv.slice(2));
const branch = resolveBranchName();

if (!branch) {
  console.error("Unable to determine current branch.");
  process.exit(1);
}

if (branch === "main" || branch === "master") {
  const message = "Nothing to review — you are on the default branch.";
  if (args.json) console.log(JSON.stringify({ status: "noop", message }, null, 2));
  else console.log(message);
  process.exit(0);
}

const baseRef = resolveBaseRef(args.base);
if (!baseRef) {
  console.error("Unable to resolve a base branch. Pass `--base <ref>` explicitly.");
  process.exit(1);
}

const checklistPath = path.join(process.cwd(), "skills", "review", "checklist.md");
if (!fs.existsSync(checklistPath)) {
  console.error(`Missing review checklist at ${checklistPath}`);
  process.exit(1);
}

const diffText = run(`git diff --find-renames --unified=0 ${baseRef}`);
const fileNames = run(`git diff --name-only ${baseRef}`, { allowFailure: true })
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean);

if (!diffText.trim() || !fileNames.length) {
  const message = `Nothing to review — no diff found against ${baseRef}.`;
  if (args.json) console.log(JSON.stringify({ status: "noop", message }, null, 2));
  else console.log(message);
  process.exit(0);
}

const result = {
  status: "ok",
  branch,
  baseRef,
  checklistPath,
  checklistSummary: readChecklist().split(/\r?\n/).filter(Boolean).slice(0, 8),
  fileNames,
  findings: analyze({ diffText, fileNames, branch, baseRef }),
};

if (args.json) console.log(JSON.stringify(result, null, 2));
else printText(result);
