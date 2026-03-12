export type BrowseCommand =
  | "doctor"
  | "status"
  | "sessions"
  | "flows"
  | "save-flow"
  | "save-repo-flow"
  | "show-flow"
  | "delete-flow"
  | "clear-session"
  | "text"
  | "html"
  | "links"
  | "screenshot"
  | "eval"
  | "click"
  | "fill"
  | "wait"
  | "press"
  | "assert-visible"
  | "assert-text"
  | "assert-url"
  | "assert-count"
  | "flow"
  | "run-flow"
  | "login";

export function describeBrowseRuntime(): string {
  return "codex-stack browse provides persistent Playwright sessions, deterministic assertions, and reusable flow files from both local state and checked-in browse/flows definitions.";
}
