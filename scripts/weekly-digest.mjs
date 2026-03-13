#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

function usage() {
  console.log(`weekly-digest

Usage:
  node scripts/weekly-digest.mjs [--since <range>] [--repo <owner/name>] [--out <path>] [--json-out <path>] [--no-github]
`);
  process.exit(0);
}

function parseArgs(argv) {
  const out = {
    since: "7 days ago",
    repo: "",
    out: path.resolve(process.cwd(), "docs", "weekly-digest.md"),
    jsonOut: path.resolve(process.cwd(), "docs", "weekly-digest.json"),
    noGithub: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--since") {
      out.since = argv[i + 1] || out.since;
      i += 1;
    } else if (arg === "--repo") {
      out.repo = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--out") {
      out.out = path.resolve(process.cwd(), argv[i + 1] || out.out);
      i += 1;
    } else if (arg === "--json-out") {
      out.jsonOut = path.resolve(process.cwd(), argv[i + 1] || out.jsonOut);
      i += 1;
    } else if (arg === "--no-github") {
      out.noGithub = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  return out;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function bullets(items, emptyMessage, formatter) {
  if (!items || !items.length) return `- ${emptyMessage}`;
  return items.map((item) => `- ${formatter(item)}`).join("\n");
}

const args = parseArgs(process.argv.slice(2));
const retroArgs = [
  "scripts/retro-report.mjs",
  "--since",
  args.since,
  "--json",
  "--no-artifacts",
];
if (args.repo) {
  retroArgs.push("--repo", args.repo);
}
if (args.noGithub) {
  retroArgs.push("--no-github");
}

const retro = JSON.parse(execFileSync("node", retroArgs, {
  cwd: process.cwd(),
  encoding: "utf8",
}));

const markdown = `# Weekly Digest

- Window: ${retro.since}
- Generated: ${new Date().toISOString()}

## Executive summary

- Recommendation: ${retro.recommendation}
- Commits shipped: ${retro.commitCount}
- Merge commits: ${retro.mergeCommits}
- Active authors: ${retro.authorCount}

## Delivery hotspots

${bullets(retro.topAreas, "No dominant work areas.", (item) => `${item.name}: ${item.count} touched files`)}

## Team activity

${bullets(retro.topAuthors, "No author activity found.", (item) => `${item.name}: ${item.count} commits`)}

## Recent work shipped

${bullets(retro.recentSubjects, "No recent work found.", (item) => item.subject)}

## PR health

- GitHub analytics: ${retro.github.enabled ? `enabled via ${retro.github.source}` : `disabled (${retro.github.reason})`}
- PRs scanned: ${retro.github.scannedCount || 0}
- Avg time to merge: ${retro.github.avgTimeToMergeHours || 0} hours
- Avg first review latency: ${retro.github.avgFirstReviewLatencyHours || 0} hours
- Pending review backlog: ${retro.github.pendingReviewCount || 0}
- Avg reviews per PR: ${retro.github.avgReviewsPerPr || 0}

## Reviewer load

${bullets(retro.github.topReviewers || [], "No reviewer data available.", (item) => `${item.name}: ${item.count} reviews`)}
`;

writeFile(args.out, markdown);
writeFile(args.jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), retro }, null, 2));

console.log(markdown);
