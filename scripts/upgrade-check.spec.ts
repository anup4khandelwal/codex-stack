#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";

const jsonOutput = execFileSync(bun, ["scripts/upgrade-check.ts", "--offline", "--json"], {
  cwd: rootDir,
  encoding: "utf8",
});

const report = JSON.parse(jsonOutput) as {
  marker?: string;
  offline?: boolean;
  overallStatus?: string;
  checks?: {
    runtime?: unknown[];
    dependencies?: Array<{ status?: string }>;
    workflows?: Array<{ status?: string }>;
    installHealth?: unknown[];
  };
};

assert.equal(report.marker, "<!-- codex-stack:daily-update-check -->");
assert.equal(report.offline, true);
assert.ok(["ok", "warning", "error", "skipped"].includes(String(report.overallStatus)));
assert.ok(Array.isArray(report.checks?.runtime));
assert.ok(Array.isArray(report.checks?.installHealth));
assert.ok(report.checks?.dependencies?.some((item) => item.status === "skipped"));
assert.ok(report.checks?.workflows?.some((item) => item.status === "skipped"));
const ciJsonOutput = execFileSync(bun, ["scripts/upgrade-check.ts", "--offline", "--json"], {
  cwd: rootDir,
  encoding: "utf8",
  env: {
    ...process.env,
    CI: "true",
  },
});
const ciReport = JSON.parse(ciJsonOutput) as {
  checks?: {
    installHealth?: Array<{ name?: string; status?: string; detail?: string }>;
  };
};
assert.equal(
  ciReport.checks?.installHealth?.find((item) => item.name === "Local wrappers")?.status,
  "skipped",
);
assert.match(
  String(ciReport.checks?.installHealth?.find((item) => item.name === "Local wrappers")?.detail || ""),
  /skipped in CI/i,
);

const markdownOutput = execFileSync(bun, ["scripts/upgrade-check.ts", "--offline"], {
  cwd: rootDir,
  encoding: "utf8",
});

assert.match(markdownOutput, /codex-stack daily update check/);
assert.match(markdownOutput, /Recommended actions/);
assert.match(markdownOutput, /Apply results/);
assert.match(markdownOutput, /Requested: no/);

const applyFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-upgrade-apply-"));
try {
  for (const entry of ["package.json", "setup", "scripts", "skills", "src", "browse"]) {
    fs.cpSync(path.join(rootDir, entry), path.join(applyFixtureDir, entry), { recursive: true });
  }

  const applyJsonOutput = execFileSync(bun, ["scripts/upgrade-check.ts", "--offline", "--apply", "--json"], {
    cwd: applyFixtureDir,
    encoding: "utf8",
  });

  const applyReport = JSON.parse(applyJsonOutput) as {
    applyRequested?: boolean;
    overallStatus?: string;
    applyResults?: Array<{ status?: string; command?: string }>;
    checks?: {
      installHealth?: Array<{ name?: string; status?: string }>;
    };
  };

  assert.equal(applyReport.applyRequested, true);
  assert.ok(["ok", "warning"].includes(String(applyReport.overallStatus)));
  assert.equal(applyReport.applyResults?.length, 2);
  assert.deepEqual(
    applyReport.applyResults?.map((item) => item.status),
    ["ok", "ok"],
  );
  assert.match(String(applyReport.applyResults?.[0]?.command), /SKIP_INSTALL=1 bash \.\/setup/);
  assert.match(String(applyReport.applyResults?.[1]?.command), /bash scripts\/install-skills\.sh project \$\(pwd\)/);

  const upgradeWrapper = path.join(applyFixtureDir, ".codex-stack", "bin", "upgrade");
  const projectSkillLink = path.join(applyFixtureDir, ".codex", "skills", "codex-stack-upgrade");
  assert.ok(fs.existsSync(upgradeWrapper));
  assert.ok(fs.existsSync(projectSkillLink));
  assert.equal(
    fs.realpathSync(projectSkillLink),
    fs.realpathSync(path.join(applyFixtureDir, "skills", "upgrade")),
  );
  assert.equal(
    applyReport.checks?.installHealth?.find((item) => item.name === "Project skill links")?.status,
    "ok",
  );

  const applyMarkdownOutput = execFileSync(bun, ["scripts/upgrade-check.ts", "--offline", "--apply"], {
    cwd: applyFixtureDir,
    encoding: "utf8",
  });
  assert.match(applyMarkdownOutput, /Apply results/);
  assert.match(applyMarkdownOutput, /Requested: yes/);
  assert.match(applyMarkdownOutput, /Local wrapper refresh/);
  assert.match(applyMarkdownOutput, /Project skill link refresh/);
} finally {
  fs.rmSync(applyFixtureDir, { recursive: true, force: true });
}

console.log("upgrade-check spec passed");
