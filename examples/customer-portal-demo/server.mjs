#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

const ROUTES = {
  "/": "index.html",
  "/login": "login.html",
  "/dashboard": "dashboard.html",
};

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function checkRoutes() {
  const missing = Object.values(ROUTES)
    .map((file) => path.join(PUBLIC_DIR, file))
    .filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) {
    console.error(`Missing demo files: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("[customer-portal-demo] route map ok");
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(body);
}

function serveFile(res, filePath) {
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === "/api/health") {
    send(res, 200, JSON.stringify({ ok: true, service: "customer-portal-demo" }), CONTENT_TYPES[".json"]);
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

server.listen(PORT, HOST, () => {
  console.log(`[customer-portal-demo] http://${HOST}:${PORT}`);
});
