#!/usr/bin/env bun
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

interface PublishArgs {
  out: string;
  demoUrl: string;
  json: boolean;
}

interface ImageDiffMetrics {
  comparedPixels: number;
  changedPixels: number;
  diffRatio: number;
  score: number;
  dimensionsMatch: boolean;
  baseline: { width: number; height: number };
  current: { width: number; height: number };
}

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT_DIR, "docs", "qa", "release-readiness-demo");
const DEFAULT_DEMO_URL = "https://anup4khandelwal.github.io/codex-stack/";
const WIDTH = 1280;
const HEIGHT = 720;

function usage(): never {
  console.log(`publish-demo-qa

Usage:
  bun scripts/publish-demo-qa.ts [--out <dir>] [--demo-url <url>] [--json]
`);
  process.exit(0);
}

function parseArgs(argv: string[]): PublishArgs {
  const args: PublishArgs = {
    out: DEFAULT_OUT,
    demoUrl: DEFAULT_DEMO_URL,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      args.out = path.resolve(process.cwd(), argv[i + 1] || "docs/qa/release-readiness-demo");
      i += 1;
    } else if (arg === "--demo-url") {
      args.demoUrl = String(argv[i + 1] || DEFAULT_DEMO_URL).trim();
      i += 1;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }

  return args;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath: string, content: string | Buffer): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function hex(value: string, alpha = 255): [number, number, number, number] {
  const clean = value.replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map((part) => `${part}${part}`).join("")
    : clean;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue, alpha];
}

function paintRect(png: PNG, x: number, y: number, width: number, height: number, color: [number, number, number, number]): void {
  const xStart = Math.max(0, Math.floor(x));
  const yStart = Math.max(0, Math.floor(y));
  const xEnd = Math.min(png.width, Math.ceil(x + width));
  const yEnd = Math.min(png.height, Math.ceil(y + height));
  for (let row = yStart; row < yEnd; row += 1) {
    for (let col = xStart; col < xEnd; col += 1) {
      const idx = (png.width * row + col) << 2;
      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = color[3];
    }
  }
}

function paintOutline(png: PNG, x: number, y: number, width: number, height: number, stroke: number, color: [number, number, number, number]): void {
  paintRect(png, x, y, width, stroke, color);
  paintRect(png, x, y + height - stroke, width, stroke, color);
  paintRect(png, x, y, stroke, height, color);
  paintRect(png, x + width - stroke, y, stroke, height, color);
}

function buildReleaseImage(variant: "baseline" | "current" | "diff"): PNG {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  paintRect(png, 0, 0, WIDTH, HEIGHT, hex("#f3eee4"));
  paintRect(png, 0, 0, WIDTH, 96, hex("#1f2321"));
  paintRect(png, 64, 126, 320, 520, hex("#efe6d7"));
  paintRect(png, 420, 126, 796, 520, hex("#fffaf0"));
  paintRect(png, 456, 162, 320, 146, hex("#ece0ce"));
  paintRect(png, 804, 162, 372, 146, hex("#ecf1e4"));
  paintRect(png, 456, 340, 720, 118, hex("#f4ede0"));
  paintRect(png, 456, 488, 352, 122, hex("#f2e5d3"));
  paintRect(png, 824, 488, 352, 122, hex("#f1e7da"));
  paintRect(png, 86, 168, 160, 18, hex("#2f332f"));
  paintRect(png, 86, 202, 232, 14, hex("#c8baa4"));
  paintRect(png, 86, 236, 232, 14, hex("#d7cab8"));
  paintRect(png, 86, 296, 200, 18, hex("#2f332f"));
  paintRect(png, 86, 334, 244, 14, hex("#c8baa4"));
  paintRect(png, 86, 368, 244, 14, hex("#d7cab8"));
  paintRect(png, 86, 428, 220, 18, hex("#2f332f"));
  paintRect(png, 86, 466, 252, 14, hex("#c8baa4"));
  paintRect(png, 86, 500, 252, 14, hex("#d7cab8"));
  paintRect(png, 86, 560, 208, 18, hex("#2f332f"));
  paintRect(png, 86, 598, 220, 14, hex("#c8baa4"));

  if (variant === "baseline") {
    paintRect(png, 456, 162, 150, 26, hex("#2f332f"));
    paintRect(png, 456, 206, 214, 16, hex("#c5b59a"));
    paintRect(png, 456, 234, 280, 14, hex("#ddd1be"));
    paintRect(png, 1036, 188, 112, 42, hex("#3b6f4f"));
    paintRect(png, 1036, 246, 94, 16, hex("#a7bda7"));
    paintRect(png, 456, 340, 244, 22, hex("#2f332f"));
    paintRect(png, 456, 382, 664, 14, hex("#c5b59a"));
    paintRect(png, 456, 410, 664, 14, hex("#ddd1be"));
    paintRect(png, 456, 438, 310, 8, hex("#3b6f4f"));
    paintRect(png, 492, 516, 176, 18, hex("#2f332f"));
    paintRect(png, 492, 550, 220, 14, hex("#c5b59a"));
    paintRect(png, 860, 516, 190, 18, hex("#2f332f"));
    paintRect(png, 860, 550, 232, 14, hex("#c5b59a"));
  } else {
    paintRect(png, 456, 162, 202, 26, hex("#2f332f"));
    paintRect(png, 456, 206, 286, 16, hex("#c5b59a"));
    paintRect(png, 456, 234, 280, 14, hex("#ddd1be"));
    paintRect(png, 980, 180, 168, 54, hex("#a74a1f"));
    paintRect(png, 980, 248, 136, 18, hex("#dcb29f"));
    paintRect(png, 456, 340, 244, 22, hex("#2f332f"));
    paintRect(png, 456, 382, 664, 14, hex("#c5b59a"));
    paintRect(png, 456, 410, 664, 14, hex("#ddd1be"));
    paintRect(png, 456, 438, 402, 8, hex("#a74a1f"));
    paintRect(png, 456, 466, 648, 50, hex("#fde0cb"));
    paintRect(png, 492, 516, 206, 18, hex("#2f332f"));
    paintRect(png, 492, 550, 246, 14, hex("#c5b59a"));
    paintRect(png, 860, 516, 228, 18, hex("#2f332f"));
    paintRect(png, 860, 550, 260, 14, hex("#c5b59a"));
  }

  if (variant === "diff") {
    paintRect(png, 0, 0, WIDTH, HEIGHT, hex("#ffffff", 255));
    paintRect(png, 972, 170, 186, 102, hex("#e14b38"));
    paintRect(png, 448, 432, 422, 96, hex("#ffb68d"));
    paintOutline(png, 972, 170, 186, 102, 6, hex("#7a1f15"));
    paintOutline(png, 448, 432, 422, 96, 6, hex("#7a1f15"));
  }

  return png;
}

function writePng(filePath: string, png: PNG): void {
  writeFile(filePath, PNG.sync.write(png));
}

function buildSnapshotDocument(kind: "baseline" | "current", screenshotPath: string): Record<string, unknown> {
  return {
    name: "release-dashboard",
    capturedAt: kind === "baseline" ? "2026-03-15T06:30:00.000Z" : "2026-03-16T09:10:00.000Z",
    url: kind === "baseline"
      ? "https://anup4khandelwal.github.io/codex-stack/pr-preview/baseline/dashboard"
      : "https://anup4khandelwal.github.io/codex-stack/pr-preview/current/dashboard",
    origin: "https://anup4khandelwal.github.io",
    routePath: "/dashboard",
    device: "desktop",
    page: { width: WIDTH, height: HEIGHT },
    screenshotPath,
    elements: [
      {
        selector: "[data-qa='release-status-card']",
        bounds: { x: 980, y: 180, width: 168, height: 54 },
      },
      {
        selector: "[data-qa='changes-approval-banner']",
        bounds: { x: 456, y: 466, width: 648, height: 50 },
      },
    ],
  };
}

function buildAnnotationSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="980" y="180" width="168" height="54" fill="rgba(225,75,56,0.18)" stroke="#7a1f15" stroke-width="4"/>
  <rect x="456" y="466" width="648" height="50" fill="rgba(255,182,141,0.18)" stroke="#7a1f15" stroke-width="4"/>
  <text x="980" y="168" font-family="monospace" font-size="20" fill="#7a1f15">release status drift</text>
  <text x="456" y="454" font-family="monospace" font-size="20" fill="#7a1f15">approval banner shifted checklist</text>
</svg>
`;
}

function buildVisualManifest(metrics: ImageDiffMetrics): Record<string, unknown> {
  return {
    name: "release-dashboard",
    status: "changed",
    summary: {
      changedSelectors: [
        "[data-qa='release-status-card']",
        "[data-qa='changes-approval-banner']",
      ],
      missingSelectors: [],
      newSelectors: [
        "[data-qa='changes-escalation-chip']",
      ],
    },
    imageDiff: metrics,
    assets: {
      baselineScreenshot: "baseline.png",
      currentScreenshot: "current.png",
      diffImage: "diff.png",
      annotation: "annotation.svg",
      baselineJson: "baseline.json",
      currentJson: "current.json",
    },
  };
}

function buildVisualIndex(metrics: ImageDiffMetrics): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Release readiness visual pack</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe6;
      --ink: #1f2321;
      --muted: #5c645d;
      --card: #fff9ef;
      --line: #d7cab8;
      --accent: #a74a1f;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Iowan Old Style", "Palatino Linotype", serif; background: var(--bg); color: var(--ink); }
    main { max-width: 1180px; margin: 0 auto; padding: 48px 24px 64px; }
    h1 { margin: 0 0 12px; font-size: 42px; }
    p { color: var(--muted); line-height: 1.55; }
    .summary, .gallery { display: grid; gap: 18px; }
    .summary { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin: 28px 0; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 18px; }
    .card strong { display: block; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
    .metric { font-size: 30px; font-weight: 700; }
    .gallery { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    figure { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    figcaption { font-weight: 700; margin-bottom: 12px; }
    img { width: 100%; border-radius: 12px; display: block; background: #fff; }
    ul { margin: 0; padding-left: 18px; }
    code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <h1>Release readiness visual pack</h1>
    <p>This pack shows the demo regression used on the public QA Pages site. It is intentionally reviewable: one release-status drift, one checklist shift, and linked machine-readable evidence.</p>
    <section class="summary">
      <article class="card"><strong>Status</strong><div class="metric">Changed</div></article>
      <article class="card"><strong>Image diff score</strong><div class="metric">${metrics.score.toFixed(1)}</div></article>
      <article class="card"><strong>Diff ratio</strong><div class="metric">${(metrics.diffRatio * 100).toFixed(1)}%</div></article>
      <article class="card"><strong>Selectors</strong><div class="metric">2 drifted</div></article>
    </section>
    <section class="gallery">
      <figure>
        <figcaption>Baseline release dashboard</figcaption>
        <img src="baseline.png" alt="Baseline release dashboard screenshot" />
      </figure>
      <figure>
        <figcaption>Current release dashboard</figcaption>
        <img src="current.png" alt="Current release dashboard screenshot" />
      </figure>
      <figure>
        <figcaption>Diff highlight</figcaption>
        <img src="diff.png" alt="Diff highlight" />
      </figure>
      <figure>
        <figcaption>Annotated review overlay</figcaption>
        <img src="annotation.svg" alt="Annotated overlay" />
      </figure>
    </section>
    <section class="card" style="margin-top: 24px;">
      <strong>Evidence</strong>
      <ul>
        <li><a href="manifest.json">Manifest JSON</a></li>
        <li><a href="baseline.json">Baseline DOM snapshot</a></li>
        <li><a href="current.json">Current DOM snapshot</a></li>
        <li><code>[data-qa='release-status-card']</code> drifted from pass to hold.</li>
        <li><code>[data-qa='changes-approval-banner']</code> introduced layout shift on the checklist.</li>
      </ul>
    </section>
  </main>
</body>
</html>
`;
}

function buildFixtureJson(tempDir: string, args: PublishArgs): string {
  const visualDir = path.join(tempDir, "visual");
  ensureDir(visualDir);

  const baselinePng = path.join(visualDir, "baseline.png");
  const currentPng = path.join(visualDir, "current.png");
  const diffPng = path.join(visualDir, "diff.png");
  const baselineJson = path.join(visualDir, "baseline.json");
  const currentJson = path.join(visualDir, "current.json");
  const annotationSvg = path.join(visualDir, "annotation.svg");
  const manifestJson = path.join(visualDir, "manifest.json");
  const indexHtml = path.join(visualDir, "index.html");
  const screenshotPng = path.join(tempDir, "release-dashboard-current.png");
  const metrics: ImageDiffMetrics = {
    comparedPixels: WIDTH * HEIGHT,
    changedPixels: 144576,
    diffRatio: 0.157,
    score: 84.3,
    dimensionsMatch: true,
    baseline: { width: WIDTH, height: HEIGHT },
    current: { width: WIDTH, height: HEIGHT },
  };

  writePng(baselinePng, buildReleaseImage("baseline"));
  writePng(currentPng, buildReleaseImage("current"));
  writePng(diffPng, buildReleaseImage("diff"));
  writePng(screenshotPng, buildReleaseImage("current"));
  writeFile(baselineJson, JSON.stringify(buildSnapshotDocument("baseline", baselinePng), null, 2));
  writeFile(currentJson, JSON.stringify(buildSnapshotDocument("current", currentPng), null, 2));
  writeFile(annotationSvg, buildAnnotationSvg());
  writeFile(manifestJson, JSON.stringify(buildVisualManifest(metrics), null, 2));
  writeFile(indexHtml, buildVisualIndex(metrics));

  const fixture = {
    url: args.demoUrl,
    snapshot: {
      name: "release-dashboard",
      result: {
        status: "changed",
        baseline: baselineJson,
        current: currentJson,
        screenshot: screenshotPng,
        visualPack: {
          dir: visualDir,
          index: indexHtml,
          manifest: manifestJson,
          annotation: annotationSvg,
          baselineJson,
          currentJson,
          baselineScreenshot: baselinePng,
          currentScreenshot: currentPng,
          diffImage: diffPng,
          imageDiff: metrics,
        },
        comparison: {
          missingSelectors: [],
          changedSelectors: [
            { selector: "[data-qa='release-status-card']" },
            { selector: "[data-qa='changes-approval-banner']" },
          ],
          newSelectors: [
            "[data-qa='changes-escalation-chip']",
          ],
          bodyTextChanged: true,
          titleChanged: false,
          screenshotChanged: true,
        },
      },
    },
    flows: [
      { name: "release-login", ok: true, steps: 6 },
      { name: "release-dashboard", ok: true, steps: 7 },
      { name: "release-changes", ok: true, steps: 6 },
    ],
    accessibility: {
      enabled: true,
      minimumImpact: "serious",
      scopeSelectors: ["main", "[data-qa='changes-approval-banner']"],
      violationCount: 2,
      passCount: 14,
      incompleteCount: 1,
      topRules: ["color-contrast", "aria-input-field-name"],
      violations: [
        {
          id: "color-contrast",
          impact: "serious",
          description: "The approval banner uses a low-contrast warning background against body text.",
          help: "Elements must meet minimum color contrast ratio thresholds",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
          selectors: ["[data-qa='changes-approval-banner']"],
          nodeCount: 1,
        },
        {
          id: "aria-input-field-name",
          impact: "moderate",
          description: "The exception note field lost its accessible label in the preview state.",
          help: "Form elements must have labels",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/aria-input-field-name",
          selectors: ["[data-qa='qa-exception-input']"],
          nodeCount: 1,
        },
      ],
    },
    performance: {
      enabled: true,
      waitMs: 1200,
      metrics: {
        ttfb: 182,
        domContentLoaded: 640,
        loadEvent: 1120,
        fcp: 710,
        lcp: 2460,
        cls: 0.14,
        jsHeapUsed: 18432000,
        resourceCount: 27,
        failedResourceCount: 0,
      },
      budgets: [
        {
          metric: "lcp",
          label: "Largest Contentful Paint",
          threshold: 2200,
          unit: "ms",
          severity: "high",
          raw: "lcp=2200",
          value: 2460,
          passed: false,
          detail: "LCP exceeded the demo budget by 260ms on the release dashboard.",
        },
        {
          metric: "cls",
          label: "Cumulative Layout Shift",
          threshold: 0.1,
          unit: "score",
          severity: "medium",
          raw: "cls=0.1",
          value: 0.14,
          passed: false,
          detail: "CLS exceeded the demo budget by 0.04 because the approval banner pushed the checklist.",
        },
      ],
      budgetViolationCount: 2,
      topViolations: [
        "Largest Contentful Paint exceeded budget",
        "Cumulative Layout Shift exceeded budget",
      ],
    },
  };

  const fixturePath = path.join(tempDir, "release-demo-qa-fixture.json");
  writeFile(fixturePath, JSON.stringify(fixture, null, 2));
  return fixturePath;
}

function runQaPublish(fixturePath: string, outputDir: string): Record<string, unknown> {
  fs.rmSync(outputDir, { recursive: true, force: true });
  ensureDir(path.dirname(outputDir));
  const command = spawnSync(process.execPath || "bun", [
    "scripts/qa-run.ts",
    "--fixture",
    fixturePath,
    "--publish-dir",
    outputDir,
    "--json",
  ], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });

  if (command.status !== 0) {
    process.stderr.write(command.stderr || command.stdout || "Failed to publish demo QA.\n");
    process.exit(command.status || 1);
  }

  return JSON.parse(String(command.stdout || "{}")) as Record<string, unknown>;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-demo-qa-"));
  try {
    const fixturePath = buildFixtureJson(tempDir, args);
    const result = runQaPublish(fixturePath, args.out);
    const summary = {
      out: path.relative(ROOT_DIR, args.out) || args.out,
      demoUrl: args.demoUrl,
      status: result.status || "unknown",
      healthScore: result.healthScore ?? null,
      visualPack: Boolean((result as { artifacts?: { published?: { visualPack?: unknown } } }).artifacts?.published?.visualPack),
    };
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Published demo QA evidence to ${summary.out}`);
      console.log(`- URL: ${summary.demoUrl}`);
      console.log(`- Status: ${summary.status}`);
      console.log(`- Health score: ${summary.healthScore}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
