export type ModeName = "product" | "tech" | "review" | "qa" | "qa-decide" | "preview" | "deploy" | "ship" | "browse" | "setup-browser-cookies" | "retro" | "upgrade" | "fleet" | "agents" | "goals" | "heartbeat" | "approvals" | "mcp";

export interface ModeDefinition {
  name: ModeName;
  role: string;
  summary: string;
  skillPath: string;
}
