import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeSessionBundle, type BrowserSessionBundle } from "./session-bundle.ts";

type PlaywrightModule = any;

type SupportedBrowser = "chrome" | "arc" | "brave" | "edge";

interface BrowserProfileSpec {
  browser: SupportedBrowser;
  displayName: string;
  executablePath: string;
  userDataDir: string;
  defaultProfile: string;
}

interface ImportBrowserCookiesOptions {
  browser: string;
  profile: string;
  session: string;
}

interface BrowserProfileImportResult {
  bundle: BrowserSessionBundle;
  browser: SupportedBrowser;
  profile: string;
}

interface ImportedOriginState {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
  sessionStorage: Array<{ name: string; value: string }>;
}

const CACHE_DIR_NAMES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "ShaderCache",
  "DawnCache",
  "Crashpad",
  "GrShaderCache",
  "GraphiteDawnCache",
]);

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeBrowserName(value: string): SupportedBrowser {
  const normalized = cleanSubject(value).toLowerCase();
  if (normalized === "chrome" || normalized === "arc" || normalized === "brave" || normalized === "edge") {
    return normalized;
  }
  throw new Error(`Unsupported browser: ${JSON.stringify(value)}. Use chrome, arc, brave, or edge.`);
}

export function browserProfileSpec(browser: string, platform = process.platform, homeDir = os.homedir()): BrowserProfileSpec {
  if (platform !== "darwin") {
    throw new Error("`browse import-browser-cookies` currently supports macOS only. Use `browse import-cookies <json>` or `browse import-session <file>` on other platforms.");
  }

  const browserName = normalizeBrowserName(browser);
  const supportRoot = path.join(homeDir, "Library", "Application Support");
  if (browserName === "chrome") {
    return {
      browser: browserName,
      displayName: "Google Chrome",
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      userDataDir: path.join(supportRoot, "Google", "Chrome"),
      defaultProfile: "Default",
    };
  }
  if (browserName === "arc") {
    return {
      browser: browserName,
      displayName: "Arc",
      executablePath: "/Applications/Arc.app/Contents/MacOS/Arc",
      userDataDir: path.join(supportRoot, "Arc", "User Data"),
      defaultProfile: "Default",
    };
  }
  if (browserName === "brave") {
    return {
      browser: browserName,
      displayName: "Brave Browser",
      executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      userDataDir: path.join(supportRoot, "BraveSoftware", "Brave-Browser"),
      defaultProfile: "Default",
    };
  }
  return {
    browser: browserName,
    displayName: "Microsoft Edge",
    executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    userDataDir: path.join(supportRoot, "Microsoft Edge"),
    defaultProfile: "Default",
  };
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

function shouldCopyEntry(sourceRoot: string, sourcePath: string): boolean {
  const relativePath = path.relative(sourceRoot, sourcePath);
  if (!relativePath || relativePath === ".") return true;
  const parts = relativePath.split(path.sep).filter(Boolean);
  return !parts.some((part) => CACHE_DIR_NAMES.has(part));
}

function copyUserDataDir(sourceRoot: string): string {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browser-profile-"));
  const copiedRoot = path.join(targetRoot, path.basename(sourceRoot));
  fs.cpSync(sourceRoot, copiedRoot, {
    recursive: true,
    force: true,
    filter: (sourcePath: string) => shouldCopyEntry(sourceRoot, sourcePath),
  });
  return copiedRoot;
}

function buildStorageOrigins(storageState: { origins?: Array<{ origin?: string; localStorage?: Array<{ name?: string; value?: string }> }> }): ImportedOriginState[] {
  if (!Array.isArray(storageState.origins)) return [];
  const origins: ImportedOriginState[] = [];
  for (const entry of storageState.origins) {
    const origin = cleanSubject(entry?.origin || "");
    if (!origin) continue;
    origins.push({
      origin,
      localStorage: Array.isArray(entry?.localStorage)
        ? entry.localStorage
            .map((item) => ({
              name: cleanSubject(item?.name || ""),
              value: typeof item?.value === "string" ? item.value : "",
            }))
            .filter((item) => item.name)
        : [],
      sessionStorage: [],
    });
  }
  return origins;
}

export async function importBrowserCookies(options: ImportBrowserCookiesOptions): Promise<BrowserProfileImportResult> {
  const spec = browserProfileSpec(options.browser);
  const profile = cleanSubject(options.profile) || spec.defaultProfile;

  if (!fs.existsSync(spec.executablePath)) {
    throw new Error(`${spec.displayName} is not installed at ${spec.executablePath}. Install it or use \`browse import-session\` with an exported bundle instead.`);
  }
  if (!fs.existsSync(spec.userDataDir)) {
    throw new Error(`${spec.displayName} user data was not found at ${spec.userDataDir}. Sign in with the browser first or use \`browse import-session\`.`);
  }
  if (!fs.existsSync(path.join(spec.userDataDir, profile))) {
    throw new Error(`Profile ${JSON.stringify(profile)} was not found under ${spec.userDataDir}. Pass --profile <name> or use \`browse import-session\`.`);
  }

  const playwright = await loadPlaywright();
  if (!playwright) {
    throw new Error("Playwright is not installed. Run `bun install` and `bunx playwright install chromium`.");
  }

  const copiedUserDataDir = copyUserDataDir(spec.userDataDir);
  let context: any;
  try {
    context = await playwright.chromium.launchPersistentContext(copiedUserDataDir, {
      headless: true,
      executablePath: spec.executablePath,
      args: [`--profile-directory=${profile}`],
    });
    const storageState = await context.storageState();
    const bundle = normalizeSessionBundle(
      {
        exportedAt: new Date().toISOString(),
        session: cleanSubject(options.session) || "default",
        metadata: {
          name: cleanSubject(options.session) || "default",
          updatedAt: new Date().toISOString(),
          lastCommand: "import-browser-cookies",
          authenticated: Array.isArray(storageState.cookies) && storageState.cookies.length > 0,
          output: `${spec.browser}:${profile}`,
        },
        storageState: {
          cookies: Array.isArray(storageState.cookies) ? storageState.cookies : [],
          origins: buildStorageOrigins(storageState),
        },
        source: {
          type: "manual",
          profileDir: path.join(spec.userDataDir, profile),
          exportedFrom: `${spec.browser}:${profile}`,
        },
      },
      cleanSubject(options.session) || "default",
    );
    return {
      bundle,
      browser: spec.browser,
      profile,
    };
  } catch (error: unknown) {
    const message = cleanSubject(error instanceof Error ? error.message : String(error));
    if (/Opening in existing browser session|locked|SingletonLock|SingletonCookie/i.test(message)) {
      throw new Error(`Unable to read ${spec.displayName} profile ${JSON.stringify(profile)} while the browser is active. Close the browser and retry, or export/import a session bundle manually.`);
    }
    throw new Error(message || `Unable to read cookies from ${spec.displayName}.`);
  } finally {
    if (context) {
      try {
        await context.close();
      } catch {
        // Best effort cleanup.
      }
    }
    fs.rmSync(path.dirname(copiedUserDataDir), { recursive: true, force: true });
  }
}
