#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export interface VisualSnapshotRegression {
  name: string;
  status: string;
  targetPath: string;
  device: string;
  score: number;
  diffRatio: number;
  manifestPath: string;
}

export interface VisualAnalytics {
  available: boolean;
  manifestCount: number;
  snapshotCount: number;
  failingSnapshotCount: number;
  avgImageDiffScore: number;
  avgImageDiffRatio: number;
  topRegressions: VisualSnapshotRegression[];
  rootsScanned: string[];
}

interface SnapshotManifest {
  name?: string;
  status?: string;
  imageDiff?: {
    score?: number;
    diffRatio?: number;
  };
}

interface DeployVisualManifest {
  snapshots?: Array<{
    name?: string;
    status?: string;
    targetPath?: string;
    device?: string;
    imageDiffScore?: number | null;
    imageDiffRatio?: number | null;
  }>;
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function walk(dirPath: string, out: string[]): void {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const target = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walk(target, out);
    else if (entry.isFile() && entry.name === "manifest.json") out.push(target);
  }
}

export function collectVisualAnalytics(roots = [
  path.resolve(process.cwd(), "docs", "qa"),
  path.resolve(process.cwd(), ".codex-stack", "qa"),
  path.resolve(process.cwd(), ".codex-stack", "browse", "artifacts"),
]): VisualAnalytics {
  const manifests: string[] = [];
  for (const root of roots) {
    walk(root, manifests);
  }

  const regressions: VisualSnapshotRegression[] = [];

  for (const manifestPath of manifests) {
    let parsed: SnapshotManifest | DeployVisualManifest | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SnapshotManifest | DeployVisualManifest;
    } catch {
      parsed = null;
    }
    if (!parsed) continue;

    if (Array.isArray((parsed as DeployVisualManifest).snapshots)) {
      for (const item of (parsed as DeployVisualManifest).snapshots || []) {
        if (typeof item?.imageDiffScore !== "number") continue;
        regressions.push({
          name: cleanSubject(item.name || "snapshot"),
          status: cleanSubject(item.status || "unknown"),
          targetPath: cleanSubject(item.targetPath || "/"),
          device: cleanSubject(item.device || "desktop"),
          score: Number(item.imageDiffScore || 0),
          diffRatio: Number(item.imageDiffRatio || 0),
          manifestPath: path.relative(process.cwd(), manifestPath),
        });
      }
      continue;
    }

    if (manifestPath.includes(`${path.sep}visual${path.sep}snapshots${path.sep}`)) {
      continue;
    }

    const snapshot = parsed as SnapshotManifest;
    if (typeof snapshot.imageDiff?.score !== "number") continue;
    regressions.push({
      name: cleanSubject(snapshot.name || "snapshot"),
      status: cleanSubject(snapshot.status || "unknown"),
      targetPath: "/",
      device: "desktop",
      score: Number(snapshot.imageDiff.score || 0),
      diffRatio: Number(snapshot.imageDiff.diffRatio || 0),
      manifestPath: path.relative(process.cwd(), manifestPath),
    });
  }

  const scored = regressions.filter((item) => Number.isFinite(item.score));
  return {
    available: scored.length > 0,
    manifestCount: manifests.length,
    snapshotCount: scored.length,
    failingSnapshotCount: scored.filter((item) => item.status !== "match" && item.status !== "pass").length,
    avgImageDiffScore: scored.length ? round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length) : 0,
    avgImageDiffRatio: scored.length ? round(scored.reduce((sum, item) => sum + item.diffRatio, 0) / scored.length) : 0,
    topRegressions: [...scored]
      .sort((left, right) => left.score - right.score || right.diffRatio - left.diffRatio || left.name.localeCompare(right.name))
      .slice(0, 5),
    rootsScanned: roots.map((item) => path.relative(process.cwd(), item)),
  };
}
