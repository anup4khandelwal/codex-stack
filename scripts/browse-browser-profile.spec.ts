#!/usr/bin/env bun
import assert from "node:assert/strict";
import { browserProfileSpec } from "../browse/src/browser-profile.ts";

const chrome = browserProfileSpec("chrome", "darwin", "/Users/demo");
assert.equal(chrome.browser, "chrome");
assert.equal(chrome.defaultProfile, "Default");
assert.match(chrome.executablePath, /Google Chrome/);
assert.match(chrome.userDataDir, /Library\/Application Support\/Google\/Chrome$/);

const edge = browserProfileSpec("edge", "darwin", "/Users/demo");
assert.equal(edge.browser, "edge");
assert.match(edge.userDataDir, /Library\/Application Support\/Microsoft Edge$/);

assert.throws(
  () => browserProfileSpec("firefox", "darwin", "/Users/demo"),
  /Unsupported browser/,
);
assert.throws(
  () => browserProfileSpec("chrome", "linux", "/home/demo"),
  /macOS only/,
);

console.log("browse-browser-profile spec passed");
