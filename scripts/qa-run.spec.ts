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
const decisionsDir = path.join(fixtureRoot, ".codex-stack", "baseline-decisions");

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
        capturedAt: "2025-01-01T00:00:00.000Z",
        routePath: "/login",
        device: "desktop",
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
if (command === "a11y") {
  console.log(JSON.stringify({
    url,
    finalUrl: url,
    title: "Login",
    minimumImpact: "serious",
    scopeSelectors: ["#app"],
    violationCount: 1,
    passCount: 12,
    incompleteCount: 0,
    topRules: ["color-contrast (1)"],
    violations: [
      {
        id: "color-contrast",
        impact: "serious",
        description: "Insufficient contrast",
        help: "Ensure foreground and background colors have enough contrast",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
        selectors: ["#login-button"],
        nodeCount: 1
      }
    ],
    status: "warning"
  }, null, 2));
  process.exit(0);
}
if (command === "perf") {
  console.log(JSON.stringify({
    url,
    finalUrl: url,
    title: "Login",
    waitMs: 400,
    metrics: {
      ttfb: 120,
      domContentLoaded: 450,
      loadEvent: 710,
      fcp: 360,
      lcp: 2450,
      cls: 0.19,
      jsHeapUsed: 1048576,
      resourceCount: 14,
      failedResourceCount: 2
    },
    budgets: [
      {
        metric: "lcp",
        label: "LCP",
        threshold: 2000,
        unit: "ms",
        severity: "high",
        raw: "lcp=2s",
        value: 2450,
        passed: false,
        detail: "LCP was 2450 ms which exceeds the budget of 2000 ms."
      }
    ],
    budgetViolationCount: 1,
    topViolations: ["LCP was 2450 ms which exceeds the budget of 2000 ms."],
    status: "warning"
  }, null, 2));
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
      "--a11y",
      "--a11y-scope",
      "#app",
      "--a11y-impact",
      "serious",
      "--perf",
      "--perf-budget",
      "lcp=2s",
      "--perf-wait-ms",
      "400",
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
    visualRisk?: { level?: string; score?: number; staleBaselines?: number };
    accessibility?: { enabled?: boolean; violationCount?: number; topRules?: string[]; artifactJson?: string; artifactMarkdown?: string };
    performance?: { enabled?: boolean; budgetViolationCount?: number; topViolations?: string[]; metrics?: { lcp?: number; cls?: number; failedResourceCount?: number }; artifactJson?: string; artifactMarkdown?: string };
    flowResults?: Array<{ name?: string; status?: string; steps?: number }>;
    snapshotResult?: { name?: string; status?: string; annotation?: string; screenshot?: string; baselineFreshness?: { routePath?: string; device?: string; ageDays?: number; stale?: boolean } | null; visualPack?: { index?: string; manifest?: string; diffImage?: string; imageDiff?: { score?: number } } | null };
    findings?: Array<{ severity?: string; category?: string; title?: string; evidence?: { annotation?: string } }>;
    artifacts?: { annotation?: string; visualPack?: { index?: string; manifest?: string } | null; accessibilityJson?: string; accessibilityMarkdown?: string; performanceJson?: string; performanceMarkdown?: string };
  };

  assert.equal(report.status, "critical");
  assert.equal(report.healthScore, 0);
  assert.equal(report.visualRisk?.level, "low");
  assert.ok(Number(report.visualRisk?.score || 0) > 0);
  assert.equal(report.visualRisk?.staleBaselines, 1);
  assert.equal(report.accessibility?.enabled, true);
  assert.equal(report.accessibility?.violationCount, 1);
  assert.ok(report.accessibility?.topRules?.includes("color-contrast (1)"));
  assert.equal(report.performance?.enabled, true);
  assert.equal(report.performance?.budgetViolationCount, 1);
  assert.equal(report.performance?.metrics?.lcp, 2450);
  assert.equal(report.performance?.metrics?.cls, 0.19);
  assert.equal(report.performance?.metrics?.failedResourceCount, 2);
  assert.ok(report.performance?.topViolations?.some((item) => item.includes("LCP")));
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
  assert.equal(report.snapshotResult?.baselineFreshness?.routePath, "/login");
  assert.equal(report.snapshotResult?.baselineFreshness?.device, "desktop");
  assert.equal(report.snapshotResult?.baselineFreshness?.stale, true);
  assert.ok(report.findings?.some((item) => item.severity === "critical" && item.category === "visual" && item.title === "Expected UI selectors are missing"));
  assert.ok(report.findings?.some((item) => item.severity === "medium" && item.category === "visual" && item.title === "Snapshot drift detected"));
  assert.ok(report.findings?.some((item) => item.title === "Snapshot baseline is stale"));
  assert.ok(report.findings?.some((item) => item.category === "accessibility" && item.title === "Accessibility violation: color-contrast"));
  assert.ok(report.findings?.some((item) => item.category === "performance" && item.title === "Performance budget exceeded: LCP"));
  assert.ok(report.findings?.some((item) => item.evidence?.annotation));
  assert.ok(report.artifacts?.annotation);
  assert.ok(report.artifacts?.visualPack?.index);
  assert.ok(String(report.artifacts?.accessibilityJson).includes("-a11y.json"));
  assert.ok(String(report.artifacts?.accessibilityMarkdown).includes("-a11y.md"));
  assert.ok(String(report.artifacts?.performanceJson).includes("-performance.json"));
  assert.ok(String(report.artifacts?.performanceMarkdown).includes("-performance.md"));
  assert.ok(fs.existsSync(path.join(fixtureRoot, String(report.artifacts?.annotation))));
  const imported = JSON.parse(fs.readFileSync(importMarker, "utf8")) as { sourcePath?: string; sessionFlag?: string; sessionName?: string };
  assert.equal(imported.sourcePath, bundlePath);
  assert.equal(imported.sessionFlag, "--session");
  assert.equal(imported.sessionName, "qa");

  fs.mkdirSync(decisionsDir, { recursive: true });
  fs.writeFileSync(
    path.join(decisionsDir, "approved-visual.json"),
    JSON.stringify(
      {
        version: 1,
        id: "approved-visual",
        decision: "approve-current",
        category: "visual",
        kind: "snapshot-drift",
        snapshot: "landing-home",
        routePath: "/login",
        device: "desktop",
        reason: "Intentional copy refresh",
        author: "spec",
        createdAt: "2026-03-15T00:00:00.000Z",
        findingKey: "visual|snapshot-drift|landing-home|/login|desktop||||snapshot drift detected",
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(decisionsDir, "expired-a11y.json"),
    JSON.stringify(
      {
        version: 1,
        id: "expired-a11y",
        decision: "suppress",
        category: "accessibility",
        kind: "accessibility-rule",
        snapshot: "",
        routePath: "/login",
        device: "desktop",
        ruleId: "color-contrast",
        reason: "Temporary waiver",
        author: "spec",
        createdAt: "2026-03-01T00:00:00.000Z",
        expiresAt: "2026-03-10T00:00:00.000Z",
        findingKey: "accessibility|accessibility-rule||/login|desktop|color-contrast|||color-contrast",
      },
      null,
      2,
    ),
  );

  const triagedRaw = execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "qa-run.ts"),
      "https://example.com/login",
      "--flow",
      "login-smoke",
      "--snapshot",
      "landing-home",
      "--a11y",
      "--a11y-scope",
      "#app",
      "--a11y-impact",
      "serious",
      "--perf",
      "--perf-budget",
      "lcp=2s",
      "--perf-wait-ms",
      "400",
      "--session-bundle",
      bundlePath,
      "--json",
    ],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );
  const triaged = JSON.parse(triagedRaw) as {
    decisionSummary?: {
      totalDecisions?: number;
      appliedCount?: number;
      approvedCount?: number;
      expiredCount?: number;
      unresolvedCount?: number;
    };
    appliedDecisions?: Array<{ decision?: string; file?: string }>;
    expiredDecisions?: Array<{ decision?: string; file?: string }>;
    unresolvedRegressions?: Array<{ category?: string; kind?: string }>;
    findings?: Array<{ evidence?: { decision?: string; decisionFile?: string } }>;
  };
  assert.equal(triaged.decisionSummary?.totalDecisions, 2);
  assert.equal(triaged.decisionSummary?.appliedCount, 1);
  assert.equal(triaged.decisionSummary?.approvedCount, 1);
  assert.equal(triaged.decisionSummary?.expiredCount, 1);
  assert.ok((triaged.decisionSummary?.unresolvedCount || 0) >= 1);
  assert.equal(triaged.appliedDecisions?.[0]?.decision, "approve-current");
  assert.match(String(triaged.appliedDecisions?.[0]?.file), /baseline-decisions/);
  assert.equal(triaged.expiredDecisions?.[0]?.decision, "suppress");
  assert.ok(triaged.findings?.some((item) => item.evidence?.decision === "approve-current"));
  assert.ok(triaged.unresolvedRegressions?.some((item) => item.category === "accessibility" && item.kind === "accessibility-rule"));

  console.log("qa-run spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
