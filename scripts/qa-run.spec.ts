#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-qa-run-"));

async function main(): Promise<void> {
  const browseDir = path.join(fixtureRoot, "browse", "src");
  fs.mkdirSync(browseDir, { recursive: true });

const baselinePath = path.join(fixtureRoot, "baseline.json");
const currentPath = path.join(fixtureRoot, "current.json");
const screenshotPath = path.join(fixtureRoot, "screenshot.png");
const visualDir = path.join(fixtureRoot, "visual");
const bundlePath = path.join(fixtureRoot, "session-bundle.json");
const importMarker = path.join(fixtureRoot, "imported-session.json");

  fs.writeFileSync(
    screenshotPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        name: "landing-home",
        elements: [{ selector: "h1", bounds: { x: 0, y: 0, width: 1, height: 1 } }],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    currentPath,
    JSON.stringify(
      {
        name: "landing-home",
        elements: [],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    bundlePath,
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        session: "qa",
        metadata: {
          name: "qa",
          authenticated: true,
        },
        storageState: {
          cookies: [
            {
              name: "session",
              value: "demo",
              domain: "example.com",
              path: "/",
            },
          ],
          origins: [],
        },
        source: {
          type: "manual",
          exportedFrom: "spec",
        },
      },
      null,
      2,
    ),
  );
  fs.mkdirSync(visualDir, { recursive: true });
  fs.writeFileSync(path.join(visualDir, "index.html"), "<html><body>visual pack</body></html>");
  fs.writeFileSync(path.join(visualDir, "manifest.json"), JSON.stringify({ status: "changed", imageDiff: { score: 72.4, diffRatio: 0.276, changedPixels: 12 } }, null, 2));
  fs.writeFileSync(path.join(visualDir, "annotation.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  fs.writeFileSync(path.join(visualDir, "diff.png"), fs.readFileSync(screenshotPath));

  fs.writeFileSync(
    path.join(browseDir, "cli.ts"),
    `#!/usr/bin/env bun
import fs from "node:fs";
const [command, url, name] = process.argv.slice(2);
if (command === "import-session") {
  const [sourcePath, sessionFlag, sessionName] = process.argv.slice(3);
  fs.writeFileSync(${JSON.stringify(importMarker)}, JSON.stringify({ sourcePath, sessionFlag, sessionName }, null, 2));
  console.log(JSON.stringify({ status: "imported", sourcePath, sessionName }, null, 2));
  process.exit(0);
}
if (command === "run-flow") {
  console.log(JSON.stringify([{ action: "goto", url }, { action: "assert-text", selector: "h1" }]));
  process.exit(0);
}
if (command === "compare-snapshot") {
  console.log(JSON.stringify({
    status: "changed",
    baseline: ${JSON.stringify(baselinePath)},
    current: ${JSON.stringify(currentPath)},
    screenshot: ${JSON.stringify(screenshotPath)},
    visualPack: {
      dir: ${JSON.stringify(visualDir)},
      index: ${JSON.stringify(path.join(visualDir, "index.html"))},
      manifest: ${JSON.stringify(path.join(visualDir, "manifest.json"))},
      annotation: ${JSON.stringify(path.join(visualDir, "annotation.svg"))},
      diffImage: ${JSON.stringify(path.join(visualDir, "diff.png"))},
      imageDiff: { score: 72.4, diffRatio: 0.276, changedPixels: 12, comparedPixels: 16, dimensionsMatch: true, baseline: { width: 1, height: 1 }, current: { width: 1, height: 1 } }
    },
    comparison: {
      missingSelectors: ["h1"],
      changedSelectors: [],
      newSelectors: [],
      bodyTextChanged: true,
      titleChanged: false,
      screenshotChanged: true
    }
  }, null, 2));
  process.exit(0);
}
console.error("unexpected command", command, url, name);
process.exit(1);
`,
  );

  const raw = execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "qa-run.ts"),
      "https://example.com/login",
      "--flow",
      "login-smoke",
      "--snapshot",
      "landing-home",
      "--session-bundle",
      bundlePath,
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
    flowResults?: Array<{ name?: string; status?: string; steps?: number }>;
    snapshotResult?: { name?: string; status?: string; annotation?: string; screenshot?: string; visualPack?: { index?: string; manifest?: string; diffImage?: string; imageDiff?: { score?: number } } | null };
    findings?: Array<{ severity?: string; category?: string; title?: string; evidence?: { annotation?: string } }>;
    artifacts?: { annotation?: string; visualPack?: { index?: string; manifest?: string } | null };
  };

  assert.equal(report.status, "critical");
  assert.equal(report.healthScore, 48);
  assert.equal(report.flowResults?.[0]?.name, "login-smoke");
  assert.equal(report.flowResults?.[0]?.status, "pass");
  assert.equal(report.flowResults?.[0]?.steps, 2);
  assert.equal(report.snapshotResult?.name, "landing-home");
  assert.equal(report.snapshotResult?.status, "changed");
  assert.ok(String(report.snapshotResult?.annotation).includes(".codex-stack/qa/annotations/"));
  assert.ok(String(report.snapshotResult?.screenshot).includes("screenshot.png"));
  assert.ok(String(report.snapshotResult?.visualPack?.index).includes("visual/index.html"));
  assert.ok(String(report.snapshotResult?.visualPack?.manifest).includes("visual/manifest.json"));
  assert.ok(String(report.snapshotResult?.visualPack?.diffImage).includes("visual/diff.png"));
  assert.equal(report.snapshotResult?.visualPack?.imageDiff?.score, 72.4);
  assert.ok(report.findings?.some((item) => item.severity === "critical" && item.category === "visual" && item.title === "Expected UI selectors are missing"));
  assert.ok(report.findings?.some((item) => item.severity === "medium" && item.category === "visual" && item.title === "Snapshot drift detected"));
  assert.ok(report.findings?.some((item) => item.evidence?.annotation));
  assert.ok(report.artifacts?.annotation);
  assert.ok(report.artifacts?.visualPack?.index);
  assert.ok(fs.existsSync(path.join(fixtureRoot, String(report.artifacts?.annotation))));
  const imported = JSON.parse(fs.readFileSync(importMarker, "utf8")) as { sourcePath?: string; sessionFlag?: string; sessionName?: string };
  assert.equal(imported.sourcePath, bundlePath);
  assert.equal(imported.sessionFlag, "--session");
  assert.equal(imported.sessionName, "qa");

  console.log("qa-run spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
