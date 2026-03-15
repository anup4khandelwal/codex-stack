#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const bun = process.execPath || "bun";
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-qa-decisions-"));

async function main(): Promise<void> {
  const approveRaw = execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "qa-decide.ts"),
      "approve",
      "--snapshot",
      "portal-dashboard",
      "--route",
      "/dashboard",
      "--device",
      "desktop",
      "--kind",
      "snapshot-drift",
      "--reason",
      "Intentional redesign approved in review",
      "--review-after",
      "2026-03-22T00:00:00Z",
      "--json",
    ],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );

  const approved = JSON.parse(approveRaw) as { file?: string; decision?: string; kind?: string; routePath?: string; reviewAfter?: string };
  assert.equal(approved.decision, "approve-current");
  assert.equal(approved.kind, "snapshot-drift");
  assert.equal(approved.routePath, "/dashboard");
  assert.match(String(approved.file), /\.codex-stack\/baseline-decisions\/.+\.json$/);
  assert.equal(approved.reviewAfter, "2026-03-22T00:00:00.000Z");
  assert.ok(fs.existsSync(path.join(fixtureRoot, String(approved.file))));

  execFileSync(
    bun,
    [
      path.join(rootDir, "scripts", "qa-decide.ts"),
      "suppress",
      "--category",
      "accessibility",
      "--kind",
      "accessibility-rule",
      "--route",
      "/dashboard",
      "--device",
      "desktop",
      "--rule",
      "color-contrast",
      "--reason",
      "Known third-party widget issue",
      "--expires-at",
      "2025-01-01T00:00:00Z",
    ],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );

  const listedRaw = execFileSync(
    bun,
    [path.join(rootDir, "scripts", "qa-decide.ts"), "list", "--json"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );
  const listed = JSON.parse(listedRaw) as Array<{ decision?: string; category?: string; expired?: boolean }>;
  assert.equal(listed.length, 2);
  assert.ok(listed.some((item) => item.decision === "approve-current" && item.category === "visual" && item.expired === false));
  assert.ok(listed.some((item) => item.decision === "suppress" && item.category === "accessibility" && item.expired === true));

  const activeRaw = execFileSync(
    bun,
    [path.join(rootDir, "scripts", "qa-decide.ts"), "list", "--active-only", "--json"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );
  const active = JSON.parse(activeRaw) as Array<{ decision?: string }>;
  assert.equal(active.length, 1);
  assert.equal(active[0]?.decision, "approve-current");

  const prunedRaw = execFileSync(
    bun,
    [path.join(rootDir, "scripts", "qa-decide.ts"), "prune-expired", "--json"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );
  const pruned = JSON.parse(prunedRaw) as { count?: number; removed?: string[] };
  assert.equal(pruned.count, 1);
  assert.equal(pruned.removed?.length, 1);

  const finalListRaw = execFileSync(
    bun,
    [path.join(rootDir, "scripts", "qa-decide.ts"), "list", "--json"],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
    },
  );
  const finalList = JSON.parse(finalListRaw) as Array<{ decision?: string }>;
  assert.equal(finalList.length, 1);
  assert.equal(finalList[0]?.decision, "approve-current");

  console.log("qa-decisions spec passed");
}

try {
  await main();
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
