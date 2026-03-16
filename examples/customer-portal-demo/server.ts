#!/usr/bin/env bun
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const ROUTES: Record<string, string> = {
  "/": "index.html",
  "/login": "login.html",
  "/login/": "login.html",
  "/dashboard": "dashboard.html",
  "/dashboard/": "dashboard.html",
  "/changes": "changes.html",
  "/changes/": "changes.html",
};

const REQUIRED_FILES = [...Object.values(ROUTES), "app.css", "app.js"];

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function checkRoutes(): void {
  const missing = REQUIRED_FILES
    .map((file) => path.join(PUBLIC_DIR, file))
    .filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) {
    console.error(`Missing demo files: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("[release-readiness-demo] route map ok");
}

function send(
  res: ServerResponse<IncomingMessage>,
  status: number,
  body: string | Buffer,
  contentType = "text/plain; charset=utf-8",
): void {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(body);
}

function serveFile(res: ServerResponse<IncomingMessage>, filePath: string): void {
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, "Not found");
    return;
  }
  const ext = path.extname(filePath);
  send(res, 200, fs.readFileSync(filePath), CONTENT_TYPES[ext] || "application/octet-stream");
}

const server = http.createServer((req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === "/api/health") {
    send(res, 200, JSON.stringify({ ok: true, service: "release-readiness-demo" }), CONTENT_TYPES[".json"]);
    return;
  }

  if (url.pathname === "/favicon.ico") {
    send(res, 204, "");
    return;
  }

  if (ROUTES[url.pathname]) {
    serveFile(res, path.join(PUBLIC_DIR, ROUTES[url.pathname]));
    return;
  }

  const requested = path.normalize(path.join(PUBLIC_DIR, url.pathname));
  serveFile(res, requested);
});

if (process.argv.includes("--check")) {
  checkRoutes();
  process.exit(0);
}

checkRoutes();

server.listen(PORT, HOST, () => {
  console.log(`[release-readiness-demo] http://${HOST}:${PORT}`);
});
