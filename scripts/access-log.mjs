import {
  appendFileSync, closeSync, constants, fchmodSync, fstatSync, lstatSync,
  mkdirSync, openSync, realpathSync, renameSync, unlinkSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const RETAINED_FILES = 7;
const MAX_PATH_LENGTH = 2048;

function isWithin(root, candidate) {
  const remainder = relative(root, candidate);
  return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." && !remainder.startsWith(`..${sep}`));
}

function privateDirectory(logDirectory, websiteRoot) {
  if (typeof logDirectory !== "string" || !isAbsolute(logDirectory)) throw new Error("Invalid directory");
  const root = realpathSync(websiteRoot);
  let ancestor = resolve(logDirectory);
  const missing = [];
  // Check the canonical destination before creating any directories. This also
  // catches existing junctions/symlinks leading back into the website root.
  for (;;) {
    try { ancestor = realpathSync(ancestor); break; }
    catch (error) {
      if (error.code !== "ENOENT" || dirname(ancestor) === ancestor) throw error;
      missing.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
  const destination = resolve(ancestor, ...missing);
  if (isWithin(root, destination)) throw new Error("Public directory");
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const canonical = realpathSync(destination);
  if (isWithin(root, canonical) || !lstatSync(canonical).isDirectory()) throw new Error("Invalid directory");
  return canonical;
}

function inspectFile(file) {
  let info;
  try { info = lstatSync(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_FILE_BYTES) {
    throw new Error("Unsafe log file");
  }
  return info;
}

function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}

function openLog(file) {
  const before = inspectFile(file);
  const flags = constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW || 0)
    | (before ? 0 : constants.O_CREAT | constants.O_EXCL);
  const fd = openSync(file, flags, 0o600);
  try {
    const opened = fstatSync(fd);
    const after = inspectFile(file);
    if (!opened.isFile() || opened.nlink !== 1 || !after || !sameFile(opened, after)
      || (before && !sameFile(before, opened))) throw new Error("Log file changed");
    if (process.platform !== "win32") fchmodSync(fd, 0o600);
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

function requestPath(url) {
  if (typeof url !== "string") return "/";
  try {
    // URL parsing strips authority credentials; never fall back to the raw URL.
    // Keep percent encoding, and discard query strings/fragments before parsing.
    const delimiter = url.search(/[?#]/);
    const target = (delimiter < 0 ? url : url.slice(0, delimiter)).slice(0, 16384);
    return new URL(target, "http://localhost").pathname.slice(0, MAX_PATH_LENGTH);
  } catch { return "[invalid-path]"; }
}

/** A single-writer JSONL logger; empty configuration disables all filesystem work. */
export function createAccessLogger(logDirectory, websiteRoot) {
  if (logDirectory === undefined || logDirectory === null || logDirectory === "") return () => {};
  let files;
  try {
    const directory = privateDirectory(logDirectory, websiteRoot);
    files = Array.from({ length: RETAINED_FILES }, (_, index) => join(directory, index ? `access.${index}.jsonl` : "access.jsonl"));
    files.forEach(inspectFile);
    closeSync(openLog(files[0]));
  } catch {
    // Do not print supplied directory names or underlying filesystem errors.
    throw new Error("Access logging could not be initialized; check the private log directory.");
  }

  let writeErrorReported = false;
  return entry => {
    let fd;
    try {
      const record = {
        timestamp: new Date().toISOString(),
        method: typeof entry.method === "string" && /^[A-Z]{1,32}$/.test(entry.method) ? entry.method : "INVALID",
        path: requestPath(entry.url),
        status: Number.isInteger(entry.status) && entry.status >= 100 && entry.status <= 599 ? entry.status : null,
        durationMs: Number.isFinite(entry.durationMs) && entry.durationMs >= 0 ? Math.round(entry.durationMs * 1000) / 1000 : null,
        outcome: entry.outcome === "completed" ? "completed" : "aborted",
      };
      if (typeof entry.cfRay === "string" && /^[a-f0-9]{16}(?:-[A-Z]{3})?$/.test(entry.cfRay)) record.cfRay = entry.cfRay;
      const line = `${JSON.stringify(record)}\n`;
      const bytes = Buffer.byteLength(line);
      fd = openLog(files[0]);
      if (fstatSync(fd).size + bytes > MAX_FILE_BYTES) {
        closeSync(fd); fd = undefined;
        // Refuse links/non-files before touching any archive. Only these seven
        // fixed names are owned by the logger; unrelated files are never removed.
        const present = files.map(inspectFile);
        if (present.at(-1)) unlinkSync(files.at(-1));
        for (let index = files.length - 2; index >= 0; index--) {
          if (present[index]) renameSync(files[index], files[index + 1]);
        }
        fd = openLog(files[0]);
      }
      appendFileSync(fd, line, "utf8");
    } catch {
      if (!writeErrorReported) {
        writeErrorReported = true;
        try { console.error("[lumicore-website] access log write failed; check the private log directory."); } catch {}
      }
    } finally {
      if (fd !== undefined) { try { closeSync(fd); } catch {} }
    }
  };
}
