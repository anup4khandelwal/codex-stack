#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

interface WeeklyDigestArgs {
  since: string;
  repo: string;
  out: string;
  jsonOut: string;
  publishDir: string;
  summaryOut: string;
  slackOut: string;
  slackJsonOut: string;
  emailOut: string;
  manifestOut: string;
  noPublish: boolean;
  noGithub: boolean;
}

interface CountEntry {
  name: string;
  count: number;
}

interface RecentSubject {
  subject: string;
  author?: string;
}

interface GithubAnalytics {
  enabled: boolean;
  reason: string;
  repo: string;
  source?: "graphql" | "rest";
  scannedCount?: number;
  avgTimeToMergeHours?: number;
  avgFirstReviewLatencyHours?: number;
  pendingReviewCount?: number;
  avgReviewsPerPr?: number;
  topReviewers?: CountEntry[];
}

interface RetroSummary {
  since: string;
  commitCount: number;
  mergeCommits: number;
  authorCount: number;
  topAreas: CountEntry[];
  topAuthors: CountEntry[];
  recentSubjects: RecentSubject[];
  recommendation: string;
  github: GithubAnalytics;
}

interface PublishTargets {
  summary: string;
  slackMarkdown: string;
  slackJson: string;
  emailMarkdown: string;
  manifest: string;
}

interface SlackPlainText {
  type: "plain_text";
  text: string;
}

interface SlackMrkdwn {
  type: "mrkdwn";
  text: string;
}

interface SlackHeaderBlock {
  type: "header";
  text: SlackPlainText;
}

interface SlackContextBlock {
  type: "context";
  elements: SlackMrkdwn[];
}

interface SlackSectionBlock {
  type: "section";
  text?: SlackMrkdwn;
  fields?: SlackMrkdwn[];
}

type SlackBlock = SlackHeaderBlock | SlackContextBlock | SlackSectionBlock;

interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

const BUN_RUNTIME = process.execPath || "bun";

function usage(): never {
  console.log(`weekly-digest

Usage:
  bun scripts/weekly-digest.ts [--since <range>] [--repo <owner/name>] [--out <path>] [--json-out <path>] [--publish-dir <path>] [--summary-out <path>] [--slack-out <path>] [--slack-json-out <path>] [--email-out <path>] [--manifest-out <path>] [--no-publish] [--no-github]
`);
  process.exit(0);
}

function parseArgs(argv: string[]): WeeklyDigestArgs {
  const out: WeeklyDigestArgs = {
    since: "7 days ago",
    repo: "",
    out: path.resolve(process.cwd(), "docs", "weekly-digest.md"),
    jsonOut: path.resolve(process.cwd(), "docs", "weekly-digest.json"),
    publishDir: path.resolve(process.cwd(), "docs", "weekly-digest-publish"),
    summaryOut: "",
    slackOut: "",
    slackJsonOut: "",
    emailOut: "",
    manifestOut: "",
    noPublish: false,
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
    } else if (arg === "--publish-dir") {
      out.publishDir = path.resolve(process.cwd(), argv[i + 1] || out.publishDir);
      i += 1;
    } else if (arg === "--summary-out") {
      out.summaryOut = path.resolve(process.cwd(), argv[i + 1] || out.summaryOut);
      i += 1;
    } else if (arg === "--slack-out") {
      out.slackOut = path.resolve(process.cwd(), argv[i + 1] || out.slackOut);
      i += 1;
    } else if (arg === "--slack-json-out") {
      out.slackJsonOut = path.resolve(process.cwd(), argv[i + 1] || out.slackJsonOut);
      i += 1;
    } else if (arg === "--email-out") {
      out.emailOut = path.resolve(process.cwd(), argv[i + 1] || out.emailOut);
      i += 1;
    } else if (arg === "--manifest-out") {
      out.manifestOut = path.resolve(process.cwd(), argv[i + 1] || out.manifestOut);
      i += 1;
    } else if (arg === "--no-publish") {
      out.noPublish = true;
    } else if (arg === "--no-github") {
      out.noGithub = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }

  return out;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function relative(targetPath: string): string {
  return path.relative(process.cwd(), targetPath) || path.basename(targetPath);
}

function bullets<T>(items: T[] | undefined, emptyMessage: string, formatter: (item: T) => string): string {
  if (!items || !items.length) return `- ${emptyMessage}`;
  return items.map((item) => `- ${formatter(item)}`).join("\n");
}

function topNames<T>(
  items: T[] | undefined,
  emptyMessage: string,
  formatter: (item: T) => string,
  limit = 3
): string {
  if (!items || !items.length) return emptyMessage;
  return items.slice(0, limit).map(formatter).join(", ");
}

function repoLabel(retro: RetroSummary): string {
  return retro.github.repo || "local-repo";
}

function prHealthLines(retro: RetroSummary): string[] {
  if (!retro.github.enabled) {
    return [
      `- GitHub analytics: disabled (${retro.github.reason || "unavailable"})`,
      "- PR metrics: unavailable in this run",
    ];
  }

  return [
    `- GitHub analytics: enabled via ${retro.github.source || "unknown"}`,
    `- PRs scanned: ${retro.github.scannedCount || 0}`,
    `- Avg time to merge: ${retro.github.avgTimeToMergeHours || 0} hours`,
    `- Avg first review latency: ${retro.github.avgFirstReviewLatencyHours || 0} hours`,
    `- Pending review backlog: ${retro.github.pendingReviewCount || 0}`,
    `- Avg reviews per PR: ${retro.github.avgReviewsPerPr || 0}`,
  ];
}

function buildMarkdown(retro: RetroSummary, generatedAt: string): string {
  return `# Weekly Digest

- Repo: ${repoLabel(retro)}
- Window: ${retro.since}
- Generated: ${generatedAt}

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

${prHealthLines(retro).join("\n")}

## Reviewer load

${bullets(retro.github.topReviewers || [], "No reviewer data available.", (item) => `${item.name}: ${item.count} reviews`)}
`;
}

function buildSummaryText(retro: RetroSummary): string {
  const lines = [
    `Weekly digest for ${repoLabel(retro)} (${retro.since})`,
    `Recommendation: ${retro.recommendation}`,
    `Delivery: ${retro.commitCount} commits, ${retro.authorCount} authors, ${retro.mergeCommits} merge commits.`,
    `Hotspots: ${topNames(retro.topAreas, "none", (item) => `${item.name} (${item.count})`)}`,
    `Active authors: ${topNames(retro.topAuthors, "none", (item) => `${item.name} (${item.count})`)}`,
    `Recent work: ${topNames(retro.recentSubjects, "none", (item) => item.subject, 2)}`,
  ];

  if (retro.github.enabled) {
    lines.push(
      `PR health: ${retro.github.scannedCount || 0} PRs scanned, ${retro.github.avgTimeToMergeHours || 0}h avg merge time, ${retro.github.avgFirstReviewLatencyHours || 0}h first review latency, ${retro.github.pendingReviewCount || 0} pending without review.`,
      `Top reviewers: ${topNames(retro.github.topReviewers || [], "none", (item) => `${item.name} (${item.count})`)}`
    );
  } else {
    lines.push(`PR health: GitHub analytics disabled (${retro.github.reason || "unavailable"}).`);
  }

  return `${lines.join("\n")}\n`;
}

function buildSlackMarkdown(retro: RetroSummary): string {
  const parts = [
    `*Weekly Digest · ${repoLabel(retro)}*`,
    `Window: ${retro.since}`,
    `*Recommendation*: ${retro.recommendation}`,
    `*Delivery*: ${retro.commitCount} commits, ${retro.authorCount} authors, ${retro.mergeCommits} merge commits`,
    `*Hotspots*: ${topNames(retro.topAreas, "none", (item) => `${item.name} (${item.count})`)}`,
    `*Recent work*: ${topNames(retro.recentSubjects, "none", (item) => item.subject, 3)}`,
  ];

  if (retro.github.enabled) {
    parts.push(
      `*PR health*: ${retro.github.scannedCount || 0} scanned, ${retro.github.avgTimeToMergeHours || 0}h merge, ${retro.github.avgFirstReviewLatencyHours || 0}h first review, backlog ${retro.github.pendingReviewCount || 0}`,
      `*Top reviewers*: ${topNames(retro.github.topReviewers || [], "none", (item) => `${item.name} (${item.count})`)}`
    );
  } else {
    parts.push(`*PR health*: GitHub analytics disabled (${retro.github.reason || "unavailable"})`);
  }

  return `${parts.join("\n")}\n`;
}

function buildSlackPayload(retro: RetroSummary, generatedAt: string): SlackPayload {
  const health = retro.github.enabled
    ? `${retro.github.scannedCount || 0} PRs scanned | ${retro.github.avgTimeToMergeHours || 0}h merge | ${retro.github.avgFirstReviewLatencyHours || 0}h first review | backlog ${retro.github.pendingReviewCount || 0}`
    : `GitHub analytics disabled (${retro.github.reason || "unavailable"})`;

  return {
    text: `Weekly digest for ${repoLabel(retro)}: ${retro.recommendation}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Weekly Digest · ${repoLabel(retro)}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Window: ${retro.since} | Generated: ${generatedAt}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Recommendation*\n${retro.recommendation}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Commits*\n${retro.commitCount}` },
          { type: "mrkdwn", text: `*Authors*\n${retro.authorCount}` },
          { type: "mrkdwn", text: `*Merge commits*\n${retro.mergeCommits}` },
          { type: "mrkdwn", text: `*Hotspots*\n${topNames(retro.topAreas, "none", (item) => `${item.name} (${item.count})`)}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*PR health*\n${health}`,
        },
      },
    ],
  };
}

function buildEmailMarkdown(retro: RetroSummary, generatedAt: string): string {
  const subject = `[${repoLabel(retro)}] Weekly engineering digest`;

  return `Subject: ${subject}

# Weekly Engineering Digest

- Repo: ${repoLabel(retro)}
- Window: ${retro.since}
- Generated: ${generatedAt}

## Recommendation

${retro.recommendation}

## Delivery summary

- Commits shipped: ${retro.commitCount}
- Active authors: ${retro.authorCount}
- Merge commits: ${retro.mergeCommits}
- Top work areas: ${topNames(retro.topAreas, "none", (item) => `${item.name} (${item.count})`)}

## Recent work

${bullets(retro.recentSubjects, "No recent work found.", (item) => item.subject)}

## Review health

${prHealthLines(retro).join("\n")}

## Reviewer load

${bullets(retro.github.topReviewers || [], "No reviewer data available.", (item) => `${item.name}: ${item.count} reviews`)}
`;
}

function resolvePublishTargets(args: WeeklyDigestArgs): PublishTargets {
  return {
    summary: args.summaryOut || path.join(args.publishDir, "summary.txt"),
    slackMarkdown: args.slackOut || path.join(args.publishDir, "slack.md"),
    slackJson: args.slackJsonOut || path.join(args.publishDir, "slack.json"),
    emailMarkdown: args.emailOut || path.join(args.publishDir, "email.md"),
    manifest: args.manifestOut || path.join(args.publishDir, "manifest.json"),
  };
}

function loadRetroSummary(args: WeeklyDigestArgs): RetroSummary {
  const retroArgs = ["scripts/retro-report.ts", "--since", args.since, "--json", "--no-artifacts"];
  if (args.repo) retroArgs.push("--repo", args.repo);
  if (args.noGithub) retroArgs.push("--no-github");

  const output = execFileSync(BUN_RUNTIME, retroArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return JSON.parse(output) as RetroSummary;
}

function publishIndex(targets: PublishTargets): Record<string, string> {
  return Object.fromEntries(
    Object.entries(targets).map(([key, target]) => [key, relative(target)])
  );
}

const args = parseArgs(process.argv.slice(2));
const retro = loadRetroSummary(args);
const generatedAt = new Date().toISOString();
const markdown = buildMarkdown(retro, generatedAt);
const publishTargets = resolvePublishTargets(args);
const summaryText = buildSummaryText(retro);
const slackMarkdown = buildSlackMarkdown(retro);
const slackPayload = buildSlackPayload(retro, generatedAt);
const emailMarkdown = buildEmailMarkdown(retro, generatedAt);

writeFile(args.out, markdown);
writeFile(
  args.jsonOut,
  JSON.stringify(
    {
      generatedAt,
      repo: repoLabel(retro),
      retro,
      publish: args.noPublish
        ? { enabled: false }
        : {
            enabled: true,
            targets: publishIndex(publishTargets),
          },
    },
    null,
    2
  )
);

if (!args.noPublish) {
  writeFile(publishTargets.summary, summaryText);
  writeFile(publishTargets.slackMarkdown, slackMarkdown);
  writeFile(publishTargets.slackJson, JSON.stringify(slackPayload, null, 2));
  writeFile(publishTargets.emailMarkdown, emailMarkdown);
  writeFile(
    publishTargets.manifest,
    JSON.stringify(
      {
        generatedAt,
        repo: repoLabel(retro),
        since: retro.since,
        recommendation: retro.recommendation,
        outputs: Object.fromEntries(
          Object.entries({
            markdown: args.out,
            json: args.jsonOut,
            summary: publishTargets.summary,
            slackMarkdown: publishTargets.slackMarkdown,
            slackJson: publishTargets.slackJson,
            emailMarkdown: publishTargets.emailMarkdown,
            manifest: publishTargets.manifest,
          }).map(([key, target]) => [key, relative(target)])
        ),
      },
      null,
      2
    )
  );
}

console.log(markdown);
