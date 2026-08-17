const config = window.LUMI_SITE || {};

const orb = document.querySelector("#lumi-orb");
if (orb instanceof HTMLCanvasElement) {
  const context = orb.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: 0, y: 0, down: false };
  const rotation = { x: -0.18, y: 0 };
  const particleCount = reducedMotion ? 420 : 920;
  const points = Array.from({ length: particleCount }, (_, index) => {
    const u = Math.random();
    const v = Math.random();
    const theta = Math.PI * 2 * u;
    const phi = Math.acos(2 * v - 1);
    const radius = Math.cbrt(Math.random()) * 182;
    const kind = index % 10 < 4 ? "signal" : index % 10 < 8 ? "core" : "void";
    return {
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
      size: .55 + Math.random() * 1.25,
      kind,
    };
  });

  const position = (event) => {
    const source = event.touches?.[0] || event;
    return { x: source.clientX, y: source.clientY };
  };
  const startDrag = (event) => {
    Object.assign(pointer, position(event), { down: true });
    orb.setPointerCapture?.(event.pointerId);
  };
  const drag = (event) => {
    if (!pointer.down) return;
    const next = position(event);
    rotation.y += (next.x - pointer.x) * .008;
    rotation.x -= (next.y - pointer.y) * .008;
    Object.assign(pointer, next);
  };
  const endDrag = () => { pointer.down = false; };
  orb.addEventListener("pointerdown", startDrag);
  orb.addEventListener("pointermove", drag);
  orb.addEventListener("pointerup", endDrag);
  orb.addEventListener("pointercancel", endDrag);

  const draw = (time = 0) => {
    if (!context) return;
    const width = orb.width;
    const height = orb.height;
    const centerX = width / 2;
    const centerY = height / 2;
    context.clearRect(0, 0, width, height);
    if (!pointer.down && !reducedMotion) {
      rotation.y += .0024;
      rotation.x += .00055;
    }
    const sinX = Math.sin(rotation.x);
    const cosX = Math.cos(rotation.x);
    const sinY = Math.sin(rotation.y);
    const cosY = Math.cos(rotation.y);
    const pulse = reducedMotion ? 0 : Math.sin(time * .0017) * 5;
    const projected = points.map((point) => {
      const y1 = point.y * cosX - point.z * sinX;
      const z1 = point.y * sinX + point.z * cosX;
      const x2 = point.x * cosY + z1 * sinY;
      const z2 = -point.x * sinY + z1 * cosY;
      const length = Math.hypot(point.x, point.y, point.z) || 1;
      const wave = 1 + pulse / length;
      const perspective = 520 / (520 - z2);
      return { ...point, sx: centerX + x2 * wave * perspective, sy: centerY + y1 * wave * perspective, z2, perspective };
    }).sort((a, b) => a.z2 - b.z2);

    for (const point of projected) {
      const alpha = Math.max(.12, Math.min(.92, .34 + point.perspective * .38));
      const size = Math.max(.45, point.size * point.perspective);
      if (point.kind === "void") {
        context.strokeStyle = `rgba(255,255,255,${alpha * .25})`;
        context.lineWidth = .55;
        context.beginPath();
        context.arc(point.sx, point.sy, size, 0, Math.PI * 2);
        context.stroke();
        continue;
      }
      const warm = point.kind === "signal";
      context.fillStyle = warm ? `rgba(255,77,77,${alpha})` : `rgba(255,255,255,${alpha})`;
      if (warm && point.z2 > 80) {
        context.shadowColor = "rgba(255,77,77,.55)";
        context.shadowBlur = 5;
      }
      context.beginPath();
      context.arc(point.sx, point.sy, size, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    }
    if (!reducedMotion) requestAnimationFrame(draw);
  };
  draw();
}

const setLinks = (selector, value) => {
  if (!value) return;
  document.querySelectorAll(selector).forEach((node) => node.setAttribute("href", value));
};

setLinks("[data-repository]", config.repository);
setLinks("[data-download]", config.download || config.releases);
setLinks("[data-contact]", config.contact || config.repository);
document.querySelectorAll("[data-year]").forEach((node) => { node.textContent = new Date().getFullYear(); });

const header = document.querySelector("[data-header]");
const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 20);
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

const menuButton = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("[data-menu]");
menuButton?.addEventListener("click", () => {
  const open = menu?.classList.toggle("open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
});
menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  menu.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
}));

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("visible");
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));

const editions = {
  commerce: {
    kicker: "COMMERCE",
    title: "从今日经营到内容客服，一条链完成。",
    description: "围绕店铺日常经营组织数据、商品、内容和客服工作；涉及改价、上下架与外发时保留人工确认。",
    workflow: ["今日经营", "爆款雷达", "店铺数据", "商品管理", "内容与客服"]
  },
  design: {
    kicker: "INTERIOR DESIGN",
    title: "从新建设计项目开始，贯通方案与交付。",
    description: "项目资料、CAD 方案、效果图、提案 PPT 和交付核验共享同一上下文，避免每一步重新猜测任务对象。",
    workflow: ["设计项目", "CAD 方案", "效果图", "提案 PPT", "交付中心"]
  },
  legal: {
    kicker: "LEGAL",
    title: "让案件材料、检索、文书与核验持续关联。",
    description: "服务律师的案件工作台，支持文书草稿、合同审查、法条类案和财产线索流程；关键结论保留依据和人工复核。",
    workflow: ["案件工作台", "文书生成", "合同审查", "法条与类案", "财产线索", "交付核验"]
  },
  finance: {
    kicker: "FINANCE & TAX",
    title: "把经营数据转化为可追溯的财税工作流。",
    description: "围绕票税、账务、申报、资金风险和报表交付组织任务；申报与外部提交在最后一步严格确认。",
    workflow: ["经营看板", "票税管理", "账务处理", "税务申报", "资金与风险", "报表交付"]
  }
};

const stage = document.querySelector("[data-edition-stage]");
document.querySelectorAll("[data-edition]").forEach((button) => button.addEventListener("click", () => {
  const value = editions[button.dataset.edition];
  if (!value || !stage) return;
  document.querySelectorAll("[data-edition]").forEach((item) => item.classList.toggle("active", item === button));
  stage.animate([{ opacity: .45, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
  stage.querySelector("[data-edition-kicker]").textContent = value.kicker;
  stage.querySelector("[data-edition-title]").textContent = value.title;
  stage.querySelector("[data-edition-description]").textContent = value.description;
  stage.querySelector("[data-edition-workflow]").innerHTML = value.workflow.map((item, index) => `${index ? "<i>→</i>" : ""}<span>${item}</span>`).join("");
}));

if (config.repositoryApi) {
  fetch(config.repositoryApi, { headers: { Accept: "application/vnd.github+json" } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
    .then((repo) => {
      const stars = Number(repo.stargazers_count);
      if (!Number.isFinite(stars)) return;
      document.querySelectorAll("[data-star-count]").forEach((node) => { node.textContent = stars.toLocaleString("zh-CN"); });
    })
    .catch(() => {
      document.querySelectorAll("[data-star-count]").forEach((node) => { node.textContent = Number(config.fallbackStars || 0).toLocaleString("zh-CN"); });
    });
}
