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
  pages: Record<string, string>;
}

const ROUTES = ["login", "dashboard", "changes"];

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
  let output = html
    .replace(/href="\/app\.css"/g, 'href="./app.css"')
    .replace(/src="\/app\.js"/g, 'src="./app.js"');
  for (const route of ROUTES) {
    const pattern = new RegExp(`href="/${route}"`, "g");
    output = output.replace(pattern, `href="./${route}/"`);
  }
  return output;
}

function rewriteRoutePage(html: string): string {
  let output = html
    .replace(/href="\/app\.css"/g, 'href="../app.css"')
    .replace(/src="\/app\.js"/g, 'src="../app.js"');
  for (const route of ROUTES) {
    const pattern = new RegExp(`href="/${route}"`, "g");
    output = output.replace(pattern, `href="../${route}/"`);
  }
  return output;
}

export function buildPreviewSite(args: BuildPreviewArgs): BuildPreviewResult {
  cleanDir(args.out);
  copyTree(args.source, args.out, (filePath) => filePath.endsWith(".html"));

  const pages: Record<string, string> = {
    root: path.join(args.out, "index.html"),
  };

  fs.writeFileSync(pages.root, rewriteRootIndex(readRequired(path.join(args.source, "index.html"))));

  for (const route of ROUTES) {
    const targetPath = path.join(args.out, route, "index.html");
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, rewriteRoutePage(readRequired(path.join(args.source, `${route}.html`))));
    pages[route] = targetPath;
  }

  fs.writeFileSync(path.join(args.out, ".nojekyll"), "");

  return {
    source: args.source,
    out: args.out,
    pages,
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
    for (const [route, filePath] of Object.entries(result.pages)) {
      console.log(`${route}: ${filePath}`);
    }
  }
}
