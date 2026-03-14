#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export interface BuildPreviewArgs {
  source: string;
  out: string;
  json: boolean;
}

interface BuildPreviewResult {
  source: string;
  out: string;
  rootIndex: string;
  loginIndex: string;
  dashboardIndex: string;
}

function usage(): never {
  console.log(`build-preview-site

Usage:
  bun scripts/build-preview-site.ts [--source <dir>] [--out <dir>] [--json]
`);
  process.exit(0);
}

export function parseArgs(argv: string[]): BuildPreviewArgs {
  const args: BuildPreviewArgs = {
    source: path.resolve(process.cwd(), "examples", "customer-portal-demo", "public"),
    out: path.resolve(process.cwd(), ".preview-site"),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") {
      args.source = path.resolve(process.cwd(), argv[index + 1] || args.source);
      index += 1;
    } else if (arg === "--out") {
      args.out = path.resolve(process.cwd(), argv[index + 1] || args.out);
      index += 1;
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

function cleanDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function copyTree(sourceDir: string, outDir: string, shouldSkip: (filePath: string) => boolean): void {
  ensureDir(outDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(outDir, entry.name);
    if (shouldSkip(sourcePath)) continue;
    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath, shouldSkip);
    } else {
      ensureDir(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function readRequired(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required preview source file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function rewriteRootIndex(html: string): string {
  return html
    .replace(/href="\/app\.css"/g, 'href="./app.css"')
    .replace(/src="\/app\.js"/g, 'src="./app.js"')
    .replace(/href="\/login"/g, 'href="./login/"')
    .replace(/href="\/dashboard"/g, 'href="./dashboard/"');
}

function rewriteRoutePage(html: string): string {
  return html
    .replace(/href="\/app\.css"/g, 'href="../app.css"')
    .replace(/src="\/app\.js"/g, 'src="../app.js"')
    .replace(/href="\/login"/g, 'href="../login/"')
    .replace(/href="\/dashboard"/g, 'href="../dashboard/"');
}

export function buildPreviewSite(args: BuildPreviewArgs): BuildPreviewResult {
  cleanDir(args.out);

  const sourceIndex = path.join(args.source, "index.html");
  const sourceLogin = path.join(args.source, "login.html");
  const sourceDashboard = path.join(args.source, "dashboard.html");

  copyTree(args.source, args.out, (filePath) => filePath.endsWith(".html"));

  const rootIndex = path.join(args.out, "index.html");
  const loginIndex = path.join(args.out, "login", "index.html");
  const dashboardIndex = path.join(args.out, "dashboard", "index.html");

  fs.writeFileSync(rootIndex, rewriteRootIndex(readRequired(sourceIndex)));
  ensureDir(path.dirname(loginIndex));
  fs.writeFileSync(loginIndex, rewriteRoutePage(readRequired(sourceLogin)));
  ensureDir(path.dirname(dashboardIndex));
  fs.writeFileSync(dashboardIndex, rewriteRoutePage(readRequired(sourceDashboard)));
  fs.writeFileSync(path.join(args.out, ".nojekyll"), "");

  return {
    source: args.source,
    out: args.out,
    rootIndex,
    loginIndex,
    dashboardIndex,
  };
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const result = buildPreviewSite(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Preview site source: ${result.source}`);
    console.log(`Preview site output: ${result.out}`);
    console.log(`Root page: ${result.rootIndex}`);
    console.log(`Login page: ${result.loginIndex}`);
    console.log(`Dashboard page: ${result.dashboardIndex}`);
  }
}
