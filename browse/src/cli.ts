export type BrowseCommand =
  | "doctor"
  | "status"
  | "sessions"
  | "flows"
  | "save-flow"
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
  return "codex-stack browse provides persistent Playwright sessions, reusable named flows, deterministic assertions, and QA commands such as click, fill, wait, press, screenshot, and login.";
}
