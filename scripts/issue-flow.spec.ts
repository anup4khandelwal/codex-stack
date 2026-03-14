#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-issue-flow-"));
const fakeBin = path.join(fixtureRoot, "bin");
const ghPath = path.join(fakeBin, "gh");

function writeFakeGh(): void {
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(ghPath, `#!/usr/bin/env bun
import fs from "node:fs";
import process from "node:process";

const capturePath = process.env.ISSUE_FLOW_CAPTURE_FILE || "";
if (capturePath) {
  fs.writeFileSync(capturePath, JSON.stringify({ argv: process.argv.slice(2) }, null, 2));
}

if (process.argv[2] === "issue" && process.argv[3] === "create") {
  console.log("https://github.com/acme/repo/issues/123");
  process.exit(0);
}

if (process.argv[2] === "issue" && process.argv[3] === "view") {
  console.log("Loaded issue title");
  process.exit(0);
}

console.error("unexpected gh invocation");
process.exit(1);
`);
  fs.chmodSync(ghPath, 0o755);
}

function runIssueFlow(args: string[], captureName: string): { stdout: string; captured: { argv: string[] } } {
  const capturePath = path.join(fixtureRoot, captureName);
  const stdout = execFileSync(bun, ["scripts/issue-flow.ts", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
      ISSUE_FLOW_CAPTURE_FILE: capturePath,
    },
  });
  return {
    stdout,
    captured: JSON.parse(fs.readFileSync(capturePath, "utf8")) as { argv: string[] },
  };
}

try {
  writeFakeGh();

  const markdownBody = [
    "## Summary",
    "",
    "```bash",
    "echo \"hello\"",
    "```",
    "",
    "Use `codex-stack` here.",
  ].join("\n");

  const bodyFlag = runIssueFlow([
    "create",
    "--repo",
    "acme/repo",
    "--title",
    "Fix issue flow",
    "--body",
    markdownBody,
    "--json",
  ], "body-flag.json");

  const issueFromBodyFlag = JSON.parse(bodyFlag.stdout) as { issue?: { number?: number } };
  assert.equal(issueFromBodyFlag.issue?.number, 123);
  assert.deepEqual(bodyFlag.captured.argv, [
    "issue",
    "create",
    "--repo",
    "acme/repo",
    "--title",
    "Fix issue flow",
    "--body",
    markdownBody,
  ]);

  const markdownFilePath = path.join(fixtureRoot, "issue-body.md");
  fs.writeFileSync(markdownFilePath, [
    "# Context",
    "",
    "- Preserve backticks like `bun run smoke`",
    "",
    "```ts",
    "console.log(\"ok\");",
    "```",
  ].join("\n"));

  const bodyFile = runIssueFlow([
    "create",
    "--repo",
    "acme/repo",
    "--title",
    "Fix issue flow from file",
    "--body-file",
    markdownFilePath,
    "--label",
    "automation",
    "--assignee",
    "anup4khandelwal",
    "--json",
  ], "body-file.json");

  const issueFromBodyFile = JSON.parse(bodyFile.stdout) as { issue?: { number?: number } };
  assert.equal(issueFromBodyFile.issue?.number, 123);
  assert.deepEqual(bodyFile.captured.argv, [
    "issue",
    "create",
    "--repo",
    "acme/repo",
    "--title",
    "Fix issue flow from file",
    "--body",
    fs.readFileSync(markdownFilePath, "utf8"),
    "--label",
    "automation",
    "--assignee",
    "anup4khandelwal",
  ]);

  console.log("issue-flow spec passed");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
