#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanupPreviewSite } from "./cleanup-preview-site.ts";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-preview-cleanup-"));

try {
  const siteDir = path.join(fixtureRoot, "site");
  fs.mkdirSync(path.join(siteDir, "pr-preview", "pr-101"), { recursive: true });
  fs.mkdirSync(path.join(siteDir, "pr-preview", "pr-202"), { recursive: true });
  fs.mkdirSync(path.join(siteDir, "qa"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "index.html"), "root");
  fs.writeFileSync(path.join(siteDir, "pr-preview", "pr-101", "index.html"), "101");
  fs.writeFileSync(path.join(siteDir, "pr-preview", "pr-202", "index.html"), "202");
  fs.writeFileSync(path.join(siteDir, "qa", "index.html"), "qa");

  const removed = cleanupPreviewSite({ siteDir, pr: "101", json: true });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(path.join(siteDir, "pr-preview", "pr-101")), false);
  assert.equal(fs.existsSync(path.join(siteDir, "pr-preview", "pr-202", "index.html")), true);
  assert.equal(fs.existsSync(path.join(siteDir, "qa", "index.html")), true);
  assert.equal(fs.existsSync(path.join(siteDir, "index.html")), true);

  const noop = cleanupPreviewSite({ siteDir, pr: "999", json: true });
  assert.equal(noop.removed, false);
  assert.equal(fs.existsSync(path.join(siteDir, "pr-preview", "pr-202", "index.html")), true);

  console.log("cleanup-preview-site spec passed");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
