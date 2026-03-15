export type AccessibilityImpact = "critical" | "serious" | "moderate" | "minor";
export type PerformanceMetricName =
  | "ttfb"
  | "domContentLoaded"
  | "loadEvent"
  | "fcp"
  | "lcp"
  | "cls"
  | "jsHeapUsed"
  | "resourceCount"
  | "failedResourceCount";

export interface AccessibilityViolation {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  selectors: string[];
  nodeCount: number;
}

export interface AccessibilityAuditResult {
  url: string;
  finalUrl: string;
  title: string;
  minimumImpact: AccessibilityImpact;
  scopeSelectors: string[];
  violationCount: number;
  passCount: number;
  incompleteCount: number;
  topRules: string[];
  violations: AccessibilityViolation[];
  status: "pass" | "warning";
}

export interface PerformanceBudget {
  metric: PerformanceMetricName;
  label: string;
  threshold: number;
  unit: string;
  severity: "high" | "medium";
  raw: string;
}

export interface PerformanceBudgetResult extends PerformanceBudget {
  value: number | null;
  passed: boolean;
  detail: string;
}

export interface PerformanceMetrics {
  ttfb: number | null;
  domContentLoaded: number | null;
  loadEvent: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  jsHeapUsed: number | null;
  resourceCount: number;
  failedResourceCount: number;
}

export interface PerformanceAuditResult {
  url: string;
  finalUrl: string;
  title: string;
  waitMs: number;
  metrics: PerformanceMetrics;
  budgets: PerformanceBudgetResult[];
  budgetViolationCount: number;
  topViolations: string[];
  status: "pass" | "warning";
}

interface RawAxeViolation {
  id?: string;
  impact?: string;
  description?: string;
  help?: string;
  helpUrl?: string;
  nodes?: Array<{ target?: string[] }>;
}

interface RawAxeResult {
  violations?: RawAxeViolation[];
  passes?: unknown[];
  incomplete?: unknown[];
}

interface RawPerfResult {
  finalUrl?: string;
  title?: string;
  ttfb?: number | null;
  domContentLoaded?: number | null;
  loadEvent?: number | null;
  fcp?: number | null;
  lcp?: number | null;
  cls?: number | null;
  jsHeapUsed?: number | null;
  resourceCount?: number;
}

interface PlaywrightPage {
  addScriptTag(options: { content: string }): Promise<unknown>;
  addInitScript?(script: () => void): Promise<unknown>;
  evaluateOnNewDocument?(script: () => void): Promise<unknown>;
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<unknown>;
  on(event: string, listener: (...args: any[]) => unknown): void;
  evaluate<TResult>(pageFunction: () => TResult): Promise<TResult>;
  evaluate<TArg, TResult>(pageFunction: (arg: TArg) => TResult, arg: TArg): Promise<TResult>;
}

const IMPACT_ORDER: AccessibilityImpact[] = ["minor", "moderate", "serious", "critical"];

function cleanSubject(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function impactRank(value: string): number {
  const index = IMPACT_ORDER.indexOf(parseAccessibilityImpact(value));
  return index >= 0 ? index : 0;
}

export function parseAccessibilityImpact(value: unknown): AccessibilityImpact {
  const normalized = cleanSubject(value).toLowerCase();
  if (normalized === "critical" || normalized === "serious" || normalized === "moderate" || normalized === "minor") {
    return normalized;
  }
  return "serious";
}

function normalizeMetricName(value: string): PerformanceMetricName {
  const normalized = cleanSubject(value).toLowerCase();
  if (normalized === "ttfb") return "ttfb";
  if (normalized === "domcontentloaded" || normalized === "dcl" || normalized === "dom_content_loaded") return "domContentLoaded";
  if (normalized === "loadevent" || normalized === "load" || normalized === "load_event") return "loadEvent";
  if (normalized === "fcp" || normalized === "firstcontentfulpaint") return "fcp";
  if (normalized === "lcp" || normalized === "largestcontentfulpaint") return "lcp";
  if (normalized === "cls") return "cls";
  if (normalized === "jsheapused" || normalized === "heap" || normalized === "usedjsheap") return "jsHeapUsed";
  if (normalized === "resourcecount" || normalized === "resources") return "resourceCount";
  if (normalized === "failedresourcecount" || normalized === "failedresources") return "failedResourceCount";
  throw new Error(`Unknown performance metric: ${JSON.stringify(value)}.`);
}

function metricLabel(metric: PerformanceMetricName): string {
  if (metric === "ttfb") return "TTFB";
  if (metric === "domContentLoaded") return "DOMContentLoaded";
  if (metric === "loadEvent") return "Load event";
  if (metric === "fcp") return "FCP";
  if (metric === "lcp") return "LCP";
  if (metric === "cls") return "CLS";
  if (metric === "jsHeapUsed") return "JS heap used";
  if (metric === "resourceCount") return "Resource count";
  return "Failed resource count";
}

function metricSeverity(metric: PerformanceMetricName): "high" | "medium" {
  return metric === "lcp" || metric === "cls" || metric === "failedResourceCount" ? "high" : "medium";
}

function metricUnit(metric: PerformanceMetricName): string {
  if (metric === "cls" || metric === "resourceCount" || metric === "failedResourceCount") return "";
  if (metric === "jsHeapUsed") return "bytes";
  return "ms";
}

function parseThreshold(raw: string, metric: PerformanceMetricName): { value: number; unit: string } {
  const trimmed = cleanSubject(raw).toLowerCase();
  if (!trimmed) {
    throw new Error(`Missing threshold for ${metricLabel(metric)}.`);
  }

  if (metric === "cls" || metric === "resourceCount" || metric === "failedResourceCount") {
    const numeric = Number.parseFloat(trimmed);
    if (!Number.isFinite(numeric)) throw new Error(`Invalid threshold ${JSON.stringify(raw)} for ${metricLabel(metric)}.`);
    return { value: numeric, unit: "" };
  }

  if (metric === "jsHeapUsed") {
    const match = trimmed.match(/^([0-9]*\.?[0-9]+)\s*(b|kb|mb|gb)?$/);
    if (!match) throw new Error(`Invalid heap threshold ${JSON.stringify(raw)}.`);
    const numeric = Number.parseFloat(match[1]);
    const unit = match[2] || "b";
    const multiplier = unit === "gb" ? 1024 ** 3 : unit === "mb" ? 1024 ** 2 : unit === "kb" ? 1024 : 1;
    return { value: numeric * multiplier, unit: "bytes" };
  }

  const match = trimmed.match(/^([0-9]*\.?[0-9]+)\s*(ms|s)?$/);
  if (!match) throw new Error(`Invalid timing threshold ${JSON.stringify(raw)} for ${metricLabel(metric)}.`);
  const numeric = Number.parseFloat(match[1]);
  const unit = match[2] || "ms";
  return { value: unit === "s" ? numeric * 1000 : numeric, unit: "ms" };
}

export function parsePerformanceBudget(raw: string): PerformanceBudget {
  const input = cleanSubject(raw);
  const separator = input.indexOf("=");
  if (separator === -1) {
    throw new Error(`Performance budgets must use metric=value format. Received ${JSON.stringify(raw)}.`);
  }
  const metric = normalizeMetricName(input.slice(0, separator));
  const thresholdRaw = input.slice(separator + 1);
  const threshold = parseThreshold(thresholdRaw, metric);
  return {
    metric,
    label: metricLabel(metric),
    threshold: threshold.value,
    unit: threshold.unit || metricUnit(metric),
    severity: metricSeverity(metric),
    raw: input,
  };
}

function formatMetricValue(metric: PerformanceMetricName, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  if (metric === "cls") return String(Number(value.toFixed(3)));
  if (metric === "jsHeapUsed") {
    if (value >= 1024 ** 2) return `${Number((value / (1024 ** 2)).toFixed(2))} MB`;
    if (value >= 1024) return `${Number((value / 1024).toFixed(1))} KB`;
    return `${Math.round(value)} B`;
  }
  if (metric === "resourceCount" || metric === "failedResourceCount") return String(Math.round(value));
  return `${Math.round(value)} ms`;
}

async function loadAxeSource(): Promise<string> {
  if (process.env.CODEX_STACK_AXE_SOURCE) return process.env.CODEX_STACK_AXE_SOURCE;
  const mod = await import("axe-core");
  const source = String((mod as { source?: string; default?: { source?: string } }).source || (mod as { default?: { source?: string } }).default?.source || "");
  if (!source) {
    throw new Error("Unable to load axe-core source.");
  }
  return source;
}

export async function runAccessibilityAudit({
  page,
  url,
  scopeSelectors,
  minimumImpact,
}: {
  page: PlaywrightPage;
  url: string;
  scopeSelectors: string[];
  minimumImpact: AccessibilityImpact;
}): Promise<AccessibilityAuditResult> {
  const axeSource = await loadAxeSource();
  await page.addScriptTag({ content: axeSource });
  const raw = await page.evaluate(
    async ({ selectors, impact, marker }) => {
      const axe = (window as Window & { axe?: { run: (context?: unknown, options?: unknown) => Promise<RawAxeResult> } }).axe;
      if (!axe?.run) {
        throw new Error(`${marker}: axe.run is unavailable on the page.`);
      }
      const context = Array.isArray(selectors) && selectors.length
        ? { include: selectors.map((selector) => [selector]) }
        : document;
      const results = await axe.run(context, {});
      return {
        finalUrl: window.location.href,
        title: document.title,
        violations: Array.isArray(results.violations) ? results.violations : [],
        passesCount: Array.isArray(results.passes) ? results.passes.length : 0,
        incompleteCount: Array.isArray(results.incomplete) ? results.incomplete.length : 0,
        minimumImpact: impact,
      };
    },
    {
      selectors: scopeSelectors,
      impact: minimumImpact,
      marker: "codex-stack-a11y",
    },
  ) as {
    finalUrl?: string;
    title?: string;
    violations?: RawAxeViolation[];
    passesCount?: number;
    incompleteCount?: number;
    minimumImpact?: string;
  };

  const filteredViolations = (Array.isArray(raw.violations) ? raw.violations : [])
    .filter((item) => impactRank(cleanSubject(item.impact || "minor")) >= impactRank(minimumImpact))
    .map((item) => {
      const selectors = [...new Set((Array.isArray(item.nodes) ? item.nodes : []).flatMap((node) => Array.isArray(node.target) ? node.target.map((target) => cleanSubject(target)) : []).filter(Boolean))];
      return {
        id: cleanSubject(item.id),
        impact: cleanSubject(item.impact || "unknown") || "unknown",
        description: cleanSubject(item.description || item.help || ""),
        help: cleanSubject(item.help || item.id || "Accessibility violation"),
        helpUrl: cleanSubject(item.helpUrl || ""),
        selectors,
        nodeCount: Array.isArray(item.nodes) ? item.nodes.length : selectors.length,
      } satisfies AccessibilityViolation;
    });

  const topRules = filteredViolations
    .map((item) => `${item.id || item.help}${item.nodeCount ? ` (${item.nodeCount})` : ""}`)
    .slice(0, 5);

  return {
    url,
    finalUrl: cleanSubject(raw.finalUrl || url) || url,
    title: cleanSubject(raw.title || ""),
    minimumImpact,
    scopeSelectors,
    violationCount: filteredViolations.length,
    passCount: typeof raw.passesCount === "number" ? raw.passesCount : 0,
    incompleteCount: typeof raw.incompleteCount === "number" ? raw.incompleteCount : 0,
    topRules,
    violations: filteredViolations,
    status: filteredViolations.length ? "warning" : "pass",
  };
}

export async function runPerformanceAudit({
  page,
  url,
  waitMs,
  budgets,
}: {
  page: PlaywrightPage;
  url: string;
  waitMs: number;
  budgets: PerformanceBudget[];
}): Promise<PerformanceAuditResult> {
  const failedRequests: string[] = [];
  page.on("requestfailed", (request: { url?: () => string } | Record<string, unknown>) => {
    const value = typeof request?.url === "function" ? cleanSubject(request.url()) : "";
    if (value) failedRequests.push(value);
  });

  const installInitScript = page.addInitScript || page.evaluateOnNewDocument;
  if (!installInitScript) {
    throw new Error("The current Playwright page implementation does not support init script injection.");
  }

  await installInitScript.call(page, () => {
    const state = {
      lcp: null as number | null,
      cls: 0,
      fcp: null as number | null,
    };
    (window as Window & { __codexStackPerf?: typeof state }).__codexStackPerf = state;
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry | undefined;
        if (!last) return;
        const candidate = Number((last as PerformanceEntry & { renderTime?: number; loadTime?: number }).renderTime || (last as PerformanceEntry & { loadTime?: number }).loadTime || last.startTime || 0);
        if (Number.isFinite(candidate) && candidate >= 0) {
          state.lcp = candidate;
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          const payload = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!payload.hadRecentInput) {
            state.cls += Number(payload.value || 0);
          }
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {}
    try {
      const paintObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            state.fcp = entry.startTime;
          }
        }
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch {}
  });

  await page.goto(url, { waitUntil: "networkidle" });
  if (waitMs > 0) {
    await page.waitForTimeout(waitMs);
  }
  const raw = await page.evaluate(
    ({ marker }) => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const paintEntries = performance.getEntriesByType("paint");
      const state = (window as Window & { __codexStackPerf?: { lcp?: number | null; cls?: number | null; fcp?: number | null } }).__codexStackPerf || {};
      const fcpEntry = paintEntries.find((entry) => entry.name === "first-contentful-paint");
      const memory = performance as Performance & { memory?: { usedJSHeapSize?: number } };
      return {
        marker,
        finalUrl: window.location.href,
        title: document.title,
        ttfb: navigation ? navigation.responseStart - navigation.requestStart : null,
        domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : null,
        loadEvent: navigation ? navigation.loadEventEnd : null,
        fcp: state.fcp ?? (fcpEntry ? fcpEntry.startTime : null),
        lcp: state.lcp ?? null,
        cls: state.cls ?? null,
        jsHeapUsed: memory.memory?.usedJSHeapSize ?? null,
        resourceCount: performance.getEntriesByType("resource").length,
      };
    },
    { marker: "codex-stack-perf" },
  ) as RawPerfResult;

  const metrics: PerformanceMetrics = {
    ttfb: asNumber(raw.ttfb),
    domContentLoaded: asNumber(raw.domContentLoaded),
    loadEvent: asNumber(raw.loadEvent),
    fcp: asNumber(raw.fcp),
    lcp: asNumber(raw.lcp),
    cls: asNumber(raw.cls),
    jsHeapUsed: asNumber(raw.jsHeapUsed),
    resourceCount: typeof raw.resourceCount === "number" ? raw.resourceCount : 0,
    failedResourceCount: failedRequests.length,
  };

  const budgetResults = budgets.map((budget) => {
    const value = metrics[budget.metric];
    const passed = typeof value === "number" ? value <= budget.threshold : true;
    return {
      ...budget,
      value: typeof value === "number" ? value : null,
      passed,
      detail: typeof value === "number"
        ? `${budget.label} ${formatMetricValue(budget.metric, value)} ${passed ? "within" : "exceeds"} threshold ${formatMetricValue(budget.metric, budget.threshold)}.`
        : `${budget.label} was unavailable in this browser run.`,
    } satisfies PerformanceBudgetResult;
  });

  const topViolations = budgetResults
    .filter((item) => !item.passed)
    .map((item) => `${item.label}: ${formatMetricValue(item.metric, item.value)} > ${formatMetricValue(item.metric, item.threshold)}`)
    .slice(0, 5);

  return {
    url,
    finalUrl: cleanSubject(raw.finalUrl || url) || url,
    title: cleanSubject(raw.title || ""),
    waitMs,
    metrics,
    budgets: budgetResults,
    budgetViolationCount: budgetResults.filter((item) => !item.passed).length,
    topViolations,
    status: budgetResults.some((item) => !item.passed) ? "warning" : "pass",
  };
}
