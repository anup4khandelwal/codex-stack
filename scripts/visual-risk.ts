#!/usr/bin/env bun

export type VisualRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface BaselineFreshness {
  snapshot: string;
  routePath: string;
  device: string;
  capturedAt: string;
  ageDays: number;
  stale: boolean;
  staleAfterDays: number;
}

export interface VisualRiskSummary {
  available: boolean;
  score: number;
  level: VisualRiskLevel;
  summary: string;
  criticalChecks: number;
  warningChecks: number;
  consoleErrors: number;
  changedSnapshots: number;
  staleBaselines: number;
  avgImageDiffScore: number | null;
  topDrivers: string[];
}

interface VisualPathResult {
  status?: string;
  path?: string;
  device?: string;
  console?: {
    errors?: string[];
    warnings?: string[];
  };
}

interface VisualSnapshotResult {
  name?: string;
  status?: string;
  targetPath?: string;
  device?: string;
  visualPack?: {
    imageDiff?: {
      score?: number;
    } | null;
  } | null;
  baselineFreshness?: BaselineFreshness | null;
}

interface VisualRiskInput {
  pathResults?: VisualPathResult[];
  snapshotResults?: VisualSnapshotResult[];
}

export const DEFAULT_STALE_BASELINE_DAYS = 30;

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function computeBaselineFreshness({
  snapshot,
  routePath,
  device,
  capturedAt,
  staleAfterDays = DEFAULT_STALE_BASELINE_DAYS,
  now = new Date(),
}: {
  snapshot: string;
  routePath?: string;
  device?: string;
  capturedAt?: string;
  staleAfterDays?: number;
  now?: Date;
}): BaselineFreshness | null {
  const captured = cleanSubject(capturedAt);
  if (!captured) return null;
  const capturedMillis = Date.parse(captured);
  if (!Number.isFinite(capturedMillis)) return null;
  const ageDays = round((now.getTime() - capturedMillis) / 86_400_000);
  const threshold = staleAfterDays > 0 ? staleAfterDays : DEFAULT_STALE_BASELINE_DAYS;
  return {
    snapshot: cleanSubject(snapshot || "snapshot") || "snapshot",
    routePath: cleanSubject(routePath || "/") || "/",
    device: cleanSubject(device || "desktop") || "desktop",
    capturedAt: new Date(capturedMillis).toISOString(),
    ageDays: Math.max(0, ageDays),
    stale: ageDays >= threshold,
    staleAfterDays: threshold,
  };
}

function buildDrivers(parts: Array<{ label: string; weight: number }>): string[] {
  return parts
    .filter((item) => item.weight > 0)
    .sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label))
    .slice(0, 4)
    .map((item) => item.label);
}

export function computeVisualRisk({ pathResults = [], snapshotResults = [] }: VisualRiskInput): VisualRiskSummary {
  const criticalChecks = pathResults.filter((item) => ["critical", "error"].includes(cleanSubject(item.status).toLowerCase())).length;
  const warningChecks = pathResults.filter((item) => cleanSubject(item.status).toLowerCase() === "warning").length;
  const consoleErrors = pathResults.reduce((count, item) => (
    count + (Array.isArray(item.console?.errors) ? item.console?.errors.length : 0)
  ), 0);
  const changedSnapshots = snapshotResults.filter((item) => {
    const status = cleanSubject(item.status).toLowerCase();
    return Boolean(status) && !["pass", "match", "ok"].includes(status);
  }).length;
  const staleBaselines = snapshotResults.filter((item) => item.baselineFreshness?.stale).length;
  const imageScores = snapshotResults
    .map((item) => item.visualPack?.imageDiff?.score)
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  const avgImageDiffScore = imageScores.length
    ? round(imageScores.reduce((sum, item) => sum + item, 0) / imageScores.length)
    : null;

  const score = Math.min(
    100,
    round(
      (criticalChecks * 30)
      + (warningChecks * 12)
      + (Math.min(consoleErrors, 5) * 6)
      + (changedSnapshots * 8)
      + (staleBaselines * 6)
      + (avgImageDiffScore === null ? 0 : Math.max(0, 100 - avgImageDiffScore) * 0.35),
    ),
  );

  let level: VisualRiskLevel = "none";
  if (criticalChecks > 0 || score >= 80) level = "critical";
  else if (score >= 55) level = "high";
  else if (score >= 25) level = "medium";
  else if (score > 0) level = "low";

  const topDrivers = buildDrivers([
    { label: `${criticalChecks} critical page/device check${criticalChecks === 1 ? "" : "s"}`, weight: criticalChecks * 30 },
    { label: `${warningChecks} warning page/device check${warningChecks === 1 ? "" : "s"}`, weight: warningChecks * 12 },
    { label: `${consoleErrors} console error${consoleErrors === 1 ? "" : "s"}`, weight: Math.min(consoleErrors, 5) * 6 },
    { label: `${changedSnapshots} changed snapshot${changedSnapshots === 1 ? "" : "s"}`, weight: changedSnapshots * 8 },
    { label: `${staleBaselines} stale baseline${staleBaselines === 1 ? "" : "s"}`, weight: staleBaselines * 6 },
    { label: `avg image diff score ${avgImageDiffScore}`, weight: avgImageDiffScore === null ? 0 : Math.max(0, 100 - avgImageDiffScore) * 0.35 },
  ]);

  const available = Boolean(pathResults.length || snapshotResults.length);
  const summary = !available
    ? "No visual evidence collected yet."
    : level === "none"
      ? "Visual checks are clean."
      : `${level.toUpperCase()} visual risk (${score}/100): ${topDrivers.join("; ") || "review the visual evidence."}`;

  return {
    available,
    score,
    level,
    summary,
    criticalChecks,
    warningChecks,
    consoleErrors,
    changedSnapshots,
    staleBaselines,
    avgImageDiffScore,
    topDrivers,
  };
}
