interface DemoSession {
  email: string;
  role: string;
  signedInAt: string;
}

const SESSION_KEY = "codexStackDemoSession";
const PAGE_SEGMENTS = new Set(["login", "dashboard", "changes", "index.html", "login.html", "dashboard.html", "changes.html"]);

function getSession(): DemoSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as DemoSession | null;
    if (!value || typeof value.email !== "string" || typeof value.role !== "string" || typeof value.signedInAt !== "string") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function setSession(payload: DemoSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function formatDate(): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function appBasePath(pathname = window.location.pathname): string {
  const segments = pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const last = segments[segments.length - 1]?.toLowerCase() || "";
  if (PAGE_SEGMENTS.has(last)) {
    segments.pop();
  }
  if (!segments.length) return "/";
  return `/${segments.join("/")}/`;
}

function appPath(route: string): string {
  const base = appBasePath();
  const cleanRoute = String(route || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return cleanRoute ? `${base}${cleanRoute}` : base;
}

function loginPath(next?: string): string {
  const target = new URL(appPath("login"), window.location.origin);
  if (next) target.searchParams.set("next", next);
  return target.toString();
}

function dashboardPath(): string {
  return new URL(appPath("dashboard"), window.location.origin).toString();
}

function changesPath(): string {
  return new URL(appPath("changes"), window.location.origin).toString();
}

function currentRole(email: string): string {
  if (email.includes("release") || email.includes("ops")) return "Release manager";
  if (email.includes("design")) return "Design reviewer";
  return "Engineering lead";
}

function hydrateSessionFields(session: DemoSession): void {
  for (const element of document.querySelectorAll<HTMLElement>("[data-user-email]")) {
    element.replaceChildren(document.createTextNode(session.email));
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-user-role]")) {
    element.replaceChildren(document.createTextNode(session.role));
  }
  for (const element of document.querySelectorAll<HTMLElement>("[data-signed-in-at]")) {
    element.replaceChildren(document.createTextNode(session.signedInAt));
  }
}

function guardProtectedPage(targetPath: string): DemoSession | null {
  const session = getSession();
  if (!session) {
    window.location.href = loginPath(targetPath);
    return null;
  }
  hydrateSessionFields(session);
  return session;
}

if (document.body.dataset.page === "login") {
  const form = document.querySelector<HTMLFormElement>("form[data-login-form]");
  const emailField = document.querySelector<HTMLInputElement>("input[name=email]");
  const passwordField = document.querySelector<HTMLInputElement>("input[name=password]");
  const notice = document.querySelector<HTMLElement>("[data-login-notice]");
  const next = new URLSearchParams(window.location.search).get("next") || dashboardPath();

  if (getSession()) {
    window.location.href = next;
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = emailField?.value.trim() ?? "";
    const password = passwordField?.value || "";

    if (!email || !password) {
      if (notice) {
        notice.textContent = "Use any email and password to continue the release-readiness demo.";
      }
      return;
    }

    setSession({
      email,
      role: currentRole(email),
      signedInAt: formatDate(),
    });
    window.location.href = next;
  });
}

if (document.body.dataset.page === "dashboard") {
  guardProtectedPage(dashboardPath());
  document.querySelector<HTMLElement>("[data-open-evidence]")?.addEventListener("click", (event) => {
    if (!(event.currentTarget instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    window.location.href = changesPath();
  });
}

if (document.body.dataset.page === "changes") {
  guardProtectedPage(changesPath());
}

for (const button of document.querySelectorAll<HTMLElement>("[data-signout]")) {
  button.addEventListener("click", () => {
    clearSession();
    window.location.href = loginPath();
  });
}
