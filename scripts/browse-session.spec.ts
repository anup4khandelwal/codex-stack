#!/usr/bin/env bun
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeSessionBundle, readSessionBundle, writeSessionBundle } from "../browse/src/session-bundle.ts";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-stack-browse-session-"));
const originalCwd = process.cwd();
process.chdir(fixtureRoot);

try {
  const cookieOnly = normalizeSessionBundle([
    {
      name: "session",
      value: "abc123",
      domain: "example.com",
      path: "/",
      httpOnly: true,
      secure: true,
    },
  ], "staging");

  assert.equal(cookieOnly.session, "staging");
  assert.equal(cookieOnly.storageState.cookies.length, 1);
  assert.equal(cookieOnly.storageState.origins.length, 0);
  assert.equal(cookieOnly.metadata.authenticated, true);

  const bundlePath = writeSessionBundle("tmp/session.json", {
    ...cookieOnly,
    storageState: {
      cookies: cookieOnly.storageState.cookies,
      origins: [
        {
          origin: "https://example.com",
          localStorage: [{ name: "token", value: "xyz" }],
          sessionStorage: [{ name: "view", value: "dashboard" }],
        },
      ],
    },
  });

  const loaded = readSessionBundle(bundlePath, "fallback");
  assert.equal(loaded.session, "staging");
  assert.equal(loaded.storageState.cookies.length, 1);
  assert.equal(loaded.storageState.origins[0]?.origin, "https://example.com");
  assert.equal(loaded.storageState.origins[0]?.localStorage[0]?.name, "token");
  assert.equal(loaded.storageState.origins[0]?.sessionStorage[0]?.value, "dashboard");
  assert.ok(fs.existsSync(path.resolve(fixtureRoot, bundlePath)));

  console.log("browse-session spec passed");
} finally {
  process.chdir(originalCwd);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
