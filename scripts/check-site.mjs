import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = ["index.html", "styles.css", "app.js", "site-config.js", "server.mjs"];
const contents = await Promise.all(required.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));

const failures = [];
required.forEach((file, index) => {
  if (!contents[index].trim()) failures.push(`${file} is empty`);
});
const html = contents[0];
for (const marker of ["data-repository", "data-download", "id=\"open-source\"", "id=\"industries\""]) {
  if (!html.includes(marker)) failures.push(`index.html is missing ${marker}`);
}
if (/\/(api|socket)\b/i.test(html) || /fetch\s*\(\s*["']\/api\//i.test(contents[2])) {
  failures.push("website must not call the Lumi application backend");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`[check-site] ${required.length} files verified; no Lumi backend dependency found (${root})`);
