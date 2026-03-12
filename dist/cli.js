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
  codex-stack review [--json] [--base <ref>]
  codex-stack ship [--dry-run] [--message <msg>] [--push] [--pr] [--template <path>] [--reviewer <user>] [--label <name>] [--draft]
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

function runBrowse(args) {
  const browsePath = path.resolve(__dirname, "..", "browse", "dist", "cli.js");
  const result = spawnSync("node", [browsePath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runReview(args) {
  const reviewPath = path.resolve(__dirname, "..", "scripts", "review-diff.mjs");
  const result = spawnSync("node", [reviewPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runShip(args) {
  const shipPath = path.resolve(__dirname, "..", "scripts", "ship-branch.mjs");
  const result = spawnSync("node", [shipPath, ...args], { stdio: "inherit" });
  process.exit(result.status ?? 0);
}

function runRetro(args) {
  const retroPath = path.resolve(__dirname, "..", "scripts", "retro-report.mjs");
  const result = spawnSync("node", [retroPath, ...args], { stdio: "inherit" });
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

if (command === "ship") {
  runShip(rest);
}

if (command === "retro") {
  runRetro(rest);
}

usage();
