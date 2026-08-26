import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.LUMI_SITE_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.LUMI_SITE_PORT || "4173", 10);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".mp4", "video/mp4"],
  [".ico", "image/x-icon"]
]);

const commonHeaders = {
  "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Resource-Policy": "same-origin"
};

function send(res, status, headers, body) {
  res.writeHead(status, { ...commonHeaders, ...headers });
  res.end(body);
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, "Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/healthz") {
    send(res, 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify({ ok: true, service: "lumicore-website" }));
    return;
  }

  let decodedPath;
  try { decodedPath = decodeURIComponent(requestUrl.pathname); }
  catch { send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request"); return; }

  const relativePath = decodedPath === "/" ? "index.html" : normalize(decodedPath).replace(/^([/\\])+/, "");
  const filePath = resolve(join(root, relativePath));
  if (!filePath.startsWith(resolve(root)) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, "Not Found");
    return;
  }

  const type = mime.get(extname(filePath).toLowerCase()) || "application/octet-stream";
  const cache = filePath.endsWith("index.html") || filePath.endsWith("site-config.js") ? "no-cache" : "public, max-age=3600";
  res.writeHead(200, { ...commonHeaders, "Content-Type": type, "Cache-Control": cache });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(filePath).pipe(res);
});

server.listen(port, host, () => {
  console.log(`[lumicore-website] listening on http://${host}:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
