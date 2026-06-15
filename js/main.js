/* =========================================================
   nazeyama 公式サイト  メインスクリプト
   - content/site.yaml を読み込んで各セクションを描画
   - 動画マーキー / 登録者数カウンター / タブ / スクロール演出
   - 読み込み失敗時は下の DEFAULTS にフォールバック（file:// でも表示できる）
   ========================================================= */

const CHANNEL_ID = "UCMn-qF0yqH-07bEJBaWUL5A";
const rssUrl = (id) => "https://www.youtube.com/feeds/videos.xml?channel_id=" + (id || CHANNEL_ID);
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PAGE = document.body.dataset.page || "home";
let allVideos = [];
let currentFilter = "all";
let currentSort = "date";
let memberOnlyFilter = false;
const MARQUEE_PX_PER_SEC = 26;

/* YAML 読み込み失敗時の最小フォールバック（file:// プレビュー用） */
const MIN_DEFAULTS = {
  site: {
    title: "nazeyama",
    tagline: "",
    url: "",
    seo: { title: "", description: "", keywords: [], books_title: "おすすめの本", books_description: "" },
  },
  images: { logo: "assets/images/nazeyama.jpg", neko: "assets/images/physicsneko.png" },
  youtube: { channel_id: CHANNEL_ID },
  profile: {},
  sns: [],
  line_stamp: {},
  membership: {},
  fanletter: { notes: [] },
  contact: {},
  affiliate: {},
  display: { videos: true, neko: true, books: true, membership: true, fanletter: true, contact: true },
  books: { novels: { items: [] }, exam: { items: [] } },
};

const STATS_DEFAULT = { subscribers: 35293, views: 7751078, videos: 356 };
const STATS_POLL_MS = 45000;

/* ---------------- helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function setText(sel, text) {
  const el = $(sel);
  if (el != null && text != null) el.textContent = text;
}
function setHref(sel, url) {
  const el = $(sel);
  if (el != null && url) el.setAttribute("href", url);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvePath(path) {
  try {
    return new URL(path, location.href).href;
  } catch {
    return path;
  }
}

async function loadYaml(path) {
  try {
    const res = await fetch(resolvePath(path), { cache: "no-store" });
    if (!res.ok) throw new Error("http " + res.status);
    const text = await res.text();
    if (!window.jsyaml) return null;
    return window.jsyaml.load(text);
  } catch (e) {
    console.warn("[nazeyama] YAML読み込み失敗、デフォルトを使用:", path, e.message);
    return null;
  }
}

async function loadJson(path, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const base = resolvePath(path);
      const bust = base.includes("?") ? "&" : "?";
      const url = i ? base + bust + "t=" + Date.now() : base;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("http " + res.status);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) return null;
      await sleep(400 * (i + 1));
    }
  }
  return null;
}

/* ---------------- init ---------------- */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const siteRaw = (await loadYaml("content/site.yaml")) || window.__NAZEYAMA_SITE__ || null;
  const site = normalizeSite(mergeDeep(structuredCloneSafe(MIN_DEFAULTS), siteRaw || {}));

  applyImages(site.images);
  applySeoMeta(site);
  applyDisplay(site.display || {});
  renderFooter(site);
  setHref("#nav-cta", site.youtube.channel_url);
  setupNav();
  setupReveal();

  if (PAGE === "books") {
    const booksMeta = await loadJson("data/books.json");
    renderBooks(mergeBooksMeta(site.books, booksMeta), site);
    return;
  }

  renderHero(site);
  renderNeko(site);
  renderMembership(site);
  renderFanletter(site);
  renderSNS(site);
  renderContact(site);

  setupVideoFilter();
  initMarqueeScroll();
  loadStats();
  loadVideos();
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}
function mergeDeep(base, over) {
  if (Array.isArray(over)) return over;
  if (typeof over !== "object" || over === null) return over;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && typeof out[k] === "object") {
      out[k] = mergeDeep(out[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

function normalizeSite(site) {
  const cid = site.youtube?.channel_id || CHANNEL_ID;
  const base = "https://www.youtube.com/channel/" + cid;
  site.youtube = { channel_id: cid, channel_url: base, membership_url: base + "/join" };
  if (!site.membership) site.membership = {};
  if (!site.membership.url) site.membership.url = site.youtube.membership_url;
  return site;
}

function applyImages(images) {
  if (!images) return;
  if (images.logo) {
    $$(".nav__logo-icon, .hero__icon").forEach((el) => el.setAttribute("src", images.logo));
    $$('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((el) => el.setAttribute("href", images.logo));
  }
  if (images.neko) {
    const neko = $(".neko__img");
    if (neko) neko.setAttribute("src", images.neko);
  }
  if (images.ogp) {
    const og = $('meta[property="og:image"]');
    if (og) og.setAttribute("content", images.ogp);
  }
}

function setMetaTag(name, content, prop) {
  if (!content) return;
  const sel = prop
    ? 'meta[property="' + name + '"]'
    : 'meta[name="' + name + '"]';
  let el = document.head.querySelector(sel);
  if (!el) {
    el = document.createElement("meta");
    if (prop) el.setAttribute("property", name);
    else el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function absAssetUrl(base, path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return base.replace(/\/?$/, "/") + path.replace(/^\//, "");
}

function applySeoMeta(site) {
  const s = site.site || {};
  const seo = s.seo || {};
  const keywords = Array.isArray(seo.keywords) ? seo.keywords.join(", ") : "";
  const isBooks = PAGE === "books";
  const title = isBooks
    ? (seo.books_title || "おすすめの本") + "｜" + (s.title || "nazeyama")
    : seo.title || (s.title || "nazeyama") + "｜" + (s.tagline || "");
  const description = isBooks
    ? seo.books_description || ""
    : seo.description || "";
  document.title = title;
  setMetaTag("description", description);
  setMetaTag("keywords", keywords);
  setMetaTag("og:title", title, true);
  setMetaTag("og:description", description, true);
  setMetaTag("og:site_name", s.title || "nazeyama", true);
  setMetaTag("twitter:title", title);
  setMetaTag("twitter:description", description);
  const ogImage = absAssetUrl(s.url, site.images?.ogp || site.images?.logo);
  if (ogImage) {
    setMetaTag("og:image", ogImage, true);
    setMetaTag("twitter:image", ogImage);
  }
  if (s.url) {
    const base = s.url.replace(/\/?$/, "/");
    const pageUrl = isBooks ? base + "books.html" : base;
    setMetaTag("og:url", pageUrl, true);
    const canonical = pageUrl;
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonical);
  }
  injectJsonLd(site, description);
}

function injectJsonLd(site, description) {
  const s = site.site || {};
  const sameAs = (site.sns || []).map((x) => x.url).filter(Boolean);
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: s.title || "nazeyama",
    description: description || "",
    url: s.url || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    jobTitle: "YouTuber",
    knowsAbout: ["物理学", "大学院", "理系"],
  };
  if (!data.url) delete data.url;
  if (!data.sameAs) delete data.sameAs;
  let el = document.getElementById("jsonld-person");
  if (!el) {
    el = document.createElement("script");
    el.id = "jsonld-person";
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/* ---------------- display toggle ---------------- */
function applyDisplay(display) {
  Object.keys(display).forEach((key) => {
    if (display[key] === false) {
      const sec = document.querySelector('[data-section="' + key + '"]');
      if (sec) sec.style.display = "none";
      const navHash = document.querySelector('.nav__links a[href="#' + key + '"]');
      if (navHash && navHash.parentElement) navHash.parentElement.style.display = "none";
      if (key === "books") {
        const navBooks = document.querySelector('.nav__links a[href="books.html"]');
        if (navBooks && navBooks.parentElement) navBooks.parentElement.style.display = "none";
      }
    }
  });
}

/* ---------------- renderers ---------------- */
function renderHero(s) {
  setText("#hero-title", s.site.title);
  setText("#hero-name", s.site.tagline);
  renderHeroProfile(s.profile);
  setHref("#hero-cta", s.youtube.channel_url);
  setHref("#nav-cta", s.youtube.channel_url);
}

function renderHeroProfile(p) {
  const el = $("#hero-profile");
  if (!el || !p) return;
  const path = Array.isArray(p.path) ? p.path.filter(Boolean) : [];
  const parts = [];
  if (path.length) {
    const bits = [];
    path.forEach((item, i) => {
      if (i > 0) {
        bits.push(
          '<span class="hero__path-sep" aria-hidden="true">' +
          '<svg class="hero__path-arrow" viewBox="0 0 16 16" focusable="false">' +
          '<path d="M5.5 3.5 10 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
          "</svg></span>"
        );
      }
      bits.push('<span class="hero__path-item">' + esc(item) + "</span>");
    });
    parts.push('<div class="hero__path">' + bits.join("") + "</div>");
  }
  if (p.role) parts.push('<span class="hero__tag">' + esc(p.role) + "</span>");
  if (p.bio) parts.push('<p class="hero__bio">' + esc(p.bio) + "</p>");
  if (p.likes) parts.push('<p class="hero__likes">' + esc(p.likes) + "</p>");
  el.innerHTML = parts.join("");
}

function snsIcon(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("youtube")) {
    return '<svg class="sns__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z"/></svg>';
  }
  if (n.includes("twitter") || n.includes("x (")) {
    return '<svg class="sns__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
  }
  if (n.includes("instagram")) {
    return '<svg class="sns__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a3.999 3.999 0 1 1 0-7.998 3.999 3.999 0 0 1 0 7.998zm6.406-11.845a1.44 1.44 0 1 1-2.881.001 1.44 1.44 0 0 1 2.881-.001z"/></svg>';
  }
  if (n.includes("tiktok")) {
    return '<svg class="sns__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.75a8.18 8.18 0 0 0 4.78 1.52V6.82a4.85 4.85 0 0 1-1.01-.13z"/></svg>';
  }
  return '<svg class="sns__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.9 12a5 5 0 0 1 5-5h.8V5.5H8.9a6.5 6.5 0 1 0 0 13h.8V17h-.8a5 5 0 0 1-5-5z"/><path fill="currentColor" d="M16 5.5v13h1.5v-4.2H22V12h-4.5V5.5H16z"/></svg>';
}

function renderSNS(s) {
  const lists = $$('[data-sns-list]');
  const html = (s.sns || []).map((x) => {
    const label = x.name + (x.handle ? " (" + x.handle + ")" : "");
    const slug = String(x.name || "link").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "link";
    return (
      '<li class="sns__item sns__item--' + slug + '"><a href="' + esc(x.url) + '" target="_blank" rel="noopener" aria-label="' + esc(label) + '" title="' + esc(label) + '">' +
      snsIcon(x.name) +
      "</a></li>"
    );
  }).join("");
  lists.forEach((l) => (l.innerHTML = html));
}

function renderNeko(s) {
  setText("#neko-desc", s.line_stamp.description);
  setText("#neko-name", s.line_stamp.name);
  setHref("#neko-stamp", s.line_stamp.url);
}

function renderMembership(s) {
  setText("#member-price", s.membership.price);
  setText("#member-note", s.membership.note);
  setHref("#member-link", s.membership.url);
}

function renderFanletter(s) {
  setText("#letter-addr", s.fanletter.postal + " " + s.fanletter.address);
  const notes = $("#letter-notes");
  if (notes && Array.isArray(s.fanletter.notes)) {
    notes.innerHTML = s.fanletter.notes.map((n) => "<li>" + esc(n) + "</li>").join("");
  }
}

function renderContact(s) {
  const form = $("#contact-form");
  if (form && s.contact && s.contact.formspree_endpoint) {
    form.setAttribute("action", s.contact.formspree_endpoint);
  }
}

function bookMetaKey(b) {
  return String(b.title || "").trim() + "\0" + String(b.author || "").trim();
}

function mergeBooksMeta(books, meta) {
  if (!books || !meta) return books;
  const out = structuredCloneSafe(books);
  for (const key of ["novels", "exam"]) {
    const items = out[key]?.items;
    const metaItems = meta[key]?.items;
    if (!Array.isArray(items) || !Array.isArray(metaItems)) continue;
    const map = new Map(metaItems.map((b) => [bookMetaKey(b), b]));
    out[key].items = items.map((b) => {
      const m = map.get(bookMetaKey(b));
      if (!m) return b;
      return {
        ...b,
        asin: m.asin || "",
        coverUrl: m.coverUrl || "",
      };
    });
  }
  return out;
}

function renderBooks(books, site) {
  const tag = (site.affiliate && site.affiliate.amazon_tag) || "";
  renderBookGrid("#books-novels", books.novels, tag);
  renderBookGrid("#books-exam", books.exam, tag);
  setText("#books-note-novels", books.novels && books.novels.note);
  setText("#books-note-exam", books.exam && books.exam.note);
  setText("#books-disclosure", site.affiliate && site.affiliate.disclosure);
  setText("#books-label-novels", books.novels && books.novels.label);
  setText("#books-label-exam", books.exam && books.exam.label);
}

function renderBookGrid(sel, cat, tag) {
  const grid = $(sel);
  if (!grid || !cat || !Array.isArray(cat.items)) return;
  grid.innerHTML = cat.items.map((b) => {
    const hasLink = b.asin && tag;
    const url = hasLink ? "https://www.amazon.co.jp/dp/" + encodeURIComponent(b.asin) + "?tag=" + encodeURIComponent(tag) : "#";
    const btn = hasLink
      ? '<a class="bcard__btn" href="' + esc(url) + '" target="_blank" rel="noopener nofollow sponsored">Amazonで見る</a>'
      : '<span class="bcard__btn bcard__btn--disabled">準備中</span>';
    const cover = b.coverUrl
      ? '<img class="bcard__cover-img" src="' + esc(b.coverUrl) + '" alt="' + esc(b.title + "の表紙") + '" loading="lazy" decoding="async">'
      : esc(b.title);
    return (
      '<div class="bcard">' +
      '<div class="bcard__cover' + (b.coverUrl ? " bcard__cover--img" : "") + '">' + cover + "</div>" +
      '<h4 class="bcard__title">' + esc(b.title) + "</h4>" +
      '<p class="bcard__author">' + esc(b.author || "") + "</p>" +
      '<p class="bcard__comment">' + esc(b.comment || "") + "</p>" +
      btn +
      "</div>"
    );
  }).join("");
}

function renderFooter(s) {
  setText("#footer-year", String(new Date().getFullYear()));
  setText("#footer-title", s.site.title);
}

/* ---------------- nav (mobile) ---------------- */
function setupNav() {
  const toggle = $(".nav__toggle");
  const menu = $("#nav-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.addEventListener("click", (e) => {
      if (e.target.tagName === "A") {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }
}

/* ---------------- scroll reveal ---------------- */
function setupReveal() {
  const items = $$(".reveal");
  if (REDUCED || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  items.forEach((el) => io.observe(el));
}

/* ---------------- stats / subscriber counter ---------------- */
function parseLiveStats(j) {
  const c = (j && j.counters) || {};
  const est = c.estimation || {};
  const api = c.api || {};
  const pick = (key) => {
    if (typeof est[key] === "number") return est[key];
    if (typeof api[key] === "number") return api[key];
    return null;
  };
  return {
    subscribers: pick("subscriberCount"),
    views: pick("viewCount"),
    videos: pick("videoCount"),
  };
}

function applyLiveStats(live, duration) {
  if (!live) return;
  if (live.subscribers > 0) countUp("#stat-subs", live.subscribers, duration);
  if (live.views > 0) countUp("#stat-views", live.views, duration);
}

async function loadStats() {
  const data = (await loadJson("data/stats.json")) || STATS_DEFAULT;
  if (!REDUCED) ["#stat-subs", "#stat-views"].forEach((s) => { const e = $(s); if (e) e.textContent = "0"; });
  countUp("#stat-subs", data.subscribers || STATS_DEFAULT.subscribers);
  countUp("#stat-views", data.views || STATS_DEFAULT.views);
  // リアルタイム更新（推定値を優先・失敗時は保存値のまま）
  fetchLiveStats().then((live) => applyLiveStats(live, 1200));
  setInterval(() => {
    fetchLiveStats().then((live) => applyLiveStats(live, 800));
  }, STATS_POLL_MS);
}

async function fetchLiveStats() {
  try {
    const res = await fetch("https://api.socialcounts.org/youtube-live-subscriber-count/" + CHANNEL_ID, { cache: "no-store" });
    if (!res.ok) throw new Error("bad");
    return parseLiveStats(await res.json());
  } catch (e) {
    return null;
  }
}

function countUp(sel, target, duration) {
  const el = $(sel);
  if (!el) return;
  target = Math.round(target);
  if (REDUCED) {
    el.textContent = target.toLocaleString();
    return;
  }
  duration = duration || 1600;
  const start = parseInt((el.textContent || "0").replace(/[^0-9]/g, ""), 10) || 0;
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(start + (target - start) * eased);
    el.textContent = val.toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------------- videos / marquee ---------------- */
async function loadVideos() {
  const track = $("#videos-track");
  if (!track) return;

  // 同梱データを先に表示（fetch 待ちで空白にしない）
  const bundled = window.__NAZEYAMA_VIDEOS__;
  if (bundled && Array.isArray(bundled.videos) && bundled.videos.length) {
    allVideos = applyVideoTypes(bundled.videos.filter((v) => v.videoId));
    renderVideos();
  }

  let videos = [];
  const data = await loadJson("data/videos.json");
  if (data && Array.isArray(data.videos)) {
    videos = applyVideoTypes(data.videos.filter((v) => v.videoId));
  } else if (!videos.length && bundled && Array.isArray(bundled.videos)) {
    videos = applyVideoTypes(bundled.videos.filter((v) => v.videoId));
  }

  if (videos.length) {
    allVideos = videos;
    renderVideos();
  } else if (!allVideos.length) {
    const fromRss = await fetchRssVideos();
    if (fromRss && fromRss.length) {
      allVideos = applyVideoTypes(fromRss);
      renderVideos();
    }
  }

  if (!allVideos.length) {
    const hint =
      location.protocol === "file:"
        ? "<br><span style=\"font-size:0.85em;opacity:0.85\">index.html を直接開くと読み込めないことがあります。VS Code の Live Server などで開いてください。</span>"
        : "";
    track.innerHTML =
      '<div class="vcard"><div class="vcard__thumb"><span class="chalk-mini">動画を読み込めませんでした<br>' +
      '<a href="https://www.youtube.com/channel/' + CHANNEL_ID + '" target="_blank" rel="noopener" style="color:inherit">YouTubeで見る</a>' +
      hint + "</span></div></div>";
  }
}

// 現在選択中の種別・並び順で動画マーキーを描画
function getVideoList() {
  let list = currentFilter === "all"
    ? allVideos.slice()
    : allVideos.filter((v) => resolveVideoType(v) === currentFilter);
  if (memberOnlyFilter) {
    list = list.filter((v) => v.membersOnly);
  }
  if (currentSort === "views") {
    list.sort((a, b) => {
      const diff = (b.viewCount || 0) - (a.viewCount || 0);
      if (diff !== 0) return diff;
      return String(b.published || "").localeCompare(String(a.published || ""));
    });
  } else if (currentFilter === "all") {
    // 動画→ショート→ライブの塊順だと配信が末尾に固まるため、新着順に混ぜる
    list.sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")));
  }
  return list;
}

function renderVideos() {
  const track = $("#videos-track");
  if (!track) return;
  const list = getVideoList();
  if (!list.length) {
    let emptyMsg = "動画がありません";
    if (memberOnlyFilter) {
      emptyMsg = currentFilter === "all"
        ? "メンバー限定の動画はまだありません"
        : "この種別のメンバー限定動画はまだありません";
    } else if (currentFilter !== "all") {
      emptyMsg = "この種別の動画はまだありません（「すべて」を試してください）";
    }
    track.innerHTML = '<div class="vcard"><div class="vcard__thumb"><span class="chalk-mini">' + emptyMsg + "</span></div></div>";
    return;
  }
  buildMarquee(track, list);
}

// 種別フィルタ（すべて / 動画 / ショート / ライブ）と再生数順
function setupVideoFilter() {
  const filterTabs = $$(".vfilter .tab[data-vfilter]");
  const sortTabs = $$(".vfilter .tab[data-vsort]");
  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selected = tab.dataset.vfilter || "all";
      if (selected !== "all" && currentFilter === selected) {
        currentFilter = "all";
      } else {
        currentFilter = selected;
      }
      filterTabs.forEach((t) => {
        t.classList.toggle("tab--active", (t.dataset.vfilter || "all") === currentFilter);
      });
      renderVideos();
    });
  });
  sortTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const kind = tab.dataset.vsort;
      if (kind === "member") {
        memberOnlyFilter = !memberOnlyFilter;
        tab.classList.toggle("tab--active", memberOnlyFilter);
      } else if (kind === "views") {
        currentSort = currentSort === "views" ? "date" : "views";
        tab.classList.toggle("tab--active", currentSort === "views");
      }
      renderVideos();
    });
  });
}

async function fetchRssVideos() {
  // ローカル開発では corsproxy.io が使える。allorigins は不安定なことがある
  const proxies = [
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://api.allorigins.win/get?url=" + encodeURIComponent(u),
  ];
  for (const build of proxies) {
    try {
      const res = await fetch(build(rssUrl()), { cache: "no-store" });
      if (!res.ok) continue;
      let text = await res.text();
      if (text.startsWith("{")) {
        try {
          const wrapped = JSON.parse(text);
          text = wrapped.contents || text;
        } catch {
          /* raw xml */
        }
      }
      const xml = new DOMParser().parseFromString(text, "text/xml");
      if (xml.querySelector("parsererror")) continue;
      const entries = Array.from(xml.getElementsByTagName("entry")).slice(0, 15);
      const vids = entries.map((en) => {
        const id = (en.getElementsByTagName("yt:videoId")[0] || {}).textContent || "";
        const title = (en.getElementsByTagName("title")[0] || {}).textContent || "";
        const rawPublished = (en.getElementsByTagName("published")[0] || {}).textContent || "";
        const published = rawPublished ? rawPublished.slice(0, 10) : "";
        return { title: title, videoId: id, url: "https://www.youtube.com/watch?v=" + id, views: "", thumbnail: id ? "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg" : "", published: published, type: guessType(title) };
      }).filter((v) => v.videoId);
      if (vids.length) return vids;
    } catch (e) {
      /* 次のプロキシを試す */
    }
  }
  return null;
}

// クライアント取得時はタイトルから簡易に種別を推定（正確な判定はGitHub Actions側で実施）
function guessType(title) {
  if (/#shorts|＃shorts/i.test(title)) return "short";
  if (/配信|ライブ|live|🔴|生放送|study with me/i.test(title)) return "live";
  return "video";
}

function isLiveVideo(v) {
  if (!v) return false;
  if (v.type === "live") return true;
  return guessType(v.title || "") === "live";
}

function applyVideoTypes(videos) {
  return videos.map((v) => {
    if (!v || v.type === "live" || v.type === "short") return v;
    const guessed = guessType(v.title || "");
    if (guessed === "video") return v;
    return Object.assign({}, v, { type: guessed });
  });
}

function resolveVideoType(v) {
  if (v.type === "live" || v.type === "short") return v.type;
  const guessed = guessType(v.title || "");
  if (guessed !== "video") return guessed;
  return v.type || "video";
}

function formatVideoDate(raw) {
  if (!raw) return "";
  const d = new Date(raw.length === 10 ? raw + "T00:00:00" : raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

function buildMarquee(track, videos) {
  const cardHtml = (v) => {
    const url = v.url || (v.videoId ? "https://www.youtube.com/watch?v=" + v.videoId : "#");
    const showLive = isLiveVideo(v) || currentFilter === "live";
    const thumb = v.thumbnail
      ? '<img src="' + esc(v.thumbnail) + '" alt="" loading="lazy" decoding="async" width="320" height="180" onerror="this.style.display=\'none\'">'
      : '<span class="chalk-mini">▶ YouTubeで見る</span>';
    const dateLabel = formatVideoDate(v.published);
    const date = dateLabel
      ? '<time class="vcard__date" datetime="' + esc(v.published) + '">' + esc(dateLabel) + "</time>"
      : "";
    const views = v.views
      ? '<span class="vcard__views">' + esc(v.views) + "</span>"
      : (v.viewCount ? '<span class="vcard__views">' + esc(v.viewCount.toLocaleString("ja-JP") + "回") + "</span>" : "");
    const live = showLive
      ? '<span class="vcard__badge vcard__badge--live" lang="ja">ライブ</span>'
      : "";
    const member = v.membersOnly
      ? '<span class="vcard__badge vcard__badge--member" lang="ja">メンバー限定</span>'
      : "";
    const meta = date || views || member || live ? '<div class="vcard__meta">' + live + member + date + views + "</div>" : "";
    return (
      '<a class="vcard" href="' + esc(url) + '" target="_blank" rel="noopener">' +
      '<div class="vcard__thumb">' + thumb + '<span class="play">▶</span></div>' +
      '<div class="vcard__body"><p class="vcard__title">' + esc(v.title) + "</p>" + meta + "</div>" +
      "</a>"
    );
  };
  const html = videos.map(cardHtml).join("");
  // 途切れないループのため2セット並べる（reduced-motion時は1セット＝手動スクロールのみ）
  track.innerHTML = REDUCED ? html : html + html;
  const marquee = $("#videos-marquee");
  if (marquee) marquee.scrollLeft = 0;
}

function initMarqueeScroll() {
  const marquee = $("#videos-marquee");
  if (!marquee || marquee.dataset.scrollBound) return;
  marquee.dataset.scrollBound = "1";

  const isTouchLike = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  let paused = REDUCED || isTouchLike;
  let resumeTimer = 0;
  let lastTime = 0;
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let dragging = false;
  let suppressClick = false;
  let touchId = null;
  let touchMoved = false;

  const getHalf = () => {
    const track = $("#videos-track");
    return track ? track.scrollWidth / 2 : 0;
  };

  const wrapScroll = () => {
    const half = getHalf();
    if (half <= 0) return;
    if (marquee.scrollLeft >= half) marquee.scrollLeft -= half;
  };

  const pause = (autoResumeMs = 4000) => {
    paused = true;
    marquee.classList.add("marquee--paused");
    clearTimeout(resumeTimer);
    if (autoResumeMs >= 0) {
      resumeTimer = setTimeout(() => {
        if (!isTouchLike) {
          paused = false;
          marquee.classList.remove("marquee--paused");
        }
      }, autoResumeMs);
    }
  };

  const tick = (now) => {
    if (!REDUCED && !isTouchLike && !paused) {
      const dt = lastTime ? (now - lastTime) / 1000 : 0;
      if (dt > 0) {
        marquee.scrollLeft += MARQUEE_PX_PER_SEC * dt;
        wrapScroll();
      }
    }
    lastTime = now;
    requestAnimationFrame(tick);
  };

  marquee.addEventListener("scroll", wrapScroll, { passive: true });

  marquee.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    marquee.scrollLeft += e.deltaY;
    wrapScroll();
    pause();
  }, { passive: false });

  marquee.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartScroll = marquee.scrollLeft;
    dragging = false;
    pause(-1);
  });

  marquee.addEventListener("pointermove", (e) => {
    if (dragPointerId !== e.pointerId) return;
    const dx = e.clientX - dragStartX;
    if (!dragging && Math.abs(dx) > 6) {
      dragging = true;
      suppressClick = true;
      marquee.setPointerCapture(e.pointerId);
    }
    if (!dragging) return;
    e.preventDefault();
    marquee.scrollLeft = dragStartScroll - dx;
    wrapScroll();
  });

  const endDrag = (e) => {
    if (dragPointerId !== null && e && e.pointerId === dragPointerId && dragging) {
      try { marquee.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
    const wasDragging = dragging;
    dragPointerId = null;
    dragging = false;
    if (wasDragging) pause(4000);
  };

  marquee.addEventListener("pointerup", endDrag);
  marquee.addEventListener("pointercancel", endDrag);

  marquee.addEventListener("click", (e) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    }
  }, true);

  // スマホ: リンク上でも横スワイプできるよう touch で直接 scrollLeft を動かす
  marquee.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    touchId = e.touches[0].identifier;
    touchStartX = e.touches[0].clientX;
    touchStartScroll = marquee.scrollLeft;
    touchMoved = false;
  }, { passive: true });

  marquee.addEventListener("touchmove", (e) => {
    const t = Array.from(e.touches).find((touch) => touch.identifier === touchId);
    if (!t) return;
    const dx = t.clientX - touchStartX;
    if (!touchMoved && Math.abs(dx) > 8) touchMoved = true;
    if (!touchMoved) return;
    marquee.scrollLeft = touchStartScroll - dx;
    wrapScroll();
  }, { passive: true });

  const endTouch = () => {
    if (touchMoved) suppressClick = true;
    touchId = null;
    touchMoved = false;
  };

  marquee.addEventListener("touchend", endTouch, { passive: true });
  marquee.addEventListener("touchcancel", endTouch, { passive: true });

  if (!isTouchLike) {
    marquee.addEventListener("mouseenter", () => pause(-1));
    marquee.addEventListener("mouseleave", () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        paused = false;
        marquee.classList.remove("marquee--paused");
      }, 4000);
    });
  }

  if (!REDUCED && !isTouchLike) requestAnimationFrame(tick);
}
