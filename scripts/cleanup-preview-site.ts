#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

interface CleanupArgs {
  siteDir: string;
  pr: string;
  json: boolean;
}

interface CleanupResult {
  siteDir: string;
  previewRoot: string;
  targetDir: string;
  pr: string;
  removed: boolean;
  exists: boolean;
}

function usage(): never {
  console.log(`cleanup-preview-site

Usage:
  bun scripts/cleanup-preview-site.ts --pr <number> [--site-dir <path>] [--json]
`);
  process.exit(0);
}

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseArgs(argv: string[]): CleanupArgs {
  const args: CleanupArgs = {
    siteDir: path.resolve(process.cwd(), ".gh-pages"),
    pr: "",
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--site-dir") {
      args.siteDir = path.resolve(process.cwd(), argv[index + 1] || args.siteDir);
      index += 1;
    } else if (arg === "--pr") {
      args.pr = cleanSubject(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }

  if (!args.pr) {
    throw new Error("Provide --pr <number>.");
  }
  return args;
}

export function cleanupPreviewSite(args: CleanupArgs): CleanupResult {
  const previewRoot = path.join(args.siteDir, "pr-preview");
  const targetDir = path.join(previewRoot, `pr-${args.pr}`);
  const exists = fs.existsSync(targetDir);
  if (exists) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  return {
    siteDir: args.siteDir,
    previewRoot,
    targetDir,
    pr: args.pr,
    removed: exists,
    exists: fs.existsSync(targetDir),
  };
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const result = cleanupPreviewSite(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Preview cleanup: ${result.removed ? "removed" : "no-op"}`);
    console.log(`- site: ${result.siteDir}`);
    console.log(`- preview dir: ${result.targetDir}`);
  }
}
