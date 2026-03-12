#!/usr/bin/env node
import process from "node:process";

const [, , command = "doctor"] = process.argv;

if (command === "doctor") {
  console.log("codex-stack browse runtime");
  console.log("- status: scaffolded");
  console.log("- runtime: not installed");
  console.log("- next step: add Playwright dependency and implement persistent browser commands");
  process.exit(0);
}

if (command === "status") {
  console.log(JSON.stringify({ ready: false, message: "browse runtime scaffold only" }, null, 2));
  process.exit(0);
}

console.error(`Unsupported browse command: ${command}`);
process.exit(1);
