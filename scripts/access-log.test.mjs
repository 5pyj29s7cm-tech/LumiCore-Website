import assert from "node:assert/strict";
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync, symlinkSync, truncateSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { createAccessLogger } from "./access-log.mjs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function fixture(t) {
  const workspace = mkdtempSync(join(tmpdir(), "lumicore-access-log-test-"));
  const root = join(workspace, "site");
  mkdirSync(root);
  t.after(() => {
    const target = resolve(workspace);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("lumicore-access-log-test-")) {
      throw new Error("Unexpected test fixture path");
    }
    rmSync(target, { recursive: true, force: true });
  });
  return { workspace, root, logs: join(workspace, "logs") };
}

const entry = overrides => ({ method: "GET", url: "/healthz", status: 200, durationMs: 1.23456, outcome: "completed", ...overrides });
const records = directory => readFileSync(join(directory, "access.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));

test("empty configuration disables logging without accessing the filesystem", () => {
  for (const disabled of [undefined, null, ""]) {
    const log = createAccessLogger(disabled, "a website path that does not exist");
    assert.doesNotThrow(() => log(entry()));
  }
});

test("records bounded structured request metadata without URL credentials, queries or identity headers", t => {
  const { root, logs } = fixture(t);
  const log = createAccessLogger(logs, root);
  log(entry({
    url: "https://private-user:private-password@example.invalid/public%20asset?token=query-secret#fragment-secret",
    cfRay: "0123456789abcdef-SJC",
    headers: { authorization: "authorization-secret", cookie: "cookie-secret", referer: "referrer-secret" },
  }));
  const [record] = records(logs);
  assert.deepEqual(Object.keys(record), ["timestamp", "method", "path", "status", "durationMs", "outcome", "cfRay"]);
  assert.equal(record.path, "/public%20asset");
  assert.equal(record.method, "GET");
  assert.equal(record.status, 200);
  assert.equal(record.durationMs, 1.235);
  assert.equal(record.outcome, "completed");
  assert.equal(record.cfRay, "0123456789abcdef-SJC");
  assert.ok(Number.isFinite(Date.parse(record.timestamp)));
  assert.doesNotMatch(readFileSync(join(logs, "access.jsonl"), "utf8"), /private-user|private-password|example\.invalid|query-secret|fragment-secret|authorization-secret|cookie-secret|referrer-secret/);
  if (process.platform !== "win32") {
    assert.equal(statSync(logs).mode & 0o777, 0o700);
    assert.equal(statSync(join(logs, "access.jsonl")).mode & 0o777, 0o600);
  }
});

test("malformed targets, injection strings and invalid ray IDs cannot create extra records or leak raw URLs", t => {
  const { root, logs } = fixture(t);
  const log = createAccessLogger(logs, root);
  log(entry({ url: "http://[private-credential?token=query-secret", method: "GET\r\nsecret", cfRay: "0123456789abcdef-SJC\r\nsecret", status: 0, durationMs: -1, outcome: "aborted" }));
  log(entry({ url: `/${"a".repeat(20000)}?token=query-secret`, cfRay: ["0123456789abcdef-SJC"] }));
  log(entry({ url: "//private-user:private-password@example.invalid/path?token=query-secret#fragment-secret" }));
  const entries = records(logs);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].path, "[invalid-path]");
  assert.equal(entries[0].method, "INVALID");
  assert.equal(entries[0].status, null);
  assert.equal(entries[0].durationMs, null);
  assert.equal(entries[0].outcome, "aborted");
  assert.equal(entries[0].cfRay, undefined);
  assert.equal(entries[1].path.length, 2048);
  assert.equal(entries[1].cfRay, undefined);
  assert.equal(entries[2].path, "/path");
  assert.doesNotMatch(readFileSync(join(logs, "access.jsonl"), "utf8"), /private-credential|private-user|private-password|query-secret|fragment-secret/);
});

test("logging rejects the website root, nested paths and junctions into it before creating files", t => {
  const { workspace, root } = fixture(t);
  const inside = join(root, "new", "logs");
  for (const path of [root, inside]) {
    assert.throws(() => createAccessLogger(path, root), /Access logging could not be initialized/);
  }
  assert.equal(existsSync(join(root, "new")), false);
  const alias = join(workspace, "site-alias");
  symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => createAccessLogger(join(alias, "logs"), root), /Access logging could not be initialized/);
  assert.equal(existsSync(join(root, "logs")), false);
  // A sibling sharing the site's prefix is outside the root and is valid.
  const sibling = join(workspace, "site-logs");
  createAccessLogger(sibling, root)(entry());
  assert.equal(records(sibling).length, 1);
});

test("invalid directories and log targets fail startup with a generic error", t => {
  const { root, logs, workspace } = fixture(t);
  assert.throws(() => createAccessLogger("relative-private-secret", root), error => {
    assert.doesNotMatch(error.message, /relative-private-secret/);
    return /Access logging could not be initialized/.test(error.message);
  });
  const file = join(workspace, "private-file");
  writeFileSync(file, "unchanged");
  assert.throws(() => createAccessLogger(file, root), /Access logging could not be initialized/);
  mkdirSync(join(logs, "access.jsonl"), { recursive: true });
  assert.throws(() => createAccessLogger(logs, root), /Access logging could not be initialized/);
  assert.equal(readFileSync(file, "utf8"), "unchanged");
});

test("hardlinked log files are refused without modifying their targets", t => {
  const { root, logs, workspace } = fixture(t);
  mkdirSync(logs);
  const target = join(workspace, "private-target");
  writeFileSync(target, "unchanged");
  linkSync(target, join(logs, "access.jsonl"));
  assert.throws(() => createAccessLogger(logs, root), /Access logging could not be initialized/);
  assert.equal(readFileSync(target, "utf8"), "unchanged");
});

test("symlinked active logs and archives are refused without following their targets", t => {
  const { root, logs, workspace } = fixture(t);
  mkdirSync(logs);
  const target = join(workspace, "private-target");
  writeFileSync(target, "unchanged");
  try { symlinkSync(target, join(logs, "access.jsonl"), "file"); }
  catch (error) {
    if (error.code === "EPERM") { t.skip("File symlink creation is unavailable in this environment"); return; }
    throw error;
  }
  assert.throws(() => createAccessLogger(logs, root), /Access logging could not be initialized/);
  unlinkSync(join(logs, "access.jsonl"));
  symlinkSync(target, join(logs, "access.3.jsonl"), "file");
  assert.throws(() => createAccessLogger(logs, root), /Access logging could not be initialized/);
  assert.equal(readFileSync(target, "utf8"), "unchanged");
});

test("rotation retains at most seven 5 MiB files and preserves unrelated files", t => {
  const { root, logs } = fixture(t);
  mkdirSync(logs);
  for (let index = 0; index < 7; index++) {
    const file = join(logs, index ? `access.${index}.jsonl` : "access.jsonl");
    writeFileSync(file, `archive-${index}`);
    truncateSync(file, MAX_FILE_BYTES);
  }
  writeFileSync(join(logs, "unrelated.txt"), "unchanged");
  const log = createAccessLogger(logs, root);
  log(entry());
  assert.equal(records(logs).length, 1);
  assert.equal(readFileSync(join(logs, "access.6.jsonl"), "utf8").slice(0, 9), "archive-5");
  for (let iteration = 0; iteration < 10; iteration++) {
    truncateSync(join(logs, "access.jsonl"), MAX_FILE_BYTES);
    log(entry({ url: `/rotation-${iteration}` }));
    const owned = readdirSync(logs).filter(name => /^access(?:\.[1-6])?\.jsonl$/.test(name));
    assert.equal(owned.length, 7);
    assert.ok(owned.every(name => statSync(join(logs, name)).size <= MAX_FILE_BYTES));
    assert.equal(records(logs)[0].path, `/rotation-${iteration}`);
  }
  assert.equal(readdirSync(logs).length, 8);
  assert.equal(readFileSync(join(logs, "unrelated.txt"), "utf8"), "unchanged");
});

test("runtime write failures do not escape into request handling and report no sensitive paths", t => {
  const { root, logs } = fixture(t);
  const log = createAccessLogger(logs, root);
  unlinkSync(join(logs, "access.jsonl"));
  mkdirSync(join(logs, "access.jsonl"));
  const errors = [];
  t.mock.method(console, "error", message => errors.push(message));
  assert.doesNotThrow(() => log(entry({ url: "/?private-query-secret" })));
  assert.doesNotThrow(() => log(entry()));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /access log write failed/);
  assert.equal(errors[0].includes(logs), false);
  assert.doesNotMatch(errors[0], /private-query-secret/);
});
