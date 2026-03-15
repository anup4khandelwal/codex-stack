#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-snapshot-pack-"));

async function main(): Promise<void> {
  process.chdir(fixtureRoot);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=", "base64");
  const baselineJsonPath = path.join(fixtureRoot, "baseline.json");
  const currentJsonPath = path.join(fixtureRoot, "current.json");
  const baselineScreenshotPath = path.join(fixtureRoot, "baseline.png");
  const currentScreenshotPath = path.join(fixtureRoot, "current.png");

  fs.writeFileSync(baselineScreenshotPath, png);
  fs.writeFileSync(currentScreenshotPath, png);
  fs.writeFileSync(baselineJsonPath, JSON.stringify({
    name: "landing-home",
    title: "Landing",
    bodyText: "Welcome",
    elements: [{ selector: "h1", text: "Welcome", bounds: { x: 0, y: 0, width: 1, height: 1 } }],
  }, null, 2));
  fs.writeFileSync(currentJsonPath, JSON.stringify({
    name: "landing-home",
    title: "Landing",
    bodyText: "Welcome back",
    elements: [],
  }, null, 2));

  const browseCli = await import(pathToFileURL(path.join(repoRoot, "browse", "src", "cli.ts")).href);
  const comparison = browseCli.compareSnapshotData(
    JSON.parse(fs.readFileSync(baselineJsonPath, "utf8")),
    JSON.parse(fs.readFileSync(currentJsonPath, "utf8")),
    { baselineScreenshotHash: "a", currentScreenshotHash: "b" },
  );
  const visualPack = browseCli.createSnapshotVisualPack({
    name: "landing-home",
    stamp: "fixture",
    baselineJsonPath,
    currentJsonPath,
    baselineScreenshotPath,
    currentScreenshotPath,
    comparison,
  }) as {
    dir: string;
    index: string;
    manifest: string;
    annotation?: string;
  };

  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.index)));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.manifest)));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.dir, "baseline.png")));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.dir, "current.png")));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.annotation || "")));

  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, visualPack.manifest), "utf8")) as {
    assets?: Record<string, string>;
    summary?: Record<string, number | boolean>;
  };
  const html = fs.readFileSync(path.join(fixtureRoot, visualPack.index), "utf8");

  assert.equal(manifest.assets?.baselineScreenshot, "baseline.png");
  assert.equal(manifest.assets?.currentScreenshot, "current.png");
  assert.equal(manifest.assets?.annotation, "annotation.svg");
  assert.equal(manifest.summary?.missingSelectors, 1);
  assert.match(html, /Snapshot visual pack/);
  assert.match(html, /Manifest JSON/);
  assert.match(html, /baseline\.png/);
  assert.match(html, /current\.png/);

  console.log("browse-snapshot-visual-pack spec passed");
}

try {
  await main();
} finally {
  process.chdir(repoRoot);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
