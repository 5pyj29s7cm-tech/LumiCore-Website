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
before(async () => {
  fixtureWorkspace = mkdtempSync(join(tmpdir(), "lumicore-website-http-test-"));
  fixtureRoot = join(fixtureWorkspace, "site");
  mkdirSync(fixtureRoot);
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  for (const file of ["server.mjs", "index.html", "styles.css", "app.js", "site-config.js", "robots.txt", "sitemap.xml"]) {
    copyFileSync(join(sourceRoot, file), join(fixtureRoot, file));
  }
  cpSync(join(sourceRoot, "assets"), join(fixtureRoot, "assets"), { recursive: true });
  // Materialize denied paths so these checks cannot pass merely because a file is absent.
  for (const file of [
    ".git/HEAD", ".git/config", ".cloudflared/private.png",
    ".cloudflared/lumi-existing-credentials.json", ".cloudflared/config.yml",
    ".codex-run/test.log", "package.json", "README.md", "scripts/start-production.ps1",
    "cloudflare/config.example.yml", "operations/private.png",
    "assets/private.json", "assets/private.txt", "assets/private.js", "assets/private.map",
    "assets/private.html", "assets/.private.png", "assets/.private/nested.png",
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

function probe(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method }, res => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
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
