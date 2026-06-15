/* =========================================================
   nazeyama 公式サイト  メインスクリプト
   - content/*.yaml を読み込んで各セクションを描画
   - 動画マーキー / 登録者数カウンター / タブ / スクロール演出
   - 読み込み失敗時は下の DEFAULTS にフォールバック（file:// でも表示できる）
   ========================================================= */

const CHANNEL_ID = "UCMn-qF0yqH-07bEJBaWUL5A";
const RSS_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PAGE = document.body.dataset.page || "home";
let allVideos = [];
let currentFilter = "all";
let currentSort = "date";
const MARQUEE_PX_PER_SEC = 26; // 流れる速さ（px/秒）。小さいほど遅い

/* ---- フォールバック用デフォルト（content/site.yaml と同等） ---- */
const DEFAULTS = {
  site: {
    title: "nazeyama",
    tagline: "Because it's there.",
    tagline_sub: "なぜ山に登るのか — そこに、山があるから。",
    subcopy: "ほんのり物理が香る、にゃんこの日常",
  },
  youtube: {
    channel_url: "https://www.youtube.com/channel/" + CHANNEL_ID,
    membership_url: "https://www.youtube.com/channel/" + CHANNEL_ID + "/join",
  },
  profile: {
    heading: "プロフィール",
    lines: [
      "宅浪(n=1) → 筑波大学 理工学群物理学類 卒業（2026年3月・学士）",
      "→ 大学院で物理学修士1年（外部院進）",
      "ちょっとYouTuber。物弱なりに物理学科で頑張っています。",
      "猫とミステリー小説が好きです。",
    ],
    birthday: "11月16日",
    origin: "「Because it's there.（なぜ山に登るのか → そこに山があるから）」が名前の由来です。",
  },
  sns: [
    { name: "YouTube", url: "https://www.youtube.com/channel/" + CHANNEL_ID, handle: "@nazeyama" },
    { name: "X (Twitter)", url: "https://x.com/nazeyama__", handle: "@nazeyama__" },
    { name: "Instagram", url: "https://www.instagram.com/nazeyama__", handle: "@nazeyama__" },
  ],
  line_stamp: {
    name: "物理屋のネッコ / nazeyama",
    url: "https://line.me/S/sticker/27507573/",
    description: "猫好き理系大学生YouTuber nazeyama の、ほんのり物理が香る、にゃんこの日常スタンプ。",
  },
  membership: { price: "月額80円", url: "https://www.youtube.com/channel/" + CHANNEL_ID + "/join", note: "ゆるく応援してくれると嬉しいです。" },
  fanletter: {
    postal: "〒573-0073",
    address: "大阪府枚方市高田2丁目26-10-6 プレゼントハウス519「nazeyama」",
    notes: [
      "amazon等のECサイトから届く場合は、住所の下に「置き配禁止」の記載をお願いします。",
      "冷凍・冷蔵のものは受取不可です（常温保管のため）。",
      "大きすぎるもの（200サイズ以上）は受取不可です。",
      "料金不足のものは受取不可です。",
    ],
  },
  contact: { formspree_endpoint: "https://formspree.io/f/your_form_id" },
  affiliate: {
    amazon_tag: "nazeyama-22",
    disclosure: "当サイトはAmazonアソシエイト・プログラムの参加者です。適格販売により収入を得る場合があります。",
  },
  display: { videos: true, neko: true, books: true, membership: true, fanletter: true, contact: true },
};

const BOOKS_DEFAULTS = {
  novels: {
    label: "小説（ミステリー）",
    note: "綾辻行人さんの作品。本格ミステリー好きにおすすめ。",
    items: [
      { title: "十角館の殺人", author: "綾辻行人", asin: "", comment: "新本格の金字塔。まずはここから。" },
      { title: "時計館の殺人", author: "綾辻行人", asin: "", comment: "館シリーズの代表作。" },
      { title: "迷路館の殺人", author: "綾辻行人", asin: "", comment: "作中作の仕掛けが鮮やか。" },
      { title: "人形館の殺人", author: "綾辻行人", asin: "", comment: "シリーズ屈指の異色作。" },
      { title: "Another", author: "綾辻行人", asin: "", comment: "ホラー×ミステリー。" },
    ],
  },
  exam: {
    label: "院試の参考書（サンプル）",
    note: "※ここはサンプルです。実際に使った参考書に差し替えてください。",
    items: [
      { title: "詳解 力学演習", author: "—", asin: "", comment: "（サンプル）力学の演習に。" },
      { title: "ジャクソン 電磁気学", author: "J. D. Jackson", asin: "", comment: "（サンプル）電磁気の定番。" },
      { title: "現代の量子力学", author: "J. J. サクライ", asin: "", comment: "（サンプル）量子力学の定番。" },
      { title: "古典力学", author: "ゴールドスタイン", asin: "", comment: "（サンプル）解析力学。" },
      { title: "統計力学", author: "田崎晴明", asin: "", comment: "（サンプル）統計力学の名著。" },
    ],
  },
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

async function loadYaml(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
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
      const bust = path.includes("?") ? "&" : "?";
      const url = i ? path + bust + "t=" + Date.now() : path;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------------- init ---------------- */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const siteRaw = await loadYaml("content/site.yaml");
  const site = mergeDeep(structuredCloneSafe(DEFAULTS), siteRaw || {});

  applyDisplay(site.display || {});
  renderFooter(site);
  setHref("#nav-cta", site.youtube && site.youtube.channel_url);
  setupNav();
  setupReveal();

  if (PAGE === "books") {
    const booksRaw = await loadYaml("content/books.yaml");
    renderBooks(booksRaw || BOOKS_DEFAULTS, site);
    return;
  }

  renderHero(site);
  renderNeko(site);
  renderMembership(site);
  renderFanletter(site);
  renderSNS(site);
  renderContact(site);

  setupVideoFilter();
  initMarqueePause();
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
  setText("#hero-name", s.site.title);
  setText("#hero-title", s.site.tagline);
  setText("#hero-title-sub", s.site.tagline_sub);
  setText("#hero-sub", s.site.subcopy);
  setHref("#hero-cta", s.youtube.channel_url);
  setHref("#nav-cta", s.youtube.channel_url);
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
    return (
      '<div class="bcard">' +
      '<div class="bcard__cover">' + esc(b.title) + "</div>" +
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
  const data = await loadJson("data/videos.json");
  const videos = data && Array.isArray(data.videos) ? data.videos.filter((v) => v.videoId) : [];
  // まず手持ちのデータで即描画（取得待ちに空白を出さない）
  allVideos = videos;
  if (videos.length) renderVideos();
  // JSONが空・読めないときは RSS から直接取得
  if (!videos.length) {
    const fromRss = await fetchRssVideos();
    if (fromRss && fromRss.length) {
      allVideos = fromRss;
      renderVideos();
    }
  }
  if (!allVideos.length) {
    track.innerHTML =
      '<div class="vcard"><div class="vcard__thumb"><span class="chalk-mini">動画を読み込めませんでした<br>' +
      '<a href="https://www.youtube.com/channel/' + CHANNEL_ID + '" target="_blank" rel="noopener" style="color:inherit">YouTubeで見る</a></span></div></div>';
  }
}

// 現在選択中の種別・並び順で動画マーキーを描画
function getVideoList() {
  let list = currentFilter === "all"
    ? allVideos.slice()
    : allVideos.filter((v) => (v.type || "video") === currentFilter);
  if (currentSort === "views") {
    list.sort((a, b) => {
      const diff = (b.viewCount || 0) - (a.viewCount || 0);
      if (diff !== 0) return diff;
      return String(b.published || "").localeCompare(String(a.published || ""));
    });
  } else if (currentSort === "member") {
    list.sort((a, b) => {
      const diff = Number(!!b.membersOnly) - Number(!!a.membersOnly);
      if (diff !== 0) return diff;
      return String(b.published || "").localeCompare(String(a.published || ""));
    });
  }
  return list;
}

function renderVideos() {
  const track = $("#videos-track");
  if (!track) return;
  const list = getVideoList();
  if (!list.length) {
    track.innerHTML = '<div class="vcard"><div class="vcard__thumb"><span class="chalk-mini">この種別の動画はまだありません</span></div></div>';
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
      const next = currentSort === tab.dataset.vsort ? "date" : tab.dataset.vsort;
      currentSort = next;
      sortTabs.forEach((t) => t.classList.toggle("tab--active", t.dataset.vsort === currentSort));
      renderVideos();
    });
  });
}

async function fetchRssVideos() {
  // 複数の中継サービス(CORSプロキシ)を順に試し、どれかで取得できれば使う
  const proxies = [
    (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
    (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
    (u) => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u),
    (u) => "https://api.allorigins.win/get?url=" + encodeURIComponent(u),
  ];
  for (const build of proxies) {
    try {
      const res = await fetch(build(RSS_URL), { cache: "no-store" });
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
  if (/配信|ライブ|live|🔴|生放送/i.test(title)) return "live";
  return "video";
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
    const member = v.membersOnly
      ? '<span class="vcard__badge">メンバー限定</span>'
      : "";
    const meta = date || views || member ? '<div class="vcard__meta">' + member + date + views + "</div>" : "";
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
  applyMarqueeDuration(track);
  const marquee = $("#videos-marquee");
  if (marquee) marquee.classList.remove("marquee--paused");
}

function applyMarqueeDuration(track) {
  if (REDUCED || !track) return;
  track.style.removeProperty("--marquee-duration");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const halfWidth = track.scrollWidth / 2;
      if (halfWidth <= 0) return;
      const duration = Math.max(halfWidth / MARQUEE_PX_PER_SEC, 60);
      track.style.setProperty("--marquee-duration", duration.toFixed(1) + "s");
    });
  });
}

function initMarqueePause() {
  const marquee = $("#videos-marquee");
  if (!marquee || marquee.dataset.pauseBound) return;
  marquee.dataset.pauseBound = "1";
  let resumeTimer = 0;
  const pause = () => {
    marquee.classList.add("marquee--paused");
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => marquee.classList.remove("marquee--paused"), 4000);
  };
  marquee.addEventListener("touchstart", pause, { passive: true });
  marquee.addEventListener("pointerdown", pause);
}
