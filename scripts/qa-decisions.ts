#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

export type QaDecisionCategory = "visual" | "accessibility" | "performance";
export type QaDecisionType = "approve-current" | "suppress" | "refresh-required";
export type QaDecisionKind = "snapshot-drift" | "missing-selectors" | "stale-baseline" | "accessibility-rule" | "performance-budget";

export interface QaDecisionRecord {
  version: 1;
  id: string;
  decision: QaDecisionType;
  category: QaDecisionCategory;
  kind: QaDecisionKind;
  snapshot: string;
  routePath: string;
  device: string;
  reason: string;
  author: string;
  createdAt: string;
  reviewAfter?: string;
  expiresAt?: string;
  selectors?: string[];
  ruleId?: string;
  metric?: string;
  title?: string;
  findingKey?: string;
  file: string;
}

export interface QaDecisionInput {
  decision: QaDecisionType;
  category: QaDecisionCategory;
  kind: QaDecisionKind;
  snapshot?: string;
  routePath?: string;
  device?: string;
  reason: string;
  author?: string;
  createdAt?: string;
  reviewAfter?: string;
  expiresAt?: string;
  selectors?: string[];
  ruleId?: string;
  metric?: string;
  title?: string;
}

export interface QaDecisionFilters {
  category?: QaDecisionCategory;
  kind?: QaDecisionKind;
  snapshot?: string;
  routePath?: string;
  device?: string;
  activeOnly?: boolean;
}

export interface QaDecisionTarget {
  category: QaDecisionCategory;
  kind: QaDecisionKind;
  snapshot: string;
  routePath: string;
  device: string;
  selectors?: string[];
  ruleId?: string;
  metric?: string;
  title?: string;
  findingKey?: string;
}

export function decisionsDir(cwd = process.cwd()): string {
  return path.resolve(cwd, ".codex-stack", "baseline-decisions");
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return cleanSubject(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "decision";
}

function normalizeRoutePath(value: string): string {
  const cleaned = cleanSubject(value || "/");
  if (!cleaned || cleaned === "/") return "/";
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

function normalizeSelectors(value: string[] | undefined): string[] {
  return [...new Set((value || []).map((item) => cleanSubject(item)).filter(Boolean))].sort();
}

function parseIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ISO date: ${JSON.stringify(value)}`);
  }
  return new Date(parsed).toISOString();
}

function safeGit(cmd: string): string {
  try {
    return String(execSync(cmd, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }) || "").trim();
  } catch {
    return "";
  }
}

export function defaultAuthor(): string {
  return cleanSubject(
    process.env.GIT_AUTHOR_NAME
      || process.env.GITHUB_ACTOR
      || process.env.USER
      || process.env.LOGNAME
      || safeGit("git config user.name"),
  ) || "unknown";
}

export function buildFindingKey(target: Omit<QaDecisionTarget, "findingKey">): string {
  return [
    target.category,
    target.kind,
    cleanSubject(target.snapshot),
    normalizeRoutePath(target.routePath),
    cleanSubject(target.device).toLowerCase() || "desktop",
    cleanSubject(target.ruleId),
    cleanSubject(target.metric),
    normalizeSelectors(target.selectors).join("+"),
    cleanSubject(target.title).toLowerCase(),
  ].join("|");
}

export function buildDecisionRecord(input: QaDecisionInput, cwd = process.cwd()): QaDecisionRecord {
  const createdAt = parseIsoDate(input.createdAt) || new Date().toISOString();
  const routePath = normalizeRoutePath(input.routePath || "/");
  const device = cleanSubject(input.device || "desktop").toLowerCase() || "desktop";
  const snapshot = cleanSubject(input.snapshot);
  const selectors = normalizeSelectors(input.selectors);
  const category = input.category;
  const kind = input.kind;
  const ruleId = cleanSubject(input.ruleId);
  const metric = cleanSubject(input.metric).toLowerCase();
  const title = cleanSubject(input.title);
  const findingKey = buildFindingKey({
    category,
    kind,
    snapshot,
    routePath,
    device,
    selectors,
    ruleId,
    metric,
    title,
  });
  const id = `${createdAt.replace(/[:.]/g, "-")}-${slugify(`${input.decision}-${category}-${kind}-${snapshot || routePath}-${device}`)}`;
  return {
    version: 1,
    id,
    decision: input.decision,
    category,
    kind,
    snapshot,
    routePath,
    device,
    reason: cleanSubject(input.reason),
    author: cleanSubject(input.author || defaultAuthor()),
    createdAt,
    reviewAfter: parseIsoDate(input.reviewAfter),
    expiresAt: parseIsoDate(input.expiresAt),
    selectors,
    ruleId,
    metric,
    title,
    findingKey,
    file: relativeDecisionPath(path.join(decisionsDir(cwd), `${id}.json`), cwd),
  };
}

export function relativeDecisionPath(filePath: string, cwd = process.cwd()): string {
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}

function normalizeRecord(raw: unknown, filePath: string, cwd = process.cwd()): QaDecisionRecord | null {
  const obj = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : null;
  if (!obj) return null;
  const decision = cleanSubject(obj.decision);
  const category = cleanSubject(obj.category);
  const kind = cleanSubject(obj.kind);
  if (
    decision !== "approve-current"
    && decision !== "suppress"
    && decision !== "refresh-required"
  ) {
    return null;
  }
  if (category !== "visual" && category !== "accessibility" && category !== "performance") {
    return null;
  }
  if (
    kind !== "snapshot-drift"
    && kind !== "missing-selectors"
    && kind !== "stale-baseline"
    && kind !== "accessibility-rule"
    && kind !== "performance-budget"
  ) {
    return null;
  }
  const snapshot = cleanSubject(obj.snapshot);
  const routePath = normalizeRoutePath(cleanSubject(obj.routePath || "/"));
  const device = cleanSubject(obj.device || "desktop").toLowerCase() || "desktop";
  const selectors = normalizeSelectors(Array.isArray(obj.selectors) ? obj.selectors.map(String) : []);
  const ruleId = cleanSubject(obj.ruleId);
  const metric = cleanSubject(obj.metric).toLowerCase();
  const title = cleanSubject(obj.title);
  const findingKey = cleanSubject(obj.findingKey) || buildFindingKey({
    category: category as QaDecisionCategory,
    kind: kind as QaDecisionKind,
    snapshot,
    routePath,
    device,
    selectors,
    ruleId,
    metric,
    title,
  });
  return {
    version: 1,
    id: cleanSubject(obj.id) || path.basename(filePath, path.extname(filePath)),
    decision: decision as QaDecisionType,
    category: category as QaDecisionCategory,
    kind: kind as QaDecisionKind,
    snapshot,
    routePath,
    device,
    reason: cleanSubject(obj.reason),
    author: cleanSubject(obj.author),
    createdAt: parseIsoDate(cleanSubject(obj.createdAt)) || new Date(0).toISOString(),
    reviewAfter: parseIsoDate(cleanSubject(obj.reviewAfter)),
    expiresAt: parseIsoDate(cleanSubject(obj.expiresAt)),
    selectors,
    ruleId,
    metric,
    title,
    findingKey,
    file: relativeDecisionPath(filePath, cwd),
  };
}

export function readDecisionRecords({ cwd = process.cwd(), filters = {} }: { cwd?: string; filters?: QaDecisionFilters } = {}): QaDecisionRecord[] {
  const root = decisionsDir(cwd);
  if (!fs.existsSync(root)) return [];
  const records = fs.readdirSync(root)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      const filePath = path.join(root, entry);
      try {
        return normalizeRecord(JSON.parse(fs.readFileSync(filePath, "utf8")), filePath, cwd);
      } catch {
        return null;
      }
    })
    .filter((item): item is QaDecisionRecord => Boolean(item));
  return filterDecisionRecords(records, filters);
}

export function filterDecisionRecords(records: QaDecisionRecord[], filters: QaDecisionFilters = {}, now = Date.now()): QaDecisionRecord[] {
  return records.filter((record) => {
    if (filters.category && record.category !== filters.category) return false;
    if (filters.kind && record.kind !== filters.kind) return false;
    if (filters.snapshot && cleanSubject(record.snapshot) !== cleanSubject(filters.snapshot)) return false;
    if (filters.routePath && normalizeRoutePath(record.routePath) !== normalizeRoutePath(filters.routePath)) return false;
    if (filters.device && cleanSubject(record.device).toLowerCase() !== cleanSubject(filters.device).toLowerCase()) return false;
    if (filters.activeOnly && isDecisionExpired(record, now)) return false;
    return true;
  }).sort((left, right) => (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0));
}

export function writeDecisionRecord(record: QaDecisionRecord, cwd = process.cwd()): QaDecisionRecord {
  const root = decisionsDir(cwd);
  ensureDir(root);
  const targetPath = path.join(root, `${record.id}.json`);
  const payload = {
    version: record.version,
    id: record.id,
    decision: record.decision,
    category: record.category,
    kind: record.kind,
    snapshot: record.snapshot,
    routePath: record.routePath,
    device: record.device,
    reason: record.reason,
    author: record.author,
    createdAt: record.createdAt,
    reviewAfter: record.reviewAfter,
    expiresAt: record.expiresAt,
    selectors: record.selectors,
    ruleId: record.ruleId,
    metric: record.metric,
    title: record.title,
    findingKey: record.findingKey,
  };
  fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2) + "\n");
  return {
    ...record,
    file: relativeDecisionPath(targetPath, cwd),
  };
}

export function removeDecisionFile(record: QaDecisionRecord, cwd = process.cwd()): boolean {
  const targetPath = path.resolve(cwd, record.file);
  if (!fs.existsSync(targetPath)) return false;
  fs.rmSync(targetPath);
  return true;
}

export function isDecisionExpired(record: QaDecisionRecord, now = Date.now()): boolean {
  if (!record.expiresAt) return false;
  const expires = Date.parse(record.expiresAt);
  return Number.isFinite(expires) && expires < now;
}

export function isDecisionExpiringSoon(record: QaDecisionRecord, now = Date.now(), withinDays = 7): boolean {
  const candidates = [record.reviewAfter, record.expiresAt]
    .map((value) => value ? Date.parse(value) : NaN)
    .filter((value) => Number.isFinite(value)) as number[];
  return candidates.some((value) => value >= now && value <= now + (withinDays * 24 * 60 * 60 * 1000));
}

function sameString(left: string, right: string): boolean {
  return cleanSubject(left) === cleanSubject(right);
}

function sameSelectorSet(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftNormalized = normalizeSelectors(left);
  const rightNormalized = normalizeSelectors(right);
  if (!leftNormalized.length && !rightNormalized.length) return true;
  if (leftNormalized.length !== rightNormalized.length) return false;
  return leftNormalized.every((value, index) => value === rightNormalized[index]);
}

export function matchDecision(record: QaDecisionRecord, target: QaDecisionTarget): boolean {
  if (record.category !== target.category) return false;
  if (record.kind !== target.kind) return false;
  if (record.findingKey && target.findingKey && record.findingKey === target.findingKey) return true;
  if (!sameString(record.snapshot, target.snapshot)) return false;
  if (!sameString(normalizeRoutePath(record.routePath), normalizeRoutePath(target.routePath))) return false;
  if (!sameString(record.device.toLowerCase(), target.device.toLowerCase())) return false;
  if (record.ruleId && !sameString(record.ruleId, target.ruleId || "")) return false;
  if (record.metric && !sameString(record.metric, target.metric || "")) return false;
  if (record.title && !sameString(record.title, target.title || "")) return false;
  if ((record.selectors || []).length && !sameSelectorSet(record.selectors, target.selectors)) return false;
  return true;
}
