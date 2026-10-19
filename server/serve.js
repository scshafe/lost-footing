// The game's static file server for the deployed stack (deploy/stack): the
// browser client in web/ and the simulation modules in src/ it imports, and
// nothing else from the repository. Node's standard library only.
//
//   node server/serve.js                serve on LOST_FOOTING_BIND:LOST_FOOTING_PORT
//   node server/serve.js --healthcheck  exit 0 when /healthz answers 200
//
// scripts/serve stays the quick local server; this one is what the image runs.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The only top-level directories a request may read.
const SERVED = ["web", "src"];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
};

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // A deploy replaces the files in place: revalidate rather than cache stale modules.
  "Cache-Control": "no-cache",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra });
  res.end(body);
}

// The file a URL path names, or null when it is outside web/ and src/.
export function resolveRequest(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const file = path.resolve(root, `.${path.posix.normalize(`/${decoded}`)}`);
  const allowed = SERVED.some((dir) => {
    const base = path.join(root, dir);
    return file === base || file.startsWith(`${base}${path.sep}`);
  });
  return allowed ? file : null;
}

export function createServer(root = REPO_ROOT) {
  return http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "method not allowed\n", { Allow: "GET, HEAD" });
      return;
    }
    const urlPath = new URL(req.url, "http://localhost").pathname;
    if (urlPath === "/healthz") {
      send(res, 200, "ok\n");
      return;
    }
    if (urlPath === "/" || urlPath === "/web") {
      send(res, 302, "", { Location: "/web/" });
      return;
    }
    let file = resolveRequest(root, urlPath);
    if (file && urlPath.endsWith("/")) file = path.join(file, "index.html");
    let info = null;
    if (file) info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      send(res, 404, "not found\n");
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { ...HEADERS, "Content-Type": type, "Content-Length": info.size });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  });
}

function healthcheck(host, port) {
  const req = http.get({ host, port, path: "/healthz", timeout: 3000 }, (res) => {
    res.resume();
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
  req.on("timeout", () => req.destroy());
  req.on("error", () => process.exit(1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.LOST_FOOTING_BIND || "127.0.0.1";
  const port = Number(process.env.LOST_FOOTING_PORT || 8080);
  if (process.argv.includes("--healthcheck")) {
    healthcheck(host, port);
  } else {
    const server = createServer();
    server.listen(port, host, () => console.log(`lost-footing: serving on http://${host}:${port}/web/`));
    for (const signal of ["SIGTERM", "SIGINT"]) {
      process.on(signal, () => server.close(() => process.exit(0)));
    }
  }
}
