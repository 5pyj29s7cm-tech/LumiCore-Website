import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve as resolvePath } from "node:path";

let child;
let port;
let fixtureWorkspace;
let fixtureRoot;
const privateFixture = "private regression fixture; never public";
const videoFixture = Buffer.from(Array.from({ length: 1024 }, (_, index) => index % 256));
before(async () => {
  fixtureWorkspace = mkdtempSync(join(tmpdir(), "lumicore-website-http-test-"));
  fixtureRoot = join(fixtureWorkspace, "site");
  mkdirSync(fixtureRoot);
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  for (const file of ["server.mjs", "index.html", "styles.css", "app.js", "site-config.js", "robots.txt", "sitemap.xml"]) {
    copyFileSync(join(sourceRoot, file), join(fixtureRoot, file));
  }
  cpSync(join(sourceRoot, "assets"), join(fixtureRoot, "assets"), { recursive: true });
  writeFileSync(join(fixtureRoot, "assets", "range-test.mp4"), videoFixture);
  writeFileSync(join(fixtureRoot, "assets", "empty-test.mp4"), Buffer.alloc(0));
  // Materialize denied paths so these checks cannot pass merely because a file is absent.
  for (const file of [
    ".git/HEAD", ".git/config", ".cloudflared/private.png", ".cloudflared/private.mp4",
    ".cloudflared/lumi-existing-credentials.json", ".cloudflared/config.yml",
    ".codex-run/test.log", "package.json", "README.md", "scripts/start-production.ps1",
    "cloudflare/config.example.yml", "operations/private.png", "operations/private.mp4",
    "assets/private.json", "assets/private.txt", "assets/private.js", "assets/private.map",
    "assets/private.html", "assets/.private.png", "assets/.private.mp4", "assets/.private/nested.png",
  ]) {
    const target = join(fixtureRoot, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, privateFixture);
  }
  writeFileSync(join(fixtureRoot, "package.json"), '{"private":true,"type":"module"}');
  copyFileSync(join(sourceRoot, "scripts", "access-log.mjs"), join(fixtureRoot, "scripts", "access-log.mjs"));
  // A sibling sharing the root prefix catches incorrect startsWith(root) confinement.
  const siblingRoot = join(fixtureWorkspace, "site-other");
  mkdirSync(siblingRoot);
  writeFileSync(join(siblingRoot, "secret.png"), privateFixture);
  writeFileSync(join(siblingRoot, "secret.mp4"), privateFixture);
  const linkType = process.platform === "win32" ? "junction" : "dir";
  for (const [target, alias] of [
    [join(fixtureRoot, ".cloudflared"), "private-alias"],
    [join(fixtureRoot, "operations"), "operations-alias"],
    [siblingRoot, "external-alias"],
  ]) {
    symlinkSync(target, join(fixtureRoot, "assets", alias), linkType);
  }
  child = spawn(process.execPath, [join(fixtureRoot, "server.mjs")], {
    env: { ...process.env, LUMI_SITE_HOST: "127.0.0.1", LUMI_SITE_PORT: "0", LUMI_SITE_LOG_DIR: "" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Website test server startup timed out")), 10000);
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`Website test server exited: ${code}`)));
    child.stdout.on("data", chunk => {
      const match = String(chunk).match(/127\.0\.0\.1:(\d+)/);
      if (match) { port = Number(match[1]); clearTimeout(timeout); resolve(); }
    });
  });
});
after(async () => {
  if (child && child.exitCode === null) {
    await new Promise(resolve => { child.once("exit", resolve); child.kill(); });
  }
  if (fixtureWorkspace) {
    const target = resolvePath(fixtureWorkspace);
    if (dirname(target) !== resolvePath(tmpdir()) || !basename(target).startsWith("lumicore-website-http-test-")) throw new Error("Unexpected test fixture path");
    rmSync(target, { recursive: true, force: true });
  }
});

function probe(path, method = "GET", headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: bytes.toString("utf8"), bytes });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("public pages, scripts, assets and health remain accessible", async () => {
  for (const path of ["/", "/index.html", "/styles.css", "/app.js", "/site-config.js", "/robots.txt", "/sitemap.xml", "/assets/favicon.svg", "/assets/lumi-client-poster.webp", "/assets/lumi-client-command-center.mp4", "/healthz", "/assets/favicon.svg?v=1", "/site-config.js?v=1"]) {
    const result = await probe(path, "HEAD");
    assert.equal(result.status, 200, path);
    assert.equal(result.body, "", path);
    assert.equal(result.headers["x-content-type-options"], "nosniff");
  }
  assert.match((await probe("/")).body, /LumiCore/);
  assert.deepEqual(JSON.parse((await probe("/healthz")).body), { ok: true, service: "lumicore-website" });
});

test("repository, operational files and credentials stay private", async () => {
  for (const path of ["/.git/HEAD", "/.git/config", "/.cloudflared/lumi-existing-credentials.json", "/.cloudflared/config.yml", "/.codex-run/test.log", "/server.mjs", "/package.json", "/README.md", "/scripts/start-production.ps1", "/scripts/access-log.mjs", "/cloudflare/config.example.yml"]) {
    for (const method of ["GET", "HEAD"]) {
      const result = await probe(path, method);
      assert.equal(result.status, 404, `${method} ${path}`);
      assert.equal(result.body, method === "HEAD" ? "" : "Not Found", `${method} ${path}`);
      assert.equal(result.headers["cache-control"], "no-store");
    }
  }
});

test("encoded paths and Windows path tricks cannot bypass the public allowlist", async () => {
  for (const path of [
    "/%2egit/HEAD", "/.GIT/HEAD", "/%2ecloudflared/lumi-existing-credentials.json",
    "/%252ecloudflared/lumi-existing-credentials.json", "/.cloudflared/lumi-existing-credentials.json?download=1",
    "/assets/%2e%2e/.git/HEAD", "/assets/%2E%2E%2F.git%2FHEAD", "/assets/..%5c.git%5cHEAD",
    "/assets/..\\.git\\HEAD", "/assets/%2eprivate.png", "/assets/.private/nested.png",
    "/site-config.js::$DATA", "/assets/favicon.svg%3a%3a%24DATA", "/index.html.", "/index.html%20",
    "/assets/../../site-other/secret.png", "/assets/missing.png", "/index.html%00.txt",
  ]) {
    for (const method of ["GET", "HEAD"]) {
      assert.equal((await probe(path, method)).status, 404, `${method} ${path}`);
    }
  }
  assert.equal((await probe("/%E0%A4%A")).status, 400);
  assert.equal((await probe("/")).status, 200, "bad requests must not crash the server");
});

test("write methods stay disabled", async () => {
  assert.equal((await probe("/index.html", "POST")).status, 405);
});

test("existing nonpublic and hidden files under assets stay private", async () => {
  for (const path of ["/assets/private.json", "/assets/private.txt", "/assets/private.js", "/assets/private.map", "/assets/private.html", "/assets/.private.png", "/assets/.private/nested.png"]) {
    const result = await probe(path);
    assert.equal(result.status, 404, path);
    assert.equal(result.body, "Not Found", path);
  }
});

test("asset junctions cannot expose private files inside or outside the website root", async () => {
  for (const path of ["/assets/private-alias/private.png", "/assets/operations-alias/private.png", "/assets/external-alias/secret.png"]) {
    for (const method of ["GET", "HEAD"]) {
      const result = await probe(path, method);
      assert.equal(result.status, 404, `${method} ${path}`);
      assert.equal(result.body, method === "HEAD" ? "" : "Not Found", `${method} ${path}`);
      assert.equal(result.headers["cache-control"], "no-store");
    }
  }
});

test("video GET and HEAD advertise the complete length and byte-range support", async () => {
  const full = await probe("/assets/range-test.mp4");
  assert.equal(full.status, 200);
  assert.deepEqual(full.bytes, videoFixture);
  for (const result of [full, await probe("/assets/range-test.mp4", "HEAD")]) {
    assert.equal(result.headers["content-length"], String(videoFixture.length));
    assert.equal(result.headers["accept-ranges"], "bytes");
    assert.equal(result.headers["content-type"], "video/mp4");
    assert.equal(result.headers["content-range"], undefined);
  }
  for (const range of ["bytes=2-5", "bytes=99999-"]) {
    const head = await probe("/assets/range-test.mp4", "HEAD", { Range: range });
    assert.equal(head.status, 200);
    assert.equal(head.headers["content-length"], String(videoFixture.length));
    assert.equal(head.headers["content-range"], undefined);
    assert.equal(head.bytes.length, 0);
  }
});

test("video seeks return exactly the requested prefix, middle, open end or suffix", async () => {
  for (const [range, start, end] of [
    ["bytes=0-0", 0, 0],
    ["bytes=254-260", 254, 260],
    ["bytes=1000-", 1000, 1023],
    ["bytes=-17", 1007, 1023],
    ["bytes=1010-999999999999999999999999", 1010, 1023],
    ["bytes=-999999999999999999999999", 0, 1023],
    ["BYTES=0002-0005", 2, 5],
  ]) {
    const result = await probe("/assets/range-test.mp4?v=seek", "GET", { Range: range });
    assert.equal(result.status, 206, range);
    assert.equal(result.headers["content-range"], `bytes ${start}-${end}/${videoFixture.length}`, range);
    assert.equal(result.headers["content-length"], String(end - start + 1), range);
    assert.equal(result.headers["accept-ranges"], "bytes", range);
    assert.equal(result.headers["content-type"], "video/mp4", range);
    assert.equal(result.headers["x-content-type-options"], "nosniff", range);
    assert.deepEqual(result.bytes, videoFixture.subarray(start, end + 1), range);
  }
});

test("invalid and unsatisfiable video ranges return 416 without file content", async () => {
  for (const range of ["bytes=1024-", "bytes=999999999999999999999999-", "bytes=9-8", "bytes=-0", "bytes=-", "bytes=abc-def", "bytes=0-1oops", "bytes=1.5-2"]) {
    const result = await probe("/assets/range-test.mp4", "GET", { Range: range });
    assert.equal(result.status, 416, range);
    assert.equal(result.headers["content-range"], `bytes */${videoFixture.length}`, range);
    assert.equal(result.headers["content-length"], "0", range);
    assert.equal(result.headers["cache-control"], "no-store", range);
    assert.equal(result.bytes.length, 0, range);
  }
  const empty = await probe("/assets/empty-test.mp4", "GET", { Range: "bytes=0-" });
  assert.equal(empty.status, 416);
  assert.equal(empty.headers["content-range"], "bytes */0");
  assert.equal(empty.bytes.length, 0);
});

test("unsupported or conditional ranges safely fall back to the complete video", async () => {
  for (const headers of [
    { Range: "items=0-1" },
    { Range: "bytes=0-1,4-5" },
    { Range: "bytes=0-1", "If-Range": '"old-video"' },
    { Range: "bytes=0-1", "If-Range": "Sat, 05 Sep 2026 00:00:00 GMT" },
  ]) {
    const result = await probe("/assets/range-test.mp4", "GET", headers);
    assert.equal(result.status, 200);
    assert.equal(result.headers["content-range"], undefined);
    assert.equal(result.headers["content-length"], String(videoFixture.length));
    assert.deepEqual(result.bytes, videoFixture);
  }
});

test("Range requests cannot bypass private-path and junction checks", async () => {
  for (const path of ["/.git/HEAD", "/server.mjs", "/.cloudflared/lumi-existing-credentials.json", "/assets/%2E%2E%2F.git%2FHEAD", "/assets/.private.mp4", "/assets/private-alias/private.mp4", "/assets/operations-alias/private.mp4", "/assets/external-alias/secret.mp4"]) {
    for (const range of ["bytes=0-1", "bytes=999999999-"]) {
      const result = await probe(path, "GET", { Range: range });
      assert.equal(result.status, 404, path);
      assert.equal(result.headers["content-range"], undefined, path);
      assert.equal(result.headers["cache-control"], "no-store", path);
      assert.equal(result.body, "Not Found", path);
    }
  }
});
