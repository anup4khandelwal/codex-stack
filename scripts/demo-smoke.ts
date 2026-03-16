#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const DEMO_DIR = path.join(ROOT, "examples", "customer-portal-demo");
const PUBLIC_DIR = path.join(DEMO_DIR, "public");
const BUN = process.execPath || "bun";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf8");
}

function buildDemoApp(): void {
  execFileSync(
    BUN,
    [
      "build",
      "examples/customer-portal-demo/src/app.ts",
      "--target",
      "browser",
      "--format",
      "iife",
      "--outfile",
      "examples/customer-portal-demo/public/app.js",
    ],
    {
      cwd: ROOT,
      stdio: "pipe",
    },
  );
}

function main(): void {
  buildDemoApp();

  execFileSync(BUN, ["examples/customer-portal-demo/server.ts", "--check"], {
    cwd: ROOT,
    stdio: "pipe",
  });

  const landing = read("index.html");
  const login = read("login.html");
  const dashboard = read("dashboard.html");
  const changes = read("changes.html");
  const css = read("app.css");
  const js = read("app.js");

  if (!landing.includes("Acme Release Readiness Demo")) {
    throw new Error("Landing page is missing the release-readiness title.");
  }
  if (!login.includes("Release operator sign in")) {
    throw new Error("Login page is missing the release-operator heading.");
  }
  if (!dashboard.includes("Release readiness dashboard")) {
    throw new Error("Dashboard page is missing the release-readiness heading.");
  }
  if (!changes.includes("Change impact and preview evidence")) {
    throw new Error("Changes page is missing the evidence heading.");
  }
  if (!css.includes(".status-strip")) {
    throw new Error("Demo styles are missing the release status strip styling.");
  }
  if (!js.includes("changesPath")) {
    throw new Error("Demo client script is missing the changes route helper.");
  }

  console.log("demo sample app is healthy");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
