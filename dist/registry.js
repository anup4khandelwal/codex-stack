#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const modeRegistry = [
  {
    name: "product",
    role: "Product thinker",
    summary: "Reframe the request and define the real user outcome.",
    skillPath: path.join(rootDir, "skills", "product", "SKILL.md"),
  },
  {
    name: "tech",
    role: "Tech lead",
    summary: "Lock architecture, trust boundaries, and the test plan.",
    skillPath: path.join(rootDir, "skills", "tech", "SKILL.md"),
  },
  {
    name: "review",
    role: "Paranoid staff engineer",
    summary: "Review the diff for structural production risks.",
    skillPath: path.join(rootDir, "skills", "review", "SKILL.md"),
  },
  {
    name: "qa",
    role: "QA lead",
    summary: "Run browser flows and snapshot checks, then score release readiness.",
    skillPath: path.join(rootDir, "skills", "qa", "SKILL.md"),
  },
  {
    name: "ship",
    role: "Release engineer",
    summary: "Validate release readiness and execute the shipping checklist.",
    skillPath: path.join(rootDir, "skills", "ship", "SKILL.md"),
  },
  {
    name: "browse",
    role: "QA engineer",
    summary: "Use the browser runtime for end-to-end verification.",
    skillPath: path.join(rootDir, "skills", "browse", "SKILL.md"),
  },
  {
    name: "retro",
    role: "Engineering manager",
    summary: "Generate a delivery retrospective from git and PR history.",
    skillPath: path.join(rootDir, "skills", "retro", "SKILL.md"),
  },
];

export function findMode(name) {
  return modeRegistry.find((mode) => mode.name === name);
}

export function allModes() {
  return [...modeRegistry];
}
