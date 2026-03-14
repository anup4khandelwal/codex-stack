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
    path.join(browseDir, "cli.ts"),
    `#!/usr/bin/env bun
const [command, url, name] = process.argv.slice(2);
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
    snapshotResult?: { name?: string; status?: string; annotation?: string; screenshot?: string };
    findings?: Array<{ severity?: string; title?: string; evidence?: { annotation?: string } }>;
    artifacts?: { annotation?: string };
  };

  assert.equal(report.status, "critical");
  assert.equal(report.healthScore, 45);
  assert.equal(report.flowResults?.[0]?.name, "login-smoke");
  assert.equal(report.flowResults?.[0]?.status, "pass");
  assert.equal(report.flowResults?.[0]?.steps, 2);
  assert.equal(report.snapshotResult?.name, "landing-home");
  assert.equal(report.snapshotResult?.status, "changed");
  assert.ok(String(report.snapshotResult?.annotation).includes(".codex-stack/qa/annotations/"));
  assert.ok(String(report.snapshotResult?.screenshot).includes("screenshot.png"));
  assert.ok(report.findings?.some((item) => item.severity === "critical" && item.title === "Expected UI selectors are missing"));
  assert.ok(report.findings?.some((item) => item.evidence?.annotation));
  assert.ok(report.artifacts?.annotation);
  assert.ok(fs.existsSync(path.join(fixtureRoot, String(report.artifacts?.annotation))));

  console.log("qa-run spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
