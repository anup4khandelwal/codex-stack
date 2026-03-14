#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

function usage() {
  console.log(`retro-report

Usage:
  bun scripts/retro-report.mjs [--since <range>] [--out <path>] [--json] [--json-out <path>] [--artifact-dir <path>] [--no-artifacts] [--repo <owner/name>] [--no-github] [--github-limit <n>]
`);
  process.exit(0);
}

function run(cmd, options = {}) {
  try {
    const output = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    return typeof output === "string" ? output.trim() : "";
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

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function parseArgs(argv) {
  const out = {
    since: "7 days ago",
    out: "",
    json: false,
    jsonOut: "",
    artifactDir: path.resolve(process.cwd(), ".codex-stack", "retros"),
    noArtifacts: false,
    repo: "",
    noGithub: false,
    githubLimit: 100,
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
    } else if (arg === "--repo") {
      out.repo = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--no-github") {
      out.noGithub = true;
    } else if (arg === "--github-limit") {
      out.githubLimit = Number(argv[i + 1] || out.githubLimit);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  if (!Number.isFinite(out.githubLimit) || out.githubLimit < 1) {
    out.githubLimit = 100;
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

function parseSinceDate(since) {
  const trimmed = String(since || "").trim();
  const relative = trimmed.match(/^(\d+)\s+(hour|hours|day|days|week|weeks|month|months)\s+ago$/i);
  if (relative) {
    const count = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const date = new Date();
    if (unit.startsWith("hour")) date.setHours(date.getHours() - count);
    else if (unit.startsWith("day")) date.setDate(date.getDate() - count);
    else if (unit.startsWith("week")) date.setDate(date.getDate() - (count * 7));
    else if (unit.startsWith("month")) date.setMonth(date.getMonth() - count);
    return date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferGithubRepo() {
  const remote = run("git remote get-url origin", { allowFailure: true });
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
  return match ? match[1] : "";
}

function commandExists(command) {
  return Boolean(run(`command -v ${command}`, { allowFailure: true }));
}

function splitRepo(repo) {
  const [owner, name] = String(repo || "").split("/");
  if (!owner || !name) return null;
  return { owner, name };
}

function fetchGithubAnalyticsGraphql({ repo, since, limit }) {
  const parts = splitRepo(repo);
  if (!parts) return null;

  const query = "query($owner:String!,$name:String!,$limit:Int!){repository(owner:$owner,name:$name){pullRequests(first:$limit,orderBy:{field:UPDATED_AT,direction:DESC},states:[OPEN,MERGED,CLOSED]){nodes{number state isDraft createdAt updatedAt mergedAt author{login} comments{totalCount} reviews(first:50){nodes{createdAt state author{login}}}}}}}";
  const raw = run(
    `gh api graphql -f query=${JSON.stringify(query)} -F owner=${JSON.stringify(parts.owner)} -F name=${JSON.stringify(parts.name)} -F limit=${limit}`,
    { allowFailure: true }
  );
  if (!raw) return null;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  const nodes = payload?.data?.repository?.pullRequests?.nodes;
  if (!Array.isArray(nodes)) return null;

  const cutoff = parseSinceDate(since);
  const filtered = nodes.filter((pr) => !cutoff || new Date(pr.updatedAt) >= cutoff);
  const merged = filtered.filter((pr) => Boolean(pr.mergedAt));
  const open = filtered.filter((pr) => pr.state === "OPEN");
  const closedUnmerged = filtered.filter((pr) => pr.state === "CLOSED" && !pr.mergedAt);
  const draft = filtered.filter((pr) => Boolean(pr.isDraft));
  const withReviews = filtered.filter((pr) => Array.isArray(pr.reviews?.nodes) && pr.reviews.nodes.length > 0);
  const avgTimeToMergeHours = merged.length
    ? round(merged.reduce((sum, pr) => sum + ((new Date(pr.mergedAt) - new Date(pr.createdAt)) / 36e5), 0) / merged.length)
    : 0;
  const avgConversationCount = filtered.length
    ? round(filtered.reduce((sum, pr) => sum + Number(pr.comments?.totalCount || 0) + Number(pr.reviews?.nodes?.length || 0), 0) / filtered.length)
    : 0;
  const oldestOpenAgeHours = open.length
    ? round(Math.max(...open.map((pr) => (Date.now() - new Date(pr.createdAt).getTime()) / 36e5)))
    : 0;
  const avgFirstReviewLatencyHours = withReviews.length
    ? round(withReviews.reduce((sum, pr) => {
      const sorted = [...pr.reviews.nodes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return sum + ((new Date(sorted[0].createdAt) - new Date(pr.createdAt)) / 36e5);
    }, 0) / withReviews.length)
    : 0;
  const pendingReviewCount = open.filter((pr) => (!pr.reviews?.nodes?.length) && ((Date.now() - new Date(pr.createdAt).getTime()) / 36e5 >= 24)).length;
  const avgReviewsPerPr = filtered.length
    ? round(filtered.reduce((sum, pr) => sum + Number(pr.reviews?.nodes?.length || 0), 0) / filtered.length)
    : 0;

  return {
    enabled: true,
    reason: "ok",
    source: "graphql",
    repo,
    scannedCount: filtered.length,
    mergedCount: merged.length,
    openCount: open.length,
    closedUnmergedCount: closedUnmerged.length,
    draftCount: draft.length,
    avgTimeToMergeHours,
    avgConversationCount,
    oldestOpenAgeHours,
    avgFirstReviewLatencyHours,
    pendingReviewCount,
    avgReviewsPerPr,
    topAuthors: topCounts(filtered, (pr) => pr.author?.login || "", 5),
    topReviewers: topCounts(
      filtered.flatMap((pr) => (pr.reviews?.nodes || []).map((review) => ({ reviewer: review.author?.login || "" }))),
      (item) => item.reviewer,
      5
    ),
  };
}

function fetchGithubAnalytics({ repo, since, limit }) {
  if (!repo) {
    return { enabled: false, reason: "repo-unresolved", repo: "" };
  }
  if (!commandExists("gh")) {
    return { enabled: false, reason: "gh-missing", repo };
  }

  const graphql = fetchGithubAnalyticsGraphql({ repo, since, limit });
  if (graphql) {
    return graphql;
  }

  const raw = run(`gh api repos/${repo}/pulls?state=all&per_page=${limit}&sort=updated&direction=desc`, { allowFailure: true });
  if (!raw) {
    return { enabled: false, reason: "gh-unavailable", repo };
  }

  let pulls;
  try {
    pulls = JSON.parse(raw);
  } catch {
    return { enabled: false, reason: "gh-parse-error", repo };
  }

  const cutoff = parseSinceDate(since);
  const filtered = Array.isArray(pulls)
    ? pulls.filter((pr) => !cutoff || new Date(pr.updated_at) >= cutoff)
    : [];

  const merged = filtered.filter((pr) => Boolean(pr.merged_at));
  const open = filtered.filter((pr) => pr.state === "open");
  const closedUnmerged = filtered.filter((pr) => pr.state === "closed" && !pr.merged_at);
  const draft = filtered.filter((pr) => Boolean(pr.draft));
  const avgTimeToMergeHours = merged.length
    ? round(merged.reduce((sum, pr) => sum + ((new Date(pr.merged_at) - new Date(pr.created_at)) / 36e5), 0) / merged.length)
    : 0;
  const avgConversationCount = filtered.length
    ? round(filtered.reduce((sum, pr) => sum + Number(pr.comments || 0) + Number(pr.review_comments || 0), 0) / filtered.length)
    : 0;
  const oldestOpenAgeHours = open.length
    ? round(Math.max(...open.map((pr) => (Date.now() - new Date(pr.created_at).getTime()) / 36e5)))
    : 0;

  return {
    enabled: true,
    reason: "ok",
    source: "rest",
    repo,
    scannedCount: filtered.length,
    mergedCount: merged.length,
    openCount: open.length,
    closedUnmergedCount: closedUnmerged.length,
    draftCount: draft.length,
    avgTimeToMergeHours,
    avgConversationCount,
    oldestOpenAgeHours,
    avgFirstReviewLatencyHours: 0,
    pendingReviewCount: 0,
    avgReviewsPerPr: 0,
    topAuthors: topCounts(filtered, (pr) => pr.user?.login || "", 5),
    topReviewers: [],
  };
}

function recommendation(summary) {
  if (summary.github.enabled && summary.github.pendingReviewCount >= 3) {
    return `${summary.github.pendingReviewCount} open PRs have been waiting at least 24 hours for a first review. Rebalance reviewer load before opening new work.`;
  }
  if (summary.github.enabled && summary.github.oldestOpenAgeHours >= 72) {
    return `At least one open PR has been waiting for ${summary.github.oldestOpenAgeHours} hours. Clear review debt before new work piles up.`;
  }
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
  const reviewerLines = summary.github.enabled && summary.github.topReviewers.length
    ? summary.github.topReviewers.map((item) => `- ${item.name}: ${item.count} reviews`).join("\n")
    : "- none";
  const githubSection = summary.github.enabled
    ? `## GitHub PR analytics

- Repo: ${summary.github.repo}
- Source: ${summary.github.source}
- PRs scanned: ${summary.github.scannedCount}
- Merged: ${summary.github.mergedCount}
- Open: ${summary.github.openCount}
- Closed without merge: ${summary.github.closedUnmergedCount}
- Draft: ${summary.github.draftCount}
- Avg time to merge: ${summary.github.avgTimeToMergeHours} hours
- Avg conversation count: ${summary.github.avgConversationCount}
- Avg first review latency: ${summary.github.avgFirstReviewLatencyHours} hours
- Avg reviews per PR: ${summary.github.avgReviewsPerPr}
- Pending review backlog (>24h, no reviews): ${summary.github.pendingReviewCount}
- Oldest open PR age: ${summary.github.oldestOpenAgeHours} hours
\n### Top reviewers\n\n${reviewerLines}
`
    : `## GitHub PR analytics

- Status: unavailable (${summary.github.reason})
`;

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

${githubSection}`;
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
const repo = args.repo || inferGithubRepo();
const github = args.noGithub
  ? { enabled: false, reason: "disabled", repo }
  : fetchGithubAnalytics({ repo, since: args.since, limit: args.githubLimit });

const summary = {
  since: args.since,
  commitCount: commits.length,
  mergeCommits,
  authorCount: new Set(commits.map((commit) => commit.author)).size,
  topAuthors,
  topAreas,
  recentSubjects: commits.slice(0, 10).map((commit) => ({ subject: commit.subject, author: commit.author })),
  recommendation: "",
  github,
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
