const config = window.LUMI_SITE || {};

const ambientCanvas = document.querySelector("#lumi-ambient");
if (ambientCanvas instanceof HTMLCanvasElement) {
  const ambientContext = ambientCanvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: .72, y: .2, targetX: .72, targetY: .2 };
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let lastFrame = -Infinity;

  const resizeAmbient = () => {
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    ambientCanvas.width = Math.round(width * pixelRatio);
    ambientCanvas.height = Math.round(height * pixelRatio);
    ambientContext?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const lightField = (x, y, radius, stretch, rotation, color) => {
    if (!ambientContext) return;
    ambientContext.save();
    ambientContext.translate(x, y);
    ambientContext.rotate(rotation);
    ambientContext.scale(1, stretch);
    const gradient = ambientContext.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(.42, color.replace(/[\d.]+\)$/, ".08)"));
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ambientContext.fillStyle = gradient;
    ambientContext.beginPath();
    ambientContext.arc(0, 0, radius, 0, Math.PI * 2);
    ambientContext.fill();
    ambientContext.restore();
  };

  const drawAmbient = (time = 0) => {
    if (!ambientContext) return;
    if (!reducedMotion && time - lastFrame < 32) {
      requestAnimationFrame(drawAmbient);
      return;
    }
    lastFrame = time;
    pointer.x += (pointer.targetX - pointer.x) * .025;
    pointer.y += (pointer.targetY - pointer.y) * .025;
    ambientContext.clearRect(0, 0, width, height);
    ambientContext.globalCompositeOperation = "screen";

    const phase = reducedMotion ? 0 : time * .00016;
    const scrollPhase = Math.min(window.scrollY / Math.max(height, 1), 2.5);
    const focusX = width * (pointer.x + Math.sin(phase * 2.1) * .06);
    const focusY = height * (pointer.y + Math.cos(phase * 1.4) * .045) - scrollPhase * 26;
    lightField(focusX, focusY, Math.max(width, height) * .56, .22, -.42 + Math.sin(phase) * .09, "rgba(255,190,112,.19)");
    lightField(width * (.18 + Math.sin(phase * 1.7) * .05), height * .52, Math.max(width, height) * .48, .18, .34, "rgba(102,205,221,.10)");
    lightField(width * (.52 + Math.cos(phase * 1.15) * .09), height * .78, Math.max(width, height) * .42, .14, -.18, "rgba(137,113,255,.065)");

    ambientContext.lineWidth = 1;
    for (let index = 0; index < 5; index += 1) {
      const offset = index * height * .13;
      ambientContext.beginPath();
      ambientContext.moveTo(-width * .12, height * .18 + offset);
      ambientContext.bezierCurveTo(
        width * .22,
        height * (.02 + index * .08 + Math.sin(phase * 2 + index) * .05),
        width * .62,
        height * (.38 + index * .05 + Math.cos(phase * 1.6 + index) * .06),
        width * 1.12,
        height * (.08 + index * .1),
      );
      ambientContext.strokeStyle = index % 2 ? "rgba(255,205,135,.055)" : "rgba(166,218,226,.045)";
      ambientContext.shadowColor = index % 2 ? "rgba(255,183,93,.16)" : "rgba(99,199,220,.12)";
      ambientContext.shadowBlur = 24;
      ambientContext.stroke();
    }
    ambientContext.shadowBlur = 0;

    const gridSize = width < 700 ? 38 : 48;
    const gridTop = height * .08;
    const gridBottom = height * .6;
    for (let y = gridTop; y < gridBottom; y += gridSize) {
      for (let x = gridSize; x < width; x += gridSize) {
        const wave = (Math.sin(x * .012 + y * .009 + phase * 7) + 1) * .5;
        const distance = Math.hypot(x - focusX, y - focusY);
        const focus = Math.max(0, 1 - distance / (width * .56));
        const alpha = .012 + wave * focus * .055;
        ambientContext.fillStyle = `rgba(230,236,244,${alpha})`;
        ambientContext.fillRect(x, y, 1, 1);
      }
    }

    ambientContext.globalCompositeOperation = "source-over";
    if (!reducedMotion) requestAnimationFrame(drawAmbient);
  };

  resizeAmbient();
  window.addEventListener("resize", resizeAmbient, { passive: true });
  window.addEventListener("pointermove", (event) => {
    pointer.targetX = event.clientX / Math.max(window.innerWidth, 1);
    pointer.targetY = event.clientY / Math.max(window.innerHeight, 1);
  }, { passive: true });
  drawAmbient();
}

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
        context.strokeStyle = `rgba(101,220,230,${alpha * .24})`;
        context.lineWidth = .55;
        context.beginPath();
        context.arc(point.sx, point.sy, size, 0, Math.PI * 2);
        context.stroke();
        continue;
      }
      const warm = point.kind === "signal";
      context.fillStyle = warm ? `rgba(255,112,65,${alpha})` : `rgba(255,255,255,${alpha})`;
      if (warm && point.z2 > 80) {
        context.shadowColor = "rgba(255,112,65,.55)";
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
setLinks("[data-contact]", config.contact || config.repository);
document.querySelectorAll("[data-year]").forEach((node) => { node.textContent = new Date().getFullYear(); });
if (config.supportEmail) {
  document.querySelectorAll("[data-support-email]").forEach((node) => {
    node.setAttribute("href", `mailto:${config.supportEmail}?subject=${encodeURIComponent("LumiAI 合作咨询")}`);
  });
  document.querySelectorAll("[data-support-email-text]").forEach((node) => { node.textContent = config.supportEmail; });
}
if (config.businessWechat) {
  document.querySelectorAll("[data-wechat-id]").forEach((node) => { node.textContent = config.businessWechat; });
}

const pages = new Set(["home", "ecosystem", "products", "industry", "vision", "docs", "contact", "join", "product-detail"]);
const pageTitles = {
  home: "LumiAI · 分布式智能，从本地开始",
  ecosystem: "Lumi 生态 · LumiAI",
  products: "多模态产品 · LumiAI",
  industry: "行业方案 · LumiAI",
  vision: "核心愿景 · LumiAI",
  docs: "文档与源码 · LumiAI",
  contact: "合作联系 · LumiAI",
  join: "加入我们 · LumiAI",
  "product-detail": "产品详情 · LumiAI",
};

const routeFromHash = () => {
  const path = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (path[0] === "product" && path[1]) return { page: "product-detail", productId: path[1] };
  return { page: pages.has(path[0]) ? path[0] : "home" };
};

const populateProductDetail = (productId) => {
  const card = document.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);
  const detail = document.querySelector("[data-product-detail]");
  if (!card || !detail) return false;
  const name = card.querySelector("h3")?.textContent?.trim() || "Lumi 产品";
  detail.querySelector("[data-detail-category]").textContent = card.querySelector(".product-meta span")?.textContent || "LUMI PRODUCT";
  detail.querySelector("[data-detail-name]").textContent = name;
  detail.querySelector("[data-detail-description]").textContent = card.querySelector(":scope > p")?.textContent || "";
  detail.querySelector("[data-detail-price]").textContent = card.querySelector(".product-meta strong")?.textContent || "";
  detail.querySelector("[data-detail-specs]").innerHTML = [...card.querySelectorAll("li")].map((item) => `<li>${item.textContent}</li>`).join("");
  const visual = card.querySelector(".product-visual")?.cloneNode(true);
  detail.querySelector("[data-detail-visual]").replaceChildren(...(visual ? [visual] : []));
  document.title = `${name} · LumiAI`;
  return true;
};

const renderRoute = () => {
  let route = routeFromHash();
  if (route.page === "product-detail" && !populateProductDetail(route.productId)) route = { page: "products" };
  document.querySelectorAll("[data-page]").forEach((node) => {
    const active = node.dataset.page === route.page;
    node.hidden = !active;
  });
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    const active = link.dataset.pageLink === route.page || (route.page === "product-detail" && link.dataset.pageLink === "products");
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  if (route.page !== "product-detail") document.title = pageTitles[route.page] || pageTitles.home;
  document.body.dataset.activePage = route.page;
  window.scrollTo({ top: 0, behavior: "instant" });
};

window.addEventListener("hashchange", renderRoute);

document.querySelectorAll("[data-copy-wechat]").forEach((button) => button.addEventListener("click", async () => {
  const status = button.closest(".contact-method")?.querySelector("[data-copy-status]");
  const value = String(config.businessWechat || "").trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "已复制";
    if (status) status.textContent = "微信号已复制到剪贴板";
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    button.textContent = copied ? "已复制" : "复制失败";
    if (status) status.textContent = copied ? "微信号已复制到剪贴板" : `请手动复制：${value}`;
  }
  window.setTimeout(() => { button.textContent = "复制微信号"; }, 1800);
}));

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
}, { threshold: 0.01, rootMargin: "0px 0px 7% 0px" });
document.querySelectorAll(".reveal").forEach((node) => observer.observe(node));

const productGrid = document.querySelector("[data-product-grid]");
const productFilters = document.querySelectorAll("[data-product-filter]");
productFilters.forEach((button) => button.addEventListener("click", () => {
  const category = button.dataset.productFilter;
  productFilters.forEach((item) => item.classList.toggle("active", item === button));
  productGrid?.querySelectorAll("[data-product-category]").forEach((card) => {
    card.hidden = category !== "all" && card.dataset.productCategory !== category;
  });
  const partner = productGrid?.querySelector(".product-partner-card");
  if (partner) partner.hidden = category !== "all";
  productGrid?.animate(
    [{ opacity: .45, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }],
    { duration: 260, easing: "ease-out" },
  );
}));

document.querySelectorAll("[data-product-id]").forEach((card) => {
  const open = () => { window.location.hash = `#/product/${card.dataset.productId}`; };
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  });
});
document.querySelectorAll("[data-product-back]").forEach((button) => button.addEventListener("click", () => {
  window.location.hash = "#/products";
}));

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

if (!window.location.hash || window.location.hash === "#") {
  history.replaceState(null, "", "#/home");
}
renderRoute();
