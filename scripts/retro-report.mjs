#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

function usage() {
  console.log(`retro-report

Usage:
  node scripts/retro-report.mjs [--since <range>] [--out <path>] [--json] [--json-out <path>] [--artifact-dir <path>] [--no-artifacts]
`);
  process.exit(0);
}

function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    const stderr = error.stderr ? String(error.stderr) : "";
    throw new Error(stderr || error.message);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetPath, content) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
}

function parseArgs(argv) {
  const out = {
    since: "7 days ago",
    out: "",
    json: false,
    jsonOut: "",
    artifactDir: path.resolve(process.cwd(), ".codex-stack", "retros"),
    noArtifacts: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--since") {
      out.since = argv[i + 1] || out.since;
      i += 1;
    } else if (arg === "--out") {
      out.out = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--json") {
      out.json = true;
    } else if (arg === "--json-out") {
      out.jsonOut = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--artifact-dir") {
      out.artifactDir = path.resolve(process.cwd(), argv[i + 1] || out.artifactDir);
      i += 1;
    } else if (arg === "--no-artifacts") {
      out.noArtifacts = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  return out;
}

function bucketCommits(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const [hash, author, date, subject] = line.split("\t");
    return { hash, author, date, subject };
  });
}

function topCounts(items, selector, limit = 5) {
  const map = new Map();
  for (const item of items) {
    const key = selector(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function summarizeWorkdirs(raw) {
  const rows = raw.split(/\r?\n/).filter(Boolean);
  return topCounts(
    rows.map((row) => {
      const file = row.split("\t").at(-1) || "";
      const parts = file.split("/").filter(Boolean);
      return { group: parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0] || "root" };
    }),
    (item) => item.group,
    8
  );
}

function recommendation(summary) {
  if (summary.mergeCommits > Math.max(2, summary.commitCount / 3)) {
    return "Too much merge churn this week. Tighten branch lifetimes and reduce parallel long-lived branches.";
  }
  if (summary.topAreas[0] && summary.topAreas[0].count >= Math.max(3, Math.ceil(summary.commitCount / 2))) {
    return `A single area dominated work (${summary.topAreas[0].name}). Add a focused owner review and test hardening there next week.`;
  }
  if (summary.commitCount <= 3) {
    return "Low visible throughput. Check whether work is blocked in review, planning, or external dependencies.";
  }
  return "Delivery looked steady. Keep PRs smaller and preserve explicit review ownership to avoid hidden rework.";
}

function toMarkdown(summary) {
  const authorLines = summary.topAuthors.length
    ? summary.topAuthors.map((item) => `- ${item.name}: ${item.count} commits`).join("\n")
    : "- none";
  const areaLines = summary.topAreas.length
    ? summary.topAreas.map((item) => `- ${item.name}: ${item.count} touched files`).join("\n")
    : "- none";
  const subjectLines = summary.recentSubjects.length
    ? summary.recentSubjects.map((item) => `- ${item.subject}`).join("\n")
    : "- none";

  return `# Retro Report

- Since: ${summary.since}
- Commits: ${summary.commitCount}
- Merge commits: ${summary.mergeCommits}
- Authors: ${summary.authorCount}

## Delivery summary

- Commit count: ${summary.commitCount}
- Merge pressure: ${summary.mergeCommits}
- Top recommendation: ${summary.recommendation}

## Top authors

${authorLines}

## Hot areas

${areaLines}

## Recent work

${subjectLines}
`;
}

function writeArtifacts(summary, markdown, artifactDir) {
  ensureDir(artifactDir);
  const stamp = timestampSlug();
  const latestMarkdown = path.join(artifactDir, "latest.md");
  const latestJson = path.join(artifactDir, "latest.json");
  const snapshotMarkdown = path.join(artifactDir, `${stamp}.md`);
  const snapshotJson = path.join(artifactDir, `${stamp}.json`);

  writeFile(latestMarkdown, markdown);
  writeFile(latestJson, JSON.stringify(summary, null, 2));
  writeFile(snapshotMarkdown, markdown);
  writeFile(snapshotJson, JSON.stringify(summary, null, 2));

  return {
    latestMarkdown,
    latestJson,
    snapshotMarkdown,
    snapshotJson,
  };
}

const args = parseArgs(process.argv.slice(2));
const logRaw = run(`git log --since=${JSON.stringify(args.since)} --date=iso --pretty=format:%H%x09%an%x09%ad%x09%s`, { allowFailure: true });
const commits = bucketCommits(logRaw);
const numstatRaw = run(`git log --since=${JSON.stringify(args.since)} --numstat --format=''`, { allowFailure: true });
const topAreas = summarizeWorkdirs(numstatRaw);
const topAuthors = topCounts(commits, (commit) => commit.author, 5);
const mergeCommits = commits.filter((commit) => /^merge\b/i.test(commit.subject)).length;

const summary = {
  since: args.since,
  commitCount: commits.length,
  mergeCommits,
  authorCount: new Set(commits.map((commit) => commit.author)).size,
  topAuthors,
  topAreas,
  recentSubjects: commits.slice(0, 10).map((commit) => ({ subject: commit.subject, author: commit.author })),
  recommendation: "",
  artifacts: {},
};
summary.recommendation = recommendation(summary);

const markdown = toMarkdown(summary);

if (!args.noArtifacts) {
  summary.artifacts = writeArtifacts(summary, markdown, args.artifactDir);
}

if (args.out) {
  writeFile(args.out, markdown);
}

if (args.jsonOut) {
  writeFile(args.jsonOut, JSON.stringify(summary, null, 2));
}

if (args.json) console.log(JSON.stringify(summary, null, 2));
else console.log(markdown);
