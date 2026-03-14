interface DemoSession {
  email: string;
  role: string;
  signedInAt: string;
}

const SESSION_KEY = "codexStackDemoSession";
const PAGE_SEGMENTS = new Set(["login", "dashboard", "index.html", "login.html", "dashboard.html"]);

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
        notice.textContent = "Use any email and password to continue the demo.";
      }
      return;
    }

    setSession({
      email,
      role: email.includes("ops") ? "Operations lead" : "Customer success",
      signedInAt: formatDate(),
    });
    window.location.href = next;
  });
}

if (document.body.dataset.page === "dashboard") {
  const session = getSession();
  if (!session) {
    window.location.href = loginPath(dashboardPath());
  } else {
    document.querySelector<HTMLElement>("[data-user-email]")?.replaceChildren(document.createTextNode(session.email));
    document.querySelector<HTMLElement>("[data-user-role]")?.replaceChildren(document.createTextNode(session.role));
    document.querySelector<HTMLElement>("[data-signed-in-at]")?.replaceChildren(document.createTextNode(session.signedInAt));
  }

  document.querySelector<HTMLElement>("[data-signout]")?.addEventListener("click", () => {
    clearSession();
    window.location.href = loginPath();
  });
}
