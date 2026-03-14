import fs from "node:fs";
import path from "node:path";

export interface SessionStorageEntry {
  name: string;
  value: string;
}

export interface SessionOriginState {
  origin: string;
  localStorage: SessionStorageEntry[];
  sessionStorage: SessionStorageEntry[];
}

export interface SessionMetadata {
  name?: string;
  updatedAt?: string;
  lastCommand?: string;
  lastUrl?: string;
  output?: string;
  authenticated?: boolean;
  lastFlow?: string;
}

export interface BrowserSessionBundle {
  version: 1;
  exportedAt: string;
  session: string;
  metadata: SessionMetadata;
  storageState: {
    cookies: Array<Record<string, unknown>>;
    origins: SessionOriginState[];
  };
  source: {
    type: "playwright-persistent-context" | "manual";
    profileDir?: string;
    exportedFrom?: string;
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeStorageEntry(value: unknown): SessionStorageEntry | null {
  const item = asObject(value);
  if (!item) return null;
  const name = asString(item.name);
  if (!name) return null;
  return {
    name,
    value: asString(item.value),
  };
}

function normalizeOriginState(value: unknown): SessionOriginState | null {
  const item = asObject(value);
  if (!item) return null;
  const origin = asString(item.origin);
  if (!origin) return null;
  return {
    origin,
    localStorage: Array.isArray(item.localStorage) ? item.localStorage.map(normalizeStorageEntry).filter((entry): entry is SessionStorageEntry => Boolean(entry)) : [],
    sessionStorage: Array.isArray(item.sessionStorage) ? item.sessionStorage.map(normalizeStorageEntry).filter((entry): entry is SessionStorageEntry => Boolean(entry)) : [],
  };
}

function normalizeCookie(value: unknown): Record<string, unknown> | null {
  const item = asObject(value);
  return item && asString(item.name) ? item : null;
}

export function normalizeSessionBundle(input: unknown, fallbackSession = "default"): BrowserSessionBundle {
  const arrayInput = Array.isArray(input) ? input : null;
  const root = asObject(input) || {};
  const rawStorageState = asObject(root.storageState) || {};
  const cookieArray = arrayInput
    ? arrayInput
    : Array.isArray(rawStorageState.cookies)
      ? rawStorageState.cookies
      : Array.isArray(root.cookies)
        ? root.cookies
        : [];
  const originArray = Array.isArray(rawStorageState.origins)
    ? rawStorageState.origins
    : Array.isArray(root.origins)
      ? root.origins
      : [];

  return {
    version: 1,
    exportedAt: asString(root.exportedAt) || new Date().toISOString(),
    session: asString(root.session) || fallbackSession,
    metadata: {
      ...(asObject(root.metadata) || {}),
      name: asString(asObject(root.metadata)?.name) || asString(root.session) || fallbackSession,
      updatedAt: asString(asObject(root.metadata)?.updatedAt) || asString(root.exportedAt),
      lastCommand: asString(asObject(root.metadata)?.lastCommand),
      lastUrl: asString(asObject(root.metadata)?.lastUrl),
      output: asString(asObject(root.metadata)?.output),
      authenticated: Boolean(asObject(root.metadata)?.authenticated ?? cookieArray.length),
      lastFlow: asString(asObject(root.metadata)?.lastFlow),
    },
    storageState: {
      cookies: cookieArray.map(normalizeCookie).filter((item): item is Record<string, unknown> => Boolean(item)),
      origins: originArray.map(normalizeOriginState).filter((item): item is SessionOriginState => Boolean(item)),
    },
    source: {
      type: "playwright-persistent-context",
      ...(asObject(root.source) || {}),
    },
  };
}

export function readSessionBundle(filePath: string, fallbackSession = "default"): BrowserSessionBundle {
  return normalizeSessionBundle(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8")), fallbackSession);
}

export function writeSessionBundle(filePath: string, bundle: BrowserSessionBundle): string {
  const absolute = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(bundle, null, 2)}\n`);
  return absolute;
}
