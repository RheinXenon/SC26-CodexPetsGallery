import {
  normalizeSpriteGrid,
  resolveSpriteLayout,
  validateSpriteGrid,
} from "./sprite-format.js";

const DEFAULT_CONFIG = {
  repository: "RheinXenon/SC26-CodexPetsGallery",
  pageTitle: "SC26 宠物画廊",
  eventName: "SummerCamp 2026",
};

const ACCENTS = ["#f2c84b", "#4e9a72", "#df6b52", "#5c84b8"];
const PAGE_SIZE = 40;
const EAGER_POSTER_COUNT = 6;
const FULL_IMAGE_CACHE_LIMIT = 4;
const fullSpriteImages = new Map();
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let detailAnimator = null;
let allPets = [];
let filteredPets = [];
let currentPage = 1;
let activeCardPreviews = [];

const elements = {
  pageTitle: document.querySelector("#page-title"),
  eventName: document.querySelector("#event-name"),
  submitLink: document.querySelector("#submit-link"),
  submissionCount: document.querySelector("#submission-count"),
  gallery: document.querySelector("#gallery"),
  galleryTools: document.querySelector("#gallery-tools"),
  gallerySearch: document.querySelector("#gallery-search"),
  resultSummary: document.querySelector("#result-summary"),
  emptyResults: document.querySelector("#empty-results"),
  pagination: document.querySelector("#pagination"),
  previousPage: document.querySelector("#previous-page"),
  nextPage: document.querySelector("#next-page"),
  pageNumbers: document.querySelector("#page-numbers"),
  statusMessage: document.querySelector("#status-message"),
  statusText: document.querySelector("#status-text"),
  updatedAt: document.querySelector("#updated-at"),
  cardTemplate: document.querySelector("#pet-card-template"),
  dialog: document.querySelector("#detail-dialog"),
  dialogClose: document.querySelector("#dialog-close"),
  detailPreview: document.querySelector("#detail-preview"),
  stateViewer: document.querySelector("#state-viewer"),
  stateList: document.querySelector("#state-list"),
  activeStateName: document.querySelector("#active-state-name"),
  activeStateCount: document.querySelector("#active-state-count"),
  activeStateDescription: document.querySelector("#active-state-description"),
  detailKind: document.querySelector("#detail-kind"),
  detailTitle: document.querySelector("#detail-title"),
  detailAuthor: document.querySelector("#detail-author"),
  detailDescription: document.querySelector("#detail-description"),
  detailLinks: document.querySelector("#detail-links"),
};

async function fetchJson(url, { optional = false } = {}) {
  const response = await fetch(url, { cache: "no-store" });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function safeExternalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === "https:" || url.origin === window.location.origin) return url.href;
  } catch {
    // Invalid URLs are omitted from the detail view.
  }
  return null;
}

function requestImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`无法加载精灵图：${url}`)), { once: true });
    image.src = url;
  });
}

function loadSpriteImage(url) {
  if (fullSpriteImages.has(url)) {
    const request = fullSpriteImages.get(url);
    fullSpriteImages.delete(url);
    fullSpriteImages.set(url, request);
    return request;
  }

  const request = requestImage(url).catch((error) => {
    fullSpriteImages.delete(url);
    throw error;
  });
  fullSpriteImages.set(url, request);
  while (fullSpriteImages.size > FULL_IMAGE_CACHE_LIMIT) {
    fullSpriteImages.delete(fullSpriteImages.keys().next().value);
  }
  return request;
}

function getFrameSize(image, grid) {
  const layout = resolveSpriteLayout(image, grid);
  return {
    width: layout.frameWidth,
    height: layout.frameHeight,
  };
}

function drawSpriteFrame(context, image, grid, state, frameIndex) {
  const frame = getFrameSize(image, grid);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    image,
    frame.width * frameIndex,
    frame.height * state.row,
    frame.width,
    frame.height,
    0,
    0,
    context.canvas.width,
    context.canvas.height,
  );
}

class SpriteAnimator {
  constructor({ canvas, url, grid, state, onReady, onError, imageLoader = loadSpriteImage }) {
    this.canvas = canvas;
    this.url = url;
    this.grid = grid;
    this.state = state;
    this.onReady = onReady;
    this.onError = onError;
    this.imageLoader = imageLoader;
    this.frameIndex = 0;
    this.lastFrameAt = 0;
    this.animationFrame = null;
    this.destroyed = false;
    this.image = null;
    this.tick = this.tick.bind(this);
    this.load();
  }

  async load() {
    try {
      this.image = await this.imageLoader(this.url);
      if (this.destroyed) return;

      const frame = getFrameSize(this.image, this.grid);
      if (frame.width < 1 || frame.height < 1) throw new Error("精灵图尺寸无效");
      this.canvas.width = frame.width;
      this.canvas.height = frame.height;
      this.draw();
      this.onReady?.();
      if (!reduceMotion) this.animationFrame = requestAnimationFrame(this.tick);
    } catch (error) {
      if (!this.destroyed) this.onError?.(error);
    }
  }

  tick(timestamp) {
    if (this.destroyed) return;
    if (!this.lastFrameAt) this.lastFrameAt = timestamp;

    const duration = Number(this.state.frameDuration);
    if (timestamp - this.lastFrameAt >= duration) {
      const elapsedFrames = Math.floor((timestamp - this.lastFrameAt) / duration);
      this.frameIndex = (this.frameIndex + elapsedFrames) % this.state.frames;
      this.lastFrameAt += elapsedFrames * duration;
      this.draw();
    }
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  draw() {
    if (!this.image) return;
    drawSpriteFrame(this.canvas.getContext("2d"), this.image, this.grid, this.state, this.frameIndex);
  }

  setState(state) {
    this.state = state;
    this.frameIndex = 0;
    this.lastFrameAt = performance.now();
    this.canvas.setAttribute("aria-label", `${state.label}状态动画`);
    this.draw();
  }

  destroy() {
    this.destroyed = true;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.image = null;
  }
}

async function loadConfig() {
  return (await fetchJson("gallery.config.json", { optional: true })) ?? DEFAULT_CONFIG;
}

async function loadExamples() {
  const [ids, previewData] = await Promise.all([
    fetchJson("examples/manifest.json"),
    fetchJson("previews.json", { optional: true }).catch(() => null),
  ]);
  const examples = await Promise.all(
    ids.map(async (id, index) => {
      const pet = await fetchJson(`examples/${encodeURIComponent(id)}/pet.json`);
      const spriteGrid = normalizeSpriteGrid(pet.spriteGrid);
      if (!validateSpriteGrid(spriteGrid)) {
        throw new Error(`${pet.id || id} 的精灵图配置无效`);
      }
      return {
        kind: "example",
        id: pet.id,
        petName: pet.displayName,
        nickname: "SC26 示例",
        description: pet.description,
        spriteUrl: `examples/${encodeURIComponent(id)}/${pet.spritesheetPath}`,
        ...(previewData?.examples?.[id] ?? {}),
        configUrl: `examples/${encodeURIComponent(id)}/pet.json`,
        spriteGrid,
        accent: ACCENTS[index % ACCENTS.length],
      };
    }),
  );
  return examples;
}

async function loadSubmissions() {
  const data = await fetchJson("pets.json");
  if (!Array.isArray(data.pets)) throw new Error("pets.json 格式无效");

  return {
    generatedAt: data.generatedAt,
    pets: data.pets.map((pet, index) => {
      const spriteGrid = normalizeSpriteGrid(pet.spriteGrid);
      if (!validateSpriteGrid(spriteGrid) || !pet.spritesheetUrl) {
        throw new Error(`投稿 #${pet.issueNumber} 的宠物数据无效`);
      }
      return {
        ...pet,
        kind: "submission",
        id: `issue-${pet.issueNumber}`,
        spriteUrl: pet.spritesheetUrl,
        spriteGrid,
        accent: ACCENTS[(index + 3) % ACCENTS.length],
      };
    }),
  };
}

function markBroken(target) {
  target.replaceChildren();
  target.classList.add("broken-image");
  const message = document.createElement("span");
  message.textContent = "图片暂时无法显示";
  target.append(message);
}

function getDefaultState(pet) {
  const states = pet.spriteGrid.states;
  return states.find((state) => state.id === pet.spriteGrid.defaultState) ?? states[0];
}

function renderSpritePreview(pet, target, state = getDefaultState(pet)) {
  target.replaceChildren();
  target.classList.remove("broken-image");
  target.style.setProperty("--preview-accent", pet.accent);

  const imageUrl = safeExternalUrl(pet.spriteUrl);
  if (!imageUrl) {
    markBroken(target);
    return null;
  }

  const canvas = document.createElement("canvas");
  const loading = document.createElement("span");
  canvas.className = "sprite-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${pet.petName} 的${state.label}状态动画`);
  canvas.textContent = `${pet.petName} 的${state.label}状态动画`;
  loading.className = "preview-loading";
  loading.textContent = "正在加载动画…";
  target.append(canvas, loading);

  return new SpriteAnimator({
    canvas,
    url: imageUrl,
    grid: pet.spriteGrid,
    state,
    onReady: () => loading.remove(),
    onError: () => markBroken(target),
  });
}

const cardPreviewObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const controller = entry.target.cardPreviewController;
    if (entry.isIntersecting) controller?.activate();
    else controller?.deactivate();
  }
}, { rootMargin: "240px 0px", threshold: 0.01 });

function createCardPreview(pet, target, { eager = false } = {}) {
  target.replaceChildren();
  target.classList.remove("broken-image", "is-animated");
  target.style.setProperty("--preview-accent", pet.accent);

  const posterUrl = safeExternalUrl(pet.posterUrl);
  const mediaStage = document.createElement("span");
  const poster = document.createElement("img");
  const fallback = document.createElement("span");
  mediaStage.className = "preview-media-stage";
  poster.alt = `${pet.petName} 的预览`;
  poster.width = 192;
  poster.height = 208;
  poster.loading = eager ? "eager" : "lazy";
  poster.decoding = "async";
  fallback.className = "preview-loading";
  fallback.textContent = "预览暂时无法显示";
  fallback.hidden = true;
  if (posterUrl) poster.src = posterUrl;
  else fallback.hidden = false;
  poster.addEventListener("error", () => {
    poster.hidden = true;
    fallback.hidden = false;
  }, { once: true });
  mediaStage.append(poster);
  target.append(mediaStage, fallback);

  let animator = null;
  let canvas = null;
  const previewUrl = safeExternalUrl(pet.previewUrl);
  const state = getDefaultState(pet);
  const controller = {
    activate() {
      if (reduceMotion || animator || !previewUrl) return;
      canvas = document.createElement("canvas");
      canvas.className = "sprite-canvas";
      canvas.width = Number(pet.previewFrameWidth) || 96;
      canvas.height = Number(pet.previewFrameHeight) || 104;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `${pet.petName} 的${state.label}状态动画`);
      mediaStage.append(canvas);
      animator = new SpriteAnimator({
        canvas,
        url: previewUrl,
        grid: {
          columns: state.frames,
          rows: 1,
          defaultState: state.id,
          states: [{ ...state, row: 0 }],
        },
        state: { ...state, row: 0 },
        imageLoader: requestImage,
        onReady: () => {
          fallback.hidden = true;
          target.classList.add("is-animated");
        },
        onError: () => {
          animator?.destroy();
          animator = null;
          canvas?.remove();
          canvas = null;
        },
      });
    },
    deactivate() {
      animator?.destroy();
      animator = null;
      canvas?.remove();
      canvas = null;
      target.classList.remove("is-animated");
    },
    destroy() {
      cardPreviewObserver.unobserve(target);
      this.deactivate();
      delete target.cardPreviewController;
    },
  };
  target.cardPreviewController = controller;
  cardPreviewObserver.observe(target);
  return controller;
}

function renderCard(pet, index) {
  const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
  const preview = card.querySelector(".pet-preview");
  const label = card.querySelector(".pet-label");

  label.textContent = pet.kind === "example" ? "示例" : `学员作品 #${pet.issueNumber}`;
  label.classList.toggle("is-example", pet.kind === "example");
  card.querySelector(".pet-name").textContent = pet.petName;
  card.querySelector(".pet-description").textContent = pet.description;
  card.querySelector(".pet-byline").textContent = pet.kind === "example"
    ? "SC26 示例 · 精灵图"
    : `${pet.nickname} · @${pet.githubLogin}`;
  card.setAttribute("aria-label", `查看 ${pet.petName} 的详情`);
  card.addEventListener("click", () => openDetail(pet));
  const previewController = createCardPreview(pet, preview, {
    eager: index < EAGER_POSTER_COUNT,
  });
  return { card, previewController };
}

function appendDetailLink(label, href, { download = false } = {}) {
  const safeHref = safeExternalUrl(href);
  if (!safeHref) return;

  const link = document.createElement("a");
  const arrow = document.createElement("span");
  link.className = "detail-link";
  link.href = safeHref;
  link.target = "_blank";
  link.rel = "noreferrer";
  if (download) link.download = "";
  link.textContent = label;
  arrow.textContent = "↗";
  arrow.setAttribute("aria-hidden", "true");
  link.append(arrow);
  elements.detailLinks.append(link);
}

async function drawStateThumbnail(pet, state, canvas) {
  try {
    const imageUrl = safeExternalUrl(pet.spriteUrl);
    if (!imageUrl) throw new Error("精灵图地址无效");
    const image = await loadSpriteImage(imageUrl);
    const frame = getFrameSize(image, pet.spriteGrid);
    canvas.width = frame.width;
    canvas.height = frame.height;
    drawSpriteFrame(canvas.getContext("2d"), image, pet.spriteGrid, state, 0);
  } catch {
    canvas.closest(".state-thumbnail")?.classList.add("is-broken");
  }
}

function renderStateViewer(pet) {
  const states = pet.spriteGrid.states;
  const defaultState = getDefaultState(pet);
  const buttons = new Map();

  elements.stateList.replaceChildren();
  detailAnimator = renderSpritePreview(pet, elements.detailPreview, defaultState);

  const selectState = (state) => {
    detailAnimator?.setState(state);
    elements.activeStateName.textContent = state.label;
    elements.activeStateCount.textContent = `${state.frames} 帧`;
    elements.activeStateDescription.textContent = state.description;

    for (const [stateId, button] of buttons) {
      const active = stateId === state.id;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  };

  for (const state of states) {
    const button = document.createElement("button");
    const copy = document.createElement("span");
    const label = document.createElement("strong");
    const meta = document.createElement("span");
    const thumbnail = document.createElement("span");
    const canvas = document.createElement("canvas");

    button.type = "button";
    button.className = "state-option";
    button.setAttribute("aria-pressed", "false");
    copy.className = "state-option-copy";
    label.textContent = state.label;
    meta.textContent = `Row ${state.row} · ${state.frames} 帧`;
    thumbnail.className = "state-thumbnail";
    canvas.setAttribute("aria-hidden", "true");
    copy.append(label, meta);
    thumbnail.append(canvas);
    button.append(copy, thumbnail);
    button.addEventListener("click", () => selectState(state));
    buttons.set(state.id, button);
    elements.stateList.append(button);
    drawStateThumbnail(pet, state, canvas);
  }

  selectState(defaultState);
}

function openDetail(pet) {
  detailAnimator?.destroy();
  detailAnimator = null;
  elements.detailKind.textContent = pet.kind === "example"
    ? "示例宠物"
    : `学员作品 #${pet.issueNumber}`;
  elements.detailTitle.textContent = pet.petName;
  elements.detailAuthor.textContent = pet.kind === "example"
    ? "由项目示例资源提供"
    : `${pet.nickname} · @${pet.githubLogin}`;
  elements.detailDescription.textContent = pet.description;
  elements.detailLinks.replaceChildren();
  elements.stateViewer.hidden = false;
  renderStateViewer(pet);

  if (pet.kind === "example") {
    appendDetailLink("查看宠物配置", pet.configUrl);
    appendDetailLink("打开完整精灵图", pet.spriteUrl);
  } else {
    appendDetailLink("作者的 GitHub 主页", pet.githubUrl);
    appendDetailLink("查看原投稿 Issue", pet.issueUrl);
    appendDetailLink("打开 pet.json", pet.petConfigUrl);
    appendDetailLink("打开 spritesheet.webp", pet.spritesheetUrl);
  }

  elements.dialog.showModal();
}

function showStatus(message, { error = false } = {}) {
  elements.statusText.textContent = message;
  elements.statusMessage.classList.toggle("is-error", error);
  elements.statusMessage.hidden = false;
}

function applyConfig(config) {
  const repository = config.repository || DEFAULT_CONFIG.repository;
  document.title = config.pageTitle || DEFAULT_CONFIG.pageTitle;
  elements.pageTitle.textContent = config.pageTitle || DEFAULT_CONFIG.pageTitle;
  elements.eventName.textContent = config.eventName || DEFAULT_CONFIG.eventName;
  elements.submitLink.href = `https://github.com/${repository}/issues/new?template=pet-submission.yml`;
}

function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function matchesSearch(pet, query) {
  if (!query) return true;
  return normalizeSearchText([
    pet.petName,
    pet.nickname,
    pet.githubLogin,
    pet.description,
    pet.issueNumber,
    pet.kind === "example" ? "示例" : "学员作品",
  ].join(" ")).includes(query);
}

function visiblePageNumbers(pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  return [...new Set([
    1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    pageCount,
  ].filter((page) => page >= 1 && page <= pageCount))].sort((left, right) => left - right);
}

function renderPagination(pageCount) {
  elements.pagination.hidden = pageCount <= 1;
  elements.previousPage.disabled = currentPage <= 1;
  elements.nextPage.disabled = currentPage >= pageCount;
  elements.pageNumbers.replaceChildren();

  let previousNumber = 0;
  for (const pageNumber of visiblePageNumbers(pageCount)) {
    if (pageNumber - previousNumber > 1) {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-ellipsis";
      ellipsis.textContent = "…";
      ellipsis.setAttribute("aria-hidden", "true");
      elements.pageNumbers.append(ellipsis);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = String(pageNumber);
    button.setAttribute("aria-label", `第 ${pageNumber} 页`);
    if (pageNumber === currentPage) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => changePage(pageNumber));
    elements.pageNumbers.append(button);
    previousNumber = pageNumber;
  }
}

function renderGallery() {
  for (const controller of activeCardPreviews) controller.destroy();
  activeCardPreviews = [];

  const pageCount = Math.max(1, Math.ceil(filteredPets.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagePets = filteredPets.slice(start, start + PAGE_SIZE);
  const rendered = pagePets.map((pet, index) => renderCard(pet, index));
  activeCardPreviews = rendered.map(({ previewController }) => previewController);
  elements.gallery.replaceChildren(...rendered.map(({ card }) => card));
  elements.gallery.setAttribute("aria-busy", "false");
  elements.emptyResults.hidden = filteredPets.length > 0;

  if (filteredPets.length === 0) {
    elements.resultSummary.textContent = "0 个结果";
  } else {
    const end = Math.min(start + PAGE_SIZE, filteredPets.length);
    elements.resultSummary.textContent = `显示 ${start + 1}–${end}，共 ${filteredPets.length} 只宠物`;
  }
  renderPagination(pageCount);
}

function changePage(pageNumber, { scroll = true } = {}) {
  const pageCount = Math.max(1, Math.ceil(filteredPets.length / PAGE_SIZE));
  const nextPage = Math.min(Math.max(1, pageNumber), pageCount);
  if (nextPage === currentPage && elements.gallery.childElementCount > 0) return;
  currentPage = nextPage;
  renderGallery();
  if (scroll) {
    elements.galleryTools.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }
}

function applySearch() {
  const query = normalizeSearchText(elements.gallerySearch.value.trim());
  filteredPets = allPets.filter((pet) => matchesSearch(pet, query));
  currentPage = 1;
  renderGallery();
}

async function initialize() {
  const configPromise = loadConfig().catch(() => DEFAULT_CONFIG);
  const examplesPromise = loadExamples();
  const submissionsPromise = loadSubmissions();
  let examples = [];
  let submissions = { generatedAt: null, pets: [] };
  let loadError = false;

  applyConfig(await configPromise);

  try {
    examples = await examplesPromise;
  } catch {
    loadError = true;
  }

  try {
    submissions = await submissionsPromise;
  } catch {
    loadError = true;
  }

  elements.submissionCount.textContent = String(submissions.pets.length);
  allPets = [...submissions.pets, ...examples];
  filteredPets = allPets;
  renderGallery();

  if (submissions.generatedAt) {
    const formatted = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(submissions.generatedAt));
    elements.updatedAt.textContent = `投稿更新于 ${formatted}`;
  }

  if (loadError) {
    showStatus("部分数据加载失败，请稍后刷新页面。", { error: true });
  } else if (submissions.pets.length === 0) {
    showStatus("还没有真实投稿，先看看三个示例宠物。");
  } else {
    elements.statusMessage.hidden = true;
  }
}

elements.dialogClose.addEventListener("click", () => elements.dialog.close());
elements.gallerySearch.addEventListener("input", applySearch);
elements.previousPage.addEventListener("click", () => changePage(currentPage - 1));
elements.nextPage.addEventListener("click", () => changePage(currentPage + 1));
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.dialog.addEventListener("close", () => {
  detailAnimator?.destroy();
  detailAnimator = null;
  elements.detailPreview.replaceChildren();
  elements.stateList.replaceChildren();
  elements.stateViewer.hidden = true;
});

initialize();
