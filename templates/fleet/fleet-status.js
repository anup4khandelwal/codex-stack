#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function findJsonFiles(rootDir) {
  const results = [];
  if (!fs.existsSync(rootDir)) return results;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile() && entry.name === 'report.json') {
        results.push(absolute);
      }
    }
  }
  return results;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pickLatestReport(reportPaths) {
  let best = null;
  for (const reportPath of reportPaths) {
    try {
      const data = readJson(reportPath);
      const generatedAt = clean(data.generatedAt || data.timestamp || '');
      const score = generatedAt ? Date.parse(generatedAt) : fs.statSync(reportPath).mtimeMs;
      if (!best || score > best.score) {
        best = { path: reportPath, data, score };
      }
    } catch {
      // Ignore malformed reports.
    }
  }
  return best;
}

function parseArgs(argv) {
  const out = {
    out: path.resolve(REPO_ROOT, '.codex-stack', 'fleet-status', 'status.json'),
    markdownOut: path.resolve(REPO_ROOT, '.codex-stack', 'fleet-status', 'summary.md'),
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      out.out = path.resolve(REPO_ROOT, argv[i + 1] || out.out);
      i += 1;
    } else if (arg === '--markdown-out') {
      out.markdownOut = path.resolve(REPO_ROOT, argv[i + 1] || out.markdownOut);
      i += 1;
    } else if (arg === '--json') {
      out.json = true;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const memberPath = path.resolve(REPO_ROOT, '.codex-stack', 'fleet-member.json');
  const member = fs.existsSync(memberPath) ? readJson(memberPath) : null;
  const repo = clean(member && member.repo || process.env.GITHUB_REPOSITORY || path.basename(REPO_ROOT));
  const branch = clean(process.env.GITHUB_REF_NAME || '');
  const latest = pickLatestReport(findJsonFiles(path.resolve(REPO_ROOT, 'docs', 'qa')));
  const latestData = latest ? latest.data : null;
  const requiresLatestReport = member ? member.status?.requiresLatestReport !== false : true;

  const unresolved = asNumber(latestData && latestData.decisionSummary && latestData.decisionSummary.unresolvedCount) || 0;
  const expired = asNumber(latestData && latestData.decisionSummary && latestData.decisionSummary.expiredCount) || 0;
  const staleBaselines = asNumber(latestData && latestData.visualRisk && latestData.visualRisk.staleBaselines) || 0;
  const visualRiskScore = asNumber(latestData && latestData.visualRisk && latestData.visualRisk.score);
  const accessibilityViolations = asNumber(latestData && latestData.accessibility && latestData.accessibility.violationCount);
  const performanceBudgetViolations = asNumber(latestData && latestData.performance && latestData.performance.budgetViolationCount);
  const baseStatus = clean(latestData && latestData.status || '');

  let status = 'healthy';
  if (!member) {
    status = 'missing';
  } else if (!latestData && requiresLatestReport) {
    status = 'warning';
  } else if (baseStatus === 'critical') {
    status = 'critical';
  } else if (baseStatus === 'warning' || unresolved > 0 || expired > 0 || staleBaselines > 0) {
    status = 'warning';
  }

  let riskScore = 0;
  if (!member) riskScore += 80;
  if (!latestData && requiresLatestReport) riskScore += 20;
  if (baseStatus === 'critical') riskScore += 40;
  if (baseStatus === 'warning') riskScore += 20;
  riskScore += Math.min(24, unresolved * 8);
  riskScore += Math.min(12, expired * 4);
  riskScore += Math.min(12, staleBaselines * 3);
  riskScore += Math.min(25, Math.round((visualRiskScore || 0) * 0.25));
  riskScore += Math.min(10, (accessibilityViolations || 0) * 2);
  riskScore += Math.min(12, (performanceBudgetViolations || 0) * 4);
  riskScore = Math.min(100, riskScore);

  const payload = {
    marker: '<!-- codex-stack:fleet-status -->',
    generatedAt: new Date().toISOString(),
    repo,
    branch: branch || clean(member && member.branch || ''),
    installed: Boolean(member),
    controlRepo: clean(member && member.controlRepo || ''),
    team: clean(member && member.team || ''),
    policyPack: clean(member && member.policyPack || ''),
    requiredChecks: Array.isArray(member && member.requiredChecks) ? member.requiredChecks : [],
    requiresLatestReport,
    status,
    riskScore,
    latestReport: latestData ? {
      generatedAt: clean(latestData.generatedAt || ''),
      status: baseStatus || 'unknown',
      recommendation: clean(latestData.recommendation || ''),
      healthScore: asNumber(latestData.healthScore),
      visualRiskScore,
      visualRiskLevel: clean(latestData.visualRisk && latestData.visualRisk.level || ''),
      unresolvedRegressions: unresolved,
      approvedRegressions: asNumber(latestData.decisionSummary && latestData.decisionSummary.approvedCount) || 0,
      expiredDecisions: expired,
      staleBaselines,
      accessibilityViolations,
      performanceBudgetViolations,
      reportPath: latest.path,
    } : null,
  };

  const markdownLines = [
    '# codex-stack fleet status',
    '',
    `- Repo: ${payload.repo}`,
    `- Branch: ${payload.branch || 'unknown'}`,
    `- Installed: ${payload.installed ? 'yes' : 'no'}`,
    `- Status: ${payload.status.toUpperCase()}`,
    `- Risk score: ${payload.riskScore}/100`,
    payload.team ? `- Team: ${payload.team}` : '',
    payload.policyPack ? `- Policy pack: ${payload.policyPack}` : '',
    payload.latestReport ? `- Latest QA status: ${payload.latestReport.status}` : `- Latest QA status: ${requiresLatestReport ? 'missing' : 'not required'}`,
    payload.latestReport && payload.latestReport.visualRiskScore !== null ? `- Visual risk: ${payload.latestReport.visualRiskLevel || 'none'} (${payload.latestReport.visualRiskScore}/100)` : '',
    payload.latestReport ? `- Unresolved regressions: ${payload.latestReport.unresolvedRegressions}` : '',
    payload.latestReport && payload.latestReport.accessibilityViolations !== null ? `- Accessibility violations: ${payload.latestReport.accessibilityViolations}` : '',
    payload.latestReport && payload.latestReport.performanceBudgetViolations !== null ? `- Perf budget violations: ${payload.latestReport.performanceBudgetViolations}` : '',
  ].filter(Boolean);

  ensureDir(path.dirname(args.out));
  ensureDir(path.dirname(args.markdownOut));
  fs.writeFileSync(args.out, JSON.stringify(payload, null, 2));
  fs.writeFileSync(args.markdownOut, `${markdownLines.join('\n')}\n`);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(`${markdownLines.join('\n')}\n`);
  }
}

main();
