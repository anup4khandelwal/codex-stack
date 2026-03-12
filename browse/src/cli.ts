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
  | "flow"
  | "run-flow"
  | "login";

export function describeBrowseRuntime(): string {
  return "codex-stack browse provides persistent Playwright sessions, reusable named flows, and QA commands such as click, fill, wait, press, screenshot, and login.";
}
