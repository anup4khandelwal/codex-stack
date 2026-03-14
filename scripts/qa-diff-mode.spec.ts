#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-qa-diff-mode-"));

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: fixtureRoot, encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  git(["init", "-b", "main"]);
  git(["config", "user.email", "qa-diff-mode@example.com"]);
  git(["config", "user.name", "QA Diff Mode Spec"]);

  fs.mkdirSync(path.join(fixtureRoot, "src", "app"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "src", "app", "page.tsx"), "export default function Home() { return 'home'; }\n");
  git(["add", "."]);
  git(["commit", "-m", "chore: baseline"]);

  git(["checkout", "-b", "feat/qa-diff-mode"]);
  fs.mkdirSync(path.join(fixtureRoot, "src", "app", "settings"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "src", "app", "settings", "page.tsx"), "export default function Settings() { return 'settings'; }\n");
  git(["add", "."]);
  git(["commit", "-m", "feat: add settings route"]);

  const browseDir = path.join(fixtureRoot, "browse", "src");
  fs.mkdirSync(browseDir, { recursive: true });
  fs.writeFileSync(
    path.join(browseDir, "cli.ts"),
    `#!/usr/bin/env bun
const [command, url] = process.argv.slice(2);
if (command === "probe") {
  console.log(JSON.stringify({
    url,
    finalUrl: url,
    title: "Settings",
    status: 200,
    ok: true,
    bodyLength: 128
  }, null, 2));
  process.exit(0);
}
console.error("unexpected command", command, url);
process.exit(1);
`,
  );

  const raw = execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "qa-run.ts"),
      "https://preview.example.com",
      "--mode",
      "diff-aware",
      "--base-ref",
      "main",
      "--json",
    ],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );

  const report = JSON.parse(raw) as {
    status?: string;
    healthScore?: number;
    diffSummary?: {
      baseRef?: string;
      changedFiles?: string[];
      candidateRoutes?: Array<{ route?: string; url?: string; dynamic?: boolean }>;
    };
    routeResults?: Array<{ route?: string; url?: string; status?: string; httpStatus?: number; title?: string }>;
    findings?: Array<{ title?: string }>;
  };

  assert.equal(report.status, "pass");
  assert.equal(report.healthScore, 100);
  assert.equal(report.diffSummary?.baseRef, "main");
  assert.ok(report.diffSummary?.changedFiles?.includes("src/app/settings/page.tsx"));
  assert.ok(report.diffSummary?.candidateRoutes?.some((item) => item.route === "/settings" && item.url === "https://preview.example.com/settings"));
  assert.ok(report.routeResults?.some((item) => item.route === "/settings" && item.status === "pass" && item.httpStatus === 200 && item.title === "Settings"));
  assert.equal(report.findings?.length || 0, 0);

  console.log("qa-diff-mode spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
