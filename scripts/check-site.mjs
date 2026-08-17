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
for (const marker of [
  "data-repository",
  "id=\"open-source\"",
  "id=\"industry\"",
  "id=\"products\"",
  "id=\"lumi-orb\"",
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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`[check-site] ${required.length} files verified; no Lumi backend dependency found (${root})`);
