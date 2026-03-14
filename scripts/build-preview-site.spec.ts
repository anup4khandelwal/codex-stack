#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildPreviewSite } from "./build-preview-site.ts";

const fixtureRoot = path.resolve(process.cwd(), "examples", "customer-portal-demo", "public");
const appBundle = path.join(fixtureRoot, "app.js");
if (!fs.existsSync(appBundle)) {
  const result = spawnSync(process.execPath || "bun", ["run", "build"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr || "Expected `bun run build` to succeed before building preview fixtures.");
}
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-preview-site-"));

const result = buildPreviewSite({
  source: fixtureRoot,
  out: outDir,
  json: false,
});

assert.equal(path.resolve(result.out), outDir);
assert.ok(fs.existsSync(path.join(outDir, ".nojekyll")));
assert.ok(fs.existsSync(path.join(outDir, "app.css")));
assert.ok(fs.existsSync(path.join(outDir, "app.js")));
assert.ok(fs.existsSync(path.join(outDir, "index.html")));
assert.ok(fs.existsSync(path.join(outDir, "login", "index.html")));
assert.ok(fs.existsSync(path.join(outDir, "dashboard", "index.html")));

const rootHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
const loginHtml = fs.readFileSync(path.join(outDir, "login", "index.html"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(outDir, "dashboard", "index.html"), "utf8");

assert.match(rootHtml, /href="\.\//);
assert.match(rootHtml, /href="\.\.\/login\/"|href="\.\/login\/"/);
assert.match(loginHtml, /href="\.\.\/app\.css"/);
assert.match(loginHtml, /src="\.\.\/app\.js"/);
assert.match(dashboardHtml, /href="\.\.\/app\.css"/);
assert.match(dashboardHtml, /src="\.\.\/app\.js"/);

fs.rmSync(outDir, { recursive: true, force: true });
console.log("build-preview-site spec passed");
