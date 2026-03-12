export type ModeName = "product" | "tech" | "review" | "ship" | "browse" | "retro";

export interface ModeDefinition {
  name: ModeName;
  role: string;
  summary: string;
  skillPath: string;
}
