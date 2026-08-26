import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const required = ["index.html", "styles.css", "app.js", "site-config.js", "server.mjs"];
const contents = await Promise.all(required.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const failures = [];
required.forEach((file, index) => {
  if (!contents[index].trim()) failures.push(`${file} is empty`);
});
const html = contents[0];
const publicSiteSource = contents.join('\n');
if (packageJson.name !== 'lumicore-website') failures.push('package name must be lumicore-website');
if (!html.includes('LumiCore')) failures.push('public website must present the LumiCore product name');
if (!contents[3].includes('5pyj29s7cm-tech/LumiCore')) failures.push('website repository links must target LumiCore');
if (/LumiOS|Lumi OS|lumi-os/i.test(publicSiteSource)) failures.push('public website still exposes the legacy LumiOS brand');
for (const marker of [
  "data-repository",
  "data-page=\"home\"",
  "data-page=\"ecosystem\"",
  "data-page=\"products\"",
  "data-page=\"industry\"",
  "data-page=\"vision\"",
  "data-page=\"docs\"",
  "data-page=\"contact\"",
  "data-page=\"join\"",
  "data-page=\"product-detail\"",
  "data-client-video",
  "assets/lumi-client-command-center.mp4",
  "id=\"open-source\"",
  "id=\"industry\"",
  "id=\"products\"",
  "id=\"lumi-orb\"",
  "id=\"lumi-ambient\"",
  "DISTRIBUTED INTELLIGENCE",
  "SMART HOST PROGRAM",
  "FOUNDER'S SANCTUARY",
  "全息显示载体",
  "智能桌面台灯",
  "Order 协调主机",
  "隐私保护眼镜",
  "生理健康戒指",
  "AI 毛绒伴侣",
  "桌面手机机器人"
]) {
  if (!html.includes(marker)) failures.push(`index.html is missing ${marker}`);
}
for (const route of ["#/home", "#/ecosystem", "#/products", "#/industry", "#/vision", "#/docs", "#/contact", "#/join"]) {
  if (!html.includes(route)) failures.push(`index.html is missing page route ${route}`);
}
const heroActions = html.match(/<div class="hero-actions hero-entry-actions">([\s\S]*?)<\/div>/)?.[1] || "";
if (!heroActions || heroActions.indexOf("data-repository") > heroActions.indexOf("开发者文档")) {
  failures.push("homepage must present GitHub as the first primary action");
}
if (!contents[2].includes("repositoryApi") || !contents[2].includes("stargazers_count")) {
  failures.push("GitHub star count must continue to update from the repository API");
}
if (!contents[2].includes("hashchange") || !contents[2].includes("data-product-detail")) {
  failures.push("website must preserve page routing and product detail navigation");
}
if (!contents[2].includes("drawAmbient") || !contents[1].includes("ambient-canvas")) {
  failures.push("homepage must preserve the animated ambient background");
}
if (!contents[3].includes("supportEmail") || !contents[3].includes("businessWechat")) {
  failures.push("verified business contact details must remain centrally configured");
}

const expectedProducts = [
  ["全息显示载体", "¥8999", "4K 全息投影", "实时神经合成", "手势交互"],
  ["智能桌面台灯", "¥1299", "视觉追踪", "环境感知", "无级调光"],
  ["Order 协调主机", "¥5999", "L1 神经处理器", "200T AI 算力", "私有化部署"],
  ["隐私保护眼镜", "¥2499", "AR 导航", "隐私滤镜", "超轻量"],
  ["生理健康戒指", "¥1599", "钛合金", "7天续航", "医疗级传感器"],
  ["AI 毛绒伴侣", "¥499", "深度语义理解", "多语言陪练", "情绪监控"],
  ["桌面手机机器人", "¥899", "无线快充", "多模态拟人", "全向追踪"],
];
for (const product of expectedProducts) {
  for (const field of product) {
    if (!html.includes(field)) failures.push(`product catalog is missing ${field}`);
  }
}
if ((html.match(/data-product-id=/g) || []).length !== expectedProducts.length) {
  failures.push(`product catalog must contain exactly ${expectedProducts.length} products`);
}
if (/data-download|releases\.lumiai\.asia|\/releases(?:[\"'#?]|$)/i.test(contents.join("\n"))) {
  failures.push("source-only website must not expose installer or release links");
}
if (/\/(api|socket)\b/i.test(html) || /fetch\s*\(\s*["']\/api\//i.test(contents[2])) {
  failures.push("website must not call the Lumi application backend");
}
if (/data-demo|demo-light-active/.test(contents.join("\n"))) {
  failures.push("legacy fake demo behavior must be removed");
}
for (const asset of ["assets/lumi-client-command-center.mp4", "assets/lumi-client-poster.webp"]) {
  try { await access(new URL(`../${asset}`, import.meta.url)); }
  catch { failures.push(`real client media is missing ${asset}`); }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`[check-site] ${required.length} files verified; no Lumi backend dependency found (${root})`);
