#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const DEMO_DIR = path.join(ROOT, "examples", "customer-portal-demo");
const PUBLIC_DIR = path.join(DEMO_DIR, "public");

function read(relativePath) {
  return fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf8");
}

async function main() {
  execFileSync("node", ["examples/customer-portal-demo/server.mjs", "--check"], {
    cwd: ROOT,
    stdio: "pipe",
  });

  const landing = read("index.html");
  const login = read("login.html");
  const dashboard = read("dashboard.html");
  const css = read("app.css");
  const js = read("app.js");

  if (!landing.includes("Acme Customer Portal")) {
    throw new Error("Landing page is missing the expected title.");
  }
  if (!login.includes("Operator sign in")) {
    throw new Error("Login page is missing the expected heading.");
  }
  if (!dashboard.includes("Daily portfolio health")) {
    throw new Error("Dashboard page is missing the expected heading.");
  }
  if (!css.includes(".metric-card")) {
    throw new Error("Demo styles are missing the metric-card styling.");
  }
  if (!js.includes("codexStackDemoSession")) {
    throw new Error("Demo client script is missing session persistence.");
  }

  console.log("demo sample app is healthy");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
