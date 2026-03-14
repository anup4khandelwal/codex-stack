import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { allModes, findMode } from "./registry.js";

function usage(): never {
  console.log(`codex-stack

Usage:
  codex-stack list
  codex-stack show <mode>
  codex-stack path <mode>
  codex-stack doctor
  codex-stack review [--json] [--base <ref>]
  codex-stack qa <url> [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--mode <quick|full|regression>] [--json]
  codex-stack ship [--dry-run] [--message <msg>] [--push] [--pr] [--template <path>] [--reviewer <user>] [--team-reviewer <org/team>] [--assignee <user>] [--assign-self] [--project <title>] [--label <name>] [--milestone <title>] [--verify-url <url>] [--verify-flow <name>] [--verify-snapshot <name>] [--verify-session <name>] [--update-verify-snapshot] [--draft]
  codex-stack retro [--since <range>] [--out <path>] [--json] [--artifact-dir <path>] [--no-artifacts] [--repo <owner/name>] [--no-github]
  codex-stack browse <args...>
`);
  process.exit(1);
}

function runDoctor(): void {
  const scriptPath = path.resolve(process.cwd(), "scripts", "doctor.sh");
  const fallback = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "doctor.sh");
  const resolved = fs.existsSync(scriptPath) ? scriptPath : fallback;
  const result = spawnSync("bash", [resolved], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function resolveJsRuntime(): string {
  if ((process.versions as Record<string, string | undefined>).bun) {
    return process.execPath || "bun";
  }
  const bunCheck = spawnSync("bun", ["--version"], { stdio: "pipe", encoding: "utf8" });
  if ((bunCheck.status ?? 1) === 0) {
    return "bun";
  }
  return process.execPath || "node";
}

const JS_RUNTIME = resolveJsRuntime();

function runBrowse(args: string[]): void {
  const browsePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "browse", "dist", "cli.js");
  const result = spawnSync(JS_RUNTIME, [browsePath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runReview(args: string[]): void {
  const reviewPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "review-diff.mjs");
  const result = spawnSync(JS_RUNTIME, [reviewPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runShip(args: string[]): void {
  const shipPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "ship-branch.mjs");
  const result = spawnSync(JS_RUNTIME, [shipPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runQa(args: string[]): void {
  const qaPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "qa-run.mjs");
  const result = spawnSync(JS_RUNTIME, [qaPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runRetro(args: string[]): void {
  const retroPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "scripts", "retro-report.mjs");
  const result = spawnSync(JS_RUNTIME, [retroPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
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
  runBrowse(rest);
}

if (command === "review") {
  runReview(rest);
}

if (command === "qa") {
  runQa(rest);
}

if (command === "ship") {
  runShip(rest);
}

if (command === "retro") {
  runRetro(rest);
}

usage();
