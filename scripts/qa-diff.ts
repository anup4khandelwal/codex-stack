#!/usr/bin/env bun
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface RouteCandidate {
  file: string;
  route: string;
  framework: string;
  dynamic: boolean;
  unresolvedReason: string;
  url: string;
}

export interface RouteInferenceResult {
  baseRef: string;
  changedFiles: string[];
  candidates: RouteCandidate[];
}

interface InferOptions {
  cwd?: string;
  baseRef?: string;
  baseUrl?: string;
}

const TEXT_FILE_PATTERN = /\.(tsx?|jsx?|mdx?|html)$/i;
const DYNAMIC_SEGMENT_PATTERN = /(\[[^\]]+\]|\$[A-Za-z0-9_]+|:[A-Za-z0-9_]+)/;

function cleanSubject(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePath(filePath: string): string {
  return cleanSubject(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
}

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const child = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
  return {
    ok: (child.status ?? 1) === 0,
    stdout: String(child.stdout || "").trim(),
    stderr: cleanSubject(child.stderr || ""),
  };
}

export function resolveBaseRef(cwd = process.cwd(), requested = ""): string {
  const candidates = [requested, "origin/main", "main", "origin/master", "master"].filter(Boolean);
  for (const candidate of candidates) {
    const probe = runGit(cwd, ["rev-parse", "--verify", candidate]);
    if (probe.ok) return candidate;
  }
  return cleanSubject(requested || "main");
}

export function listChangedFiles(cwd = process.cwd(), requestedBaseRef = ""): { baseRef: string; files: string[] } {
  const baseRef = resolveBaseRef(cwd, requestedBaseRef);
  const attempts = [
    ["diff", "--name-only", `${baseRef}...HEAD`],
    ["diff", "--name-only", baseRef],
  ];
  for (const args of attempts) {
    const result = runGit(cwd, args);
    if (!result.ok) continue;
    return {
      baseRef,
      files: String(result.stdout || "")
        .split(/\r?\n/)
        .map(normalizePath)
        .filter(Boolean),
    };
  }
  return { baseRef, files: [] };
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, "");
}

function trimIndexSegment(route: string): string {
  const normalized = route.replace(/\/+/g, "/");
  if (normalized === "/index") return "/";
  return normalized.replace(/\/index$/, "") || "/";
}

function routeFromSegments(segments: string[]): { route: string; dynamic: boolean; unresolvedReason: string } {
  const cleaned = segments.filter(Boolean);
  if (!cleaned.length) {
    return { route: "/", dynamic: false, unresolvedReason: "" };
  }
  const dynamic = cleaned.some((segment) => DYNAMIC_SEGMENT_PATTERN.test(segment));
  const route = trimIndexSegment(`/${cleaned.join("/")}`);
  return {
    route,
    dynamic,
    unresolvedReason: dynamic ? "dynamic-segment" : "",
  };
}

function joinBaseUrl(baseUrl: string, route: string): string {
  if (!baseUrl) return "";
  try {
    return new URL(route.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  } catch {
    return "";
  }
}

export function inferRouteCandidate(filePath: string, baseUrl = ""): RouteCandidate | null {
  const normalized = normalizePath(filePath);
  if (!TEXT_FILE_PATTERN.test(normalized)) return null;

  const segments = normalized.split("/");
  const fileName = segments[segments.length - 1] || "";
  const stem = stripExtension(fileName);

  if (/\.(spec|test)\.[^.]+$/i.test(normalized)) return null;
  if (["layout", "loading", "template", "error", "not-found", "_app", "_document", "_error"].includes(stem)) return null;
  if (segments.includes("api") || normalized.startsWith("pages/api/") || normalized.includes("/api/")) return null;

  const patterns: Array<{ prefix: string[]; framework: string; kind: "app" | "pages" | "public" | "routes" }> = [
    { prefix: ["src", "app"], framework: "next-app", kind: "app" },
    { prefix: ["app"], framework: "next-app", kind: "app" },
    { prefix: ["src", "pages"], framework: "next-pages", kind: "pages" },
    { prefix: ["pages"], framework: "next-pages", kind: "pages" },
    { prefix: ["routes"], framework: "remix", kind: "routes" },
    { prefix: ["src", "routes"], framework: "remix", kind: "routes" },
    { prefix: ["public"], framework: "static", kind: "public" },
  ];

  for (const pattern of patterns) {
    if (!pattern.prefix.every((segment, index) => segments[index] === segment)) continue;
    const relative = segments.slice(pattern.prefix.length);
    if (!relative.length) return null;

    if (pattern.kind === "app") {
      if (stem !== "page") return null;
      const result = routeFromSegments(relative.slice(0, -1));
      return {
        file: normalized,
        route: result.route,
        framework: pattern.framework,
        dynamic: result.dynamic,
        unresolvedReason: result.unresolvedReason,
        url: result.dynamic ? "" : joinBaseUrl(baseUrl, result.route),
      };
    }

    if (pattern.kind === "pages") {
      const withoutFile = relative.slice(0, -1);
      const fileSegment = stem === "index" ? [] : [stem];
      const result = routeFromSegments([...withoutFile, ...fileSegment]);
      return {
        file: normalized,
        route: result.route,
        framework: pattern.framework,
        dynamic: result.dynamic,
        unresolvedReason: result.unresolvedReason,
        url: result.dynamic ? "" : joinBaseUrl(baseUrl, result.route),
      };
    }

    if (pattern.kind === "routes") {
      const relativePath = stripExtension(relative.join("/"));
      const routeSegments = relativePath
        .split("/")
        .flatMap((segment) => segment.split("."))
        .filter((segment) => segment && segment !== "route");
      const result = routeFromSegments(routeSegments);
      return {
        file: normalized,
        route: result.route,
        framework: pattern.framework,
        dynamic: result.dynamic,
        unresolvedReason: result.unresolvedReason,
        url: result.dynamic ? "" : joinBaseUrl(baseUrl, result.route),
      };
    }

    if (pattern.kind === "public") {
      if (!/\.html$/i.test(normalized)) return null;
      const result = routeFromSegments(relative.map(stripExtension));
      return {
        file: normalized,
        route: result.route,
        framework: pattern.framework,
        dynamic: result.dynamic,
        unresolvedReason: result.unresolvedReason,
        url: result.dynamic ? "" : joinBaseUrl(baseUrl, result.route),
      };
    }
  }

  return null;
}

export function inferChangedRoutes({ cwd = process.cwd(), baseRef = "", baseUrl = "" }: InferOptions = {}): RouteInferenceResult {
  const diff = listChangedFiles(cwd, baseRef);
  const deduped = new Map<string, RouteCandidate>();
  for (const file of diff.files) {
    const candidate = inferRouteCandidate(file, baseUrl);
    if (!candidate) continue;
    const key = `${candidate.route}:${candidate.framework}:${candidate.dynamic ? "dynamic" : "static"}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return {
    baseRef: diff.baseRef,
    changedFiles: diff.files,
    candidates: [...deduped.values()].sort((a, b) => a.route.localeCompare(b.route)),
  };
}
