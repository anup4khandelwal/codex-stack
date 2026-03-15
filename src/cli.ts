#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { allModes, findMode } from "./registry.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BUN = process.execPath || "bun";

function usage(): never {
  console.log(`codex-stack

Usage:
  codex-stack list
  codex-stack show <mode>
  codex-stack path <mode>
  codex-stack doctor
  codex-stack issue <create|branch|start> <args...>
  codex-stack review [--json] [--base <ref>]
  codex-stack qa <url> [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--session-bundle <path>] [--mode <quick|full|regression|diff-aware>] [--base-ref <ref>] [--json]
  codex-stack qa-decide <approve|suppress|list|prune-expired> <args...>
  codex-stack preview [--url <url> | --url-template <template>] [--pr <number>] [--branch <ref>] [--sha <sha>] [--repo <owner/name>] [--path <path>] [--device <desktop|tablet|mobile>] [--flow <name>] [--snapshot <name>] [--session <name>] [--session-bundle <path>] [--publish-dir <path>] [--markdown-out <path>] [--json-out <path>] [--comment-out <path>] [--wait-timeout <seconds>] [--wait-interval <seconds>] [--strict-console] [--strict-http] [--fixture <path>] [--qa-fixture <path>] [--readiness-fixture <path>] [--json]
  codex-stack deploy [--url <url> | --url-template <template>] [--pr <number>] [--branch <ref>] [--sha <sha>] [--repo <owner/name>] [--path <path>] [--device <desktop|tablet|mobile>] [--flow <name>] [--snapshot <name>] [--session <name>] [--session-bundle <path>] [--publish-dir <path>] [--markdown-out <path>] [--json-out <path>] [--comment-out <path>] [--strict-console] [--strict-http] [--wait-timeout <seconds>] [--wait-interval <seconds>] [--fixture <path>] [--qa-fixture <path>] [--readiness-fixture <path>] [--json]
  codex-stack ship [--dry-run] [--message <msg>] [--push] [--pr] [--template <path>] [--reviewer <user>] [--team-reviewer <org/team>] [--assignee <user>] [--assign-self] [--project <title>] [--label <name>] [--milestone <title>] [--verify-url <url>] [--verify-path <path>] [--verify-device <desktop|tablet|mobile>] [--verify-flow <name>] [--verify-snapshot <name>] [--verify-session <name>] [--verify-console-errors] [--update-verify-snapshot] [--draft]
  codex-stack fleet <validate|sync|collect|dashboard> --manifest <path> [args...]
  codex-stack retro [--since <range>] [--out <path>] [--json] [--artifact-dir <path>] [--no-artifacts] [--repo <owner/name>] [--no-github]
  codex-stack upgrade [--json] [--json-out <path>] [--markdown-out <path>] [--repo <owner/name>] [--offline] [--apply]
  codex-stack show setup-browser-cookies
  codex-stack browse <args...>
`);
  process.exit(1);
}

function runDoctor(): never {
  const scriptPath = path.resolve(process.cwd(), "scripts", "doctor.sh");
  const fallback = path.resolve(ROOT_DIR, "scripts", "doctor.sh");
  const resolved = fs.existsSync(scriptPath) ? scriptPath : fallback;
  const result = spawnSync("bash", [resolved], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function runScript(relativePath: string, args: string[]): never {
  const scriptPath = path.resolve(ROOT_DIR, relativePath);
  const result = spawnSync(BUN, [scriptPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

const [, , command, ...rest] = process.argv;

if (!command) usage();

if (command === "list") {
  for (const mode of allModes()) {
    console.log(`${mode.name}\t${mode.role}\t${mode.summary}`);
  }
  process.exit(0);
}

if (command === "show") {
  const modeName = rest[0];
  if (!modeName) usage();
  const mode = findMode(modeName);
  if (!mode) {
    console.error(`Unknown mode: ${modeName}`);
    process.exit(1);
  }
  console.log(fs.readFileSync(mode.skillPath, "utf8"));
  process.exit(0);
}

if (command === "path") {
  const modeName = rest[0];
  if (!modeName) usage();
  const mode = findMode(modeName);
  if (!mode) {
    console.error(`Unknown mode: ${modeName}`);
    process.exit(1);
  }
  console.log(mode.skillPath);
  process.exit(0);
}

if (command === "doctor") {
  runDoctor();
}

if (command === "browse") {
  runScript(path.join("browse", "src", "cli.ts"), rest);
}

if (command === "review") {
  runScript(path.join("scripts", "review-diff.ts"), rest);
}

if (command === "issue") {
  runScript(path.join("scripts", "issue-flow.ts"), rest);
}

if (command === "qa") {
  runScript(path.join("scripts", "qa-run.ts"), rest);
}

if (command === "qa-decide") {
  runScript(path.join("scripts", "qa-decide.ts"), rest);
}

if (command === "preview") {
  runScript(path.join("scripts", "preview-verify.ts"), rest);
}

if (command === "deploy") {
  runScript(path.join("scripts", "deploy-verify.ts"), rest);
}

if (command === "ship") {
  runScript(path.join("scripts", "ship-branch.ts"), rest);
}

if (command === "fleet") {
  runScript(path.join("scripts", "fleet.ts"), rest);
}

if (command === "retro") {
  runScript(path.join("scripts", "retro-report.ts"), rest);
}

if (command === "upgrade") {
  runScript(path.join("scripts", "upgrade-check.ts"), rest);
}

usage();
