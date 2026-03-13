const SESSION_KEY = "codexStackDemoSession";

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function setSession(payload) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function formatDate() {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

if (document.body.dataset.page === "login") {
  const form = document.querySelector("form[data-login-form]");
  const emailField = document.querySelector("input[name=email]");
  const passwordField = document.querySelector("input[name=password]");
  const notice = document.querySelector("[data-login-notice]");
  const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";

  if (getSession()) {
    window.location.href = next;
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = emailField?.value.trim();
    const password = passwordField?.value || "";

    if (!email || !password) {
      notice.textContent = "Use any email and password to continue the demo.";
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
    window.location.href = "/login?next=/dashboard";
  } else {
    document.querySelector("[data-user-email]")?.replaceChildren(document.createTextNode(session.email));
    document.querySelector("[data-user-role]")?.replaceChildren(document.createTextNode(session.role));
    document.querySelector("[data-signed-in-at]")?.replaceChildren(document.createTextNode(session.signedInAt));
  }

  document.querySelector("[data-signout]")?.addEventListener("click", () => {
    clearSession();
    window.location.href = "/login";
  });
}
