#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { allModes, findMode } from "./registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
  console.log(`codex-stack

Usage:
  codex-stack list
  codex-stack show <mode>
  codex-stack path <mode>
  codex-stack doctor
  codex-stack issue <create|branch|start> <args...>
  codex-stack review [--json] [--base <ref>]
  codex-stack qa <url> [--flow <name>] [--snapshot <name>] [--update-snapshot] [--session <name>] [--mode <quick|full|regression>] [--json]
  codex-stack ship [--dry-run] [--message <msg>] [--push] [--pr] [--template <path>] [--reviewer <user>] [--team-reviewer <org/team>] [--assignee <user>] [--assign-self] [--project <title>] [--label <name>] [--milestone <title>] [--verify-url <url>] [--verify-flow <name>] [--verify-snapshot <name>] [--verify-session <name>] [--update-verify-snapshot] [--draft]
  codex-stack retro [--since <range>] [--out <path>] [--json] [--artifact-dir <path>] [--no-artifacts] [--repo <owner/name>] [--no-github]
  codex-stack browse <args...>
`);
  process.exit(1);
}

function runDoctor() {
  const resolved = path.resolve(__dirname, "..", "scripts", "doctor.sh");
  const result = spawnSync("bash", [resolved], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function resolveJsRuntime() {
  if (process.versions?.bun) return process.execPath || "bun";
  const bunCheck = spawnSync("bun", ["--version"], { stdio: "pipe", encoding: "utf8" });
  if ((bunCheck.status ?? 1) === 0) return "bun";
  return process.execPath || "node";
}

const JS_RUNTIME = resolveJsRuntime();

function runBrowse(args) {
  const browsePath = path.resolve(__dirname, "..", "browse", "dist", "cli.js");
  const result = spawnSync(JS_RUNTIME, [browsePath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runReview(args) {
  const reviewPath = path.resolve(__dirname, "..", "scripts", "review-diff.mjs");
  const result = spawnSync(JS_RUNTIME, [reviewPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runIssue(args) {
  const issuePath = path.resolve(__dirname, "..", "scripts", "issue-flow.mjs");
  const result = spawnSync(JS_RUNTIME, [issuePath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runShip(args) {
  const shipPath = path.resolve(__dirname, "..", "scripts", "ship-branch.mjs");
  const result = spawnSync(JS_RUNTIME, [shipPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runQa(args) {
  const qaPath = path.resolve(__dirname, "..", "scripts", "qa-run.mjs");
  const result = spawnSync(JS_RUNTIME, [qaPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runRetro(args) {
  const retroPath = path.resolve(__dirname, "..", "scripts", "retro-report.mjs");
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
  const mode = findMode(rest[0] || "");
  if (!mode) {
    console.error(`Unknown mode: ${rest[0] || ""}`);
    process.exit(1);
  }
  console.log(fs.readFileSync(mode.skillPath, "utf8"));
  process.exit(0);
}

if (command === "path") {
  const mode = findMode(rest[0] || "");
  if (!mode) {
    console.error(`Unknown mode: ${rest[0] || ""}`);
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

if (command === "issue") {
  runIssue(rest);
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
