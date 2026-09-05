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

function parseByteRange(header, size) {
  // Unsupported units and multipart requests fall back to the full file.
  if (!/^bytes=/i.test(header) || header.includes(",")) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;

  // Range positions can exceed JS's safe integer limit. Bound them before
  // converting back to the numeric offsets accepted by createReadStream.
  const length = BigInt(size);
  let start;
  let end = length - 1n;
  if (match[1]) {
    start = BigInt(match[1]);
    const requestedEnd = match[2] ? BigInt(match[2]) : end;
    if (start >= length || requestedEnd < start) return null;
    if (requestedEnd < end) end = requestedEnd;
  } else {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return null;
    start = suffix < length ? length - suffix : 0n;
  }
  return { start: Number(start), end: Number(end) };
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
  let fileSize;
  try {
    filePath = realpathSync(resolve(root, relativePath));
    // Resolve symlinks/junctions too: public assets cannot expose sibling files.
    if (!filePath.startsWith(`${canonicalRoot}${sep}`)) throw new Error("Not a public file");
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) throw new Error("Not a public file");
    fileSize = fileStat.size;
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
  const headers = { "Content-Type": type, "Cache-Control": cache, "Content-Length": fileSize };
  const isVideo = type === "video/mp4";
  if (isVideo) headers["Accept-Ranges"] = "bytes";
  // HEAD describes the full representation and must ignore Range. We publish
  // no validators, so If-Range cannot match and also requires a full response.
  const range = isVideo && req.method === "GET" && req.headers.range && req.headers["if-range"] === undefined
    ? parseByteRange(req.headers.range, fileSize)
    : undefined;
  if (range === null) {
    send(res, 416, { ...headers, "Cache-Control": "no-store", "Content-Range": `bytes */${fileSize}`, "Content-Length": 0 });
    return;
  }
  if (range) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${fileSize}`;
    headers["Content-Length"] = range.end - range.start + 1;
  }
  res.writeHead(range ? 206 : 200, { ...commonHeaders, ...headers });
  if (req.method === "HEAD") { res.end(); return; }
  const stream = createReadStream(filePath, range);
  stream.on("error", () => res.destroy());
  res.once("close", () => stream.destroy());
  stream.pipe(res);
});

server.listen(port, host, () => {
  console.log(`[lumicore-website] listening on http://${host}:${server.address().port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
