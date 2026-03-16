import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModeDefinition } from "./types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const modeRegistry: ModeDefinition[] = [
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
    name: "qa-decide",
    role: "Regression triage operator",
    summary: "Record approvals, suppressions, and refresh decisions for known QA regressions.",
    skillPath: path.join(rootDir, "skills", "qa-decide", "SKILL.md"),
  },
  {
    name: "preview",
    role: "Preview verifier",
    summary: "Resolve preview URLs, wait for deployment readiness, and verify merge readiness against the live preview.",
    skillPath: path.join(rootDir, "skills", "preview", "SKILL.md"),
  },
  {
    name: "deploy",
    role: "Deploy verifier",
    summary: "Verify a preview or staging deploy across page/device checks, flows, snapshots, and visual evidence.",
    skillPath: path.join(rootDir, "skills", "deploy", "SKILL.md"),
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
    name: "setup-browser-cookies",
    role: "Auth setup operator",
    summary: "Bootstrap authenticated browser sessions and CI-ready session bundles from a local browser profile.",
    skillPath: path.join(rootDir, "skills", "setup-browser-cookies", "SKILL.md"),
  },
  {
    name: "retro",
    role: "Engineering manager",
    summary: "Generate a delivery retrospective from git and PR history.",
    skillPath: path.join(rootDir, "skills", "retro", "SKILL.md"),
  },
  {
    name: "upgrade",
    role: "Repo maintainer",
    summary: "Audit install health and update drift across dependencies, skills, and workflows.",
    skillPath: path.join(rootDir, "skills", "upgrade", "SKILL.md"),
  },
  {
    name: "fleet",
    role: "Platform engineer",
    summary: "Roll out codex-stack policies across multiple repos and aggregate org-level health.",
    skillPath: path.join(rootDir, "skills", "fleet", "SKILL.md"),
  },
  {
    name: "mcp",
    role: "Interop engineer",
    summary: "Expose codex-stack workflows and evidence to MCP-capable clients over stdio.",
    skillPath: path.join(rootDir, "skills", "mcp", "SKILL.md"),
  },
];

export function findMode(name: string): ModeDefinition | undefined {
  return modeRegistry.find((mode) => mode.name === name);
}

export function allModes(): ModeDefinition[] {
  return [...modeRegistry];
}
