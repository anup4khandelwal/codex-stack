#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";

const repoRoot = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-snapshot-pack-"));

async function main(): Promise<void> {
  process.chdir(fixtureRoot);
  const makePng = (rgba: [number, number, number, number]): Buffer => {
    const image = new PNG({ width: 2, height: 2 });
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = rgba[0];
      image.data[index + 1] = rgba[1];
      image.data[index + 2] = rgba[2];
      image.data[index + 3] = rgba[3];
    }
    return PNG.sync.write(image);
  };
  const baselineJsonPath = path.join(fixtureRoot, "baseline.json");
  const currentJsonPath = path.join(fixtureRoot, "current.json");
  const baselineScreenshotPath = path.join(fixtureRoot, "baseline.png");
  const currentScreenshotPath = path.join(fixtureRoot, "current.png");

  fs.writeFileSync(baselineScreenshotPath, makePng([10, 20, 30, 255]));
  fs.writeFileSync(currentScreenshotPath, makePng([40, 50, 60, 255]));
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
    imageDiff?: { score?: number };
  };

  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.index)));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.manifest)));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.dir, "baseline.png")));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.dir, "current.png")));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.dir, "diff.png")));
  assert.ok(fs.existsSync(path.join(fixtureRoot, visualPack.annotation || "")));

  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, visualPack.manifest), "utf8")) as {
    assets?: Record<string, string>;
    summary?: Record<string, number | boolean>;
    imageDiff?: { score?: number; diffRatio?: number; changedPixels?: number };
  };
  const html = fs.readFileSync(path.join(fixtureRoot, visualPack.index), "utf8");

  assert.equal(manifest.assets?.baselineScreenshot, "baseline.png");
  assert.equal(manifest.assets?.currentScreenshot, "current.png");
  assert.equal(manifest.assets?.annotation, "annotation.svg");
  assert.equal(manifest.assets?.diffImage, "diff.png");
  assert.equal(manifest.summary?.missingSelectors, 1);
  assert.equal(typeof manifest.imageDiff?.score, "number");
  assert.equal(typeof visualPack.imageDiff?.score, "number");
  assert.ok((manifest.imageDiff?.changedPixels || 0) > 0);
  assert.match(html, /Snapshot visual pack/);
  assert.match(html, /Image diff score/);
  assert.match(html, /Diff heatmap/);
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
