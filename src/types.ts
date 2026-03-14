export type ModeName = "product" | "tech" | "review" | "qa" | "preview" | "ship" | "browse" | "retro" | "upgrade";

export interface ModeDefinition {
  name: ModeName;
  role: string;
  summary: string;
  skillPath: string;
}
