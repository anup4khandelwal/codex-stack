#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const prReview = fs.readFileSync(path.join(rootDir, ".github", "workflows", "pr-review.yml"), "utf8");
const previewVerify = fs.readFileSync(path.join(rootDir, ".github", "workflows", "preview-verify.yml"), "utf8");
const previewCleanup = fs.readFileSync(path.join(rootDir, ".github", "workflows", "preview-cleanup.yml"), "utf8");

for (const workflow of [prReview, previewVerify]) {
  assert.match(workflow, /CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64/);
  assert.match(workflow, /mktemp/);
  assert.match(workflow, /base64 --decode/);
  assert.match(workflow, /--session-bundle/);
  assert.match(workflow, /trap cleanup EXIT/);
}

assert.match(previewCleanup, /pull_request:/);
assert.match(previewCleanup, /types: \[closed\]/);
assert.match(previewCleanup, /name: Checkout workflow source/);
assert.match(previewCleanup, /cleanup-preview-site\.ts/);
assert.match(previewCleanup, /ref: gh-pages/);
assert.ok((previewCleanup.match(/uses: actions\/checkout@v4/g) || []).length >= 2);
assert.match(previewCleanup, /Publish cleaned gh-pages branch/);

console.log("preview-workflow-auth spec passed");
