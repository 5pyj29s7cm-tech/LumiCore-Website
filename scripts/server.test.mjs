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
let fixtureRoot;
before(async () => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "lumicore-website-http-test-"));
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  for (const file of ["server.mjs", "index.html", "styles.css", "app.js", "site-config.js", "robots.txt", "sitemap.xml"]) {
    copyFileSync(join(sourceRoot, file), join(fixtureRoot, file));
  }
  cpSync(join(sourceRoot, "assets"), join(fixtureRoot, "assets"), { recursive: true });
  mkdirSync(join(fixtureRoot, ".cloudflared"));
  writeFileSync(join(fixtureRoot, ".cloudflared", "private.png"), "private test fixture");
  writeFileSync(join(fixtureRoot, ".cloudflared", "lumi-existing-credentials.json"), '{"test":"private fixture"}');
  symlinkSync(join(fixtureRoot, ".cloudflared"), join(fixtureRoot, "assets", "private-alias"), process.platform === "win32" ? "junction" : "dir");
  child = spawn(process.execPath, [join(fixtureRoot, "server.mjs")], {
    env: { ...process.env, LUMI_SITE_HOST: "127.0.0.1", LUMI_SITE_PORT: "0" },
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
  if (fixtureRoot) {
    const target = resolvePath(fixtureRoot);
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
  for (const path of ["/", "/index.html", "/styles.css", "/app.js", "/site-config.js", "/robots.txt", "/sitemap.xml", "/assets/favicon.svg", "/assets/lumi-client-poster.webp", "/assets/lumi-client-command-center.mp4", "/healthz"]) {
    const result = await probe(path, "HEAD");
    assert.equal(result.status, 200, path);
    assert.equal(result.body, "", path);
    assert.equal(result.headers["x-content-type-options"], "nosniff");
  }
  assert.match((await probe("/")).body, /LumiCore/);
  assert.deepEqual(JSON.parse((await probe("/healthz")).body), { ok: true, service: "lumicore-website" });
});

test("repository, operational files and credentials stay private", async () => {
  for (const path of ["/.git/HEAD", "/.git/config", "/.cloudflared/lumi-existing-credentials.json", "/.cloudflared/config.yml", "/.codex-run/test.log", "/server.mjs", "/package.json", "/README.md", "/scripts/start-production.ps1", "/cloudflare/config.example.yml"]) {
    const result = await probe(path);
    assert.equal(result.status, 404, path);
    assert.equal(result.body, "Not Found", path);
    assert.equal(result.headers["cache-control"], "no-store");
  }
});

test("encoded paths and Windows path tricks cannot bypass the public allowlist", async () => {
  for (const path of ["/%2egit/HEAD", "/%2ecloudflared/lumi-existing-credentials.json", "/assets/%2e%2e/.git/HEAD", "/assets/..%5c.git%5cHEAD", "/assets/%2eprivate.png", "/site-config.js::$DATA", "/assets/../../LumiCore-Website-other/secret.png", "/assets/missing.png", "/index.html%00.txt"]) {
    assert.equal((await probe(path)).status, 404, path);
  }
  assert.equal((await probe("/%E0%A4%A")).status, 400);
  assert.equal((await probe("/")).status, 200, "bad requests must not crash the server");
});

test("write methods stay disabled", async () => {
  assert.equal((await probe("/index.html", "POST")).status, 405);
});

test("an asset junction cannot expose a private file inside the website root", async () => {
  const result = await probe("/assets/private-alias/private.png");
  assert.equal(result.status, 404);
  assert.equal(result.body, "Not Found");
});
