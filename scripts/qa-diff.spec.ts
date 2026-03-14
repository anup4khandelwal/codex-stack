#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inferChangedRoutes, inferRouteCandidate } from "./qa-diff.ts";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-qa-diff-"));

function git(args: string[], cwd = fixtureRoot): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const staticCandidate = inferRouteCandidate("src/app/settings/page.tsx", "https://preview.example.com");
  assert.equal(staticCandidate?.route, "/settings");
  assert.equal(staticCandidate?.url, "https://preview.example.com/settings");
  assert.equal(staticCandidate?.dynamic, false);

  const dynamicCandidate = inferRouteCandidate("pages/blog/[slug].tsx", "https://preview.example.com");
  assert.equal(dynamicCandidate?.route, "/blog/[slug]");
  assert.equal(dynamicCandidate?.dynamic, true);
  assert.equal(dynamicCandidate?.url, "");

  git(["init", "-b", "main"]);
  git(["config", "user.email", "qa-diff@example.com"]);
  git(["config", "user.name", "QA Diff Spec"]);

  fs.mkdirSync(path.join(fixtureRoot, "src", "app"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "src", "app", "page.tsx"), "export default function Home() { return 'home'; }\n");
  git(["add", "."]);
  git(["commit", "-m", "chore: baseline"]);

  git(["checkout", "-b", "feat/qa-diff"]);
  fs.mkdirSync(path.join(fixtureRoot, "src", "app", "settings"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "src", "app", "settings", "page.tsx"), "export default function Settings() { return 'settings'; }\n");
  fs.mkdirSync(path.join(fixtureRoot, "pages", "blog"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "pages", "blog", "[slug].tsx"), "export default function Blog() { return 'blog'; }\n");
  git(["add", "."]);
  git(["commit", "-m", "feat: add settings route"]);

  const inferred = inferChangedRoutes({
    cwd: fixtureRoot,
    baseRef: "main",
    baseUrl: "https://preview.example.com",
  });

  assert.equal(inferred.baseRef, "main");
  assert.ok(inferred.changedFiles.includes("src/app/settings/page.tsx"));
  assert.ok(inferred.changedFiles.includes("pages/blog/[slug].tsx"));
  assert.ok(inferred.candidates.some((item) => item.route === "/settings" && item.url === "https://preview.example.com/settings"));
  assert.ok(inferred.candidates.some((item) => item.route === "/blog/[slug]" && item.dynamic));

  console.log("qa-diff spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
