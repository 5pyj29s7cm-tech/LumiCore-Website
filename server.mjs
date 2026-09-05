import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccessLogger } from "./scripts/access-log.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.LUMI_SITE_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.LUMI_SITE_PORT || "4173", 10);
const publicFiles = new Set(["index.html", "styles.css", "app.js", "site-config.js", "robots.txt", "sitemap.xml"]);
const publicAssetExtensions = new Set([".svg", ".png", ".webp", ".mp4", ".ico"]);
const canonicalRoot = realpathSync(root);
const accessLog = createAccessLogger(process.env.LUMI_SITE_LOG_DIR, canonicalRoot);

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
  const startedAt = process.hrtime.bigint();
  let logged = false;
  const record = outcome => {
    if (logged) return;
    logged = true;
    // The production Cloudflare connector reaches this server over loopback.
    const viaLocalConnector = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    accessLog({
      method: req.method, url: req.url, status: res.headersSent ? res.statusCode : null,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      cfRay: viaLocalConnector ? req.headers["cf-ray"] : undefined,
      outcome,
    });
  };
  res.once("finish", () => record("completed"));
  res.once("close", () => record("aborted"));

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, "Method Not Allowed");
    return;
  }

  let requestUrl;
  try { requestUrl = new URL(req.url || "/", "http://localhost"); }
  catch { send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request"); return; }
  if (requestUrl.pathname === "/healthz") {
    send(res, 200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify({ ok: true, service: "lumicore-website" }));
    return;
  }

  let decodedPath;
  try { decodedPath = decodeURIComponent(requestUrl.pathname); }
  catch { send(res, 400, { "Content-Type": "text/plain; charset=utf-8" }, "Bad Request"); return; }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const segments = relativePath.split("/");
  const safeSegments = segments.every(segment => segment && !segment.startsWith(".") && !/[\\:\0]/.test(segment));
  const publicAsset = relativePath.startsWith("assets/") && publicAssetExtensions.has(extname(relativePath).toLowerCase());
  if (!safeSegments || (!publicFiles.has(relativePath) && !publicAsset)) {
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, "Not Found");
    return;
  }

  let filePath;
  try {
    filePath = realpathSync(resolve(root, relativePath));
    // Resolve symlinks/junctions too: public assets cannot expose sibling files.
    if (!filePath.startsWith(`${canonicalRoot}${sep}`) || !statSync(filePath).isFile()) throw new Error("Not a public file");
    const resolvedRelative = filePath.slice(canonicalRoot.length + 1).split(sep).join("/");
    const resolvedSegments = resolvedRelative.split("/");
    const resolvedPublicAsset = resolvedRelative.startsWith("assets/")
      && resolvedSegments.every(segment => segment && !segment.startsWith("."))
      && publicAssetExtensions.has(extname(resolvedRelative).toLowerCase());
    if (publicAsset ? !resolvedPublicAsset : resolvedRelative !== relativePath) throw new Error("Not a public target");
  } catch {
    send(res, 404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, "Not Found");
    return;
  }

  const type = mime.get(extname(filePath).toLowerCase()) || "application/octet-stream";
  const cache = filePath.endsWith("index.html") || filePath.endsWith("site-config.js") ? "no-cache" : "public, max-age=3600";
  res.writeHead(200, { ...commonHeaders, "Content-Type": type, "Cache-Control": cache });
  if (req.method === "HEAD") { res.end(); return; }
  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
});

server.listen(port, host, () => {
  console.log(`[lumicore-website] listening on http://${host}:${server.address().port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
