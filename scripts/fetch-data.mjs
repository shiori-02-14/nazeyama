// =========================================================
//  動画(RSS)と登録者数を取得して data/*.json を更新するスクリプト
//  GitHub Actions から `node scripts/fetch-data.mjs` で実行されます。
//  - 依存なし（Node 18+ の fetch を使用）
//  - 取得できない値は前回値を保持（推測で埋めない＝ファクトチェック方針）
// =========================================================
import { writeFile, readFile } from "node:fs/promises";
import { fetchBooks } from "./fetch-books.mjs";
import { syncSeo } from "./sync-seo.mjs";
import { exportSiteBundle } from "./export-site.mjs";

const CHANNEL_ID = "UCMn-qF0yqH-07bEJBaWUL5A";
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const CHANNEL_VIDEOS_URL = `https://www.youtube.com/channel/${CHANNEL_ID}/videos`;
const CHANNEL_SHORTS_URL = `https://www.youtube.com/channel/${CHANNEL_ID}/shorts`;
const CHANNEL_STREAMS_URL = `https://www.youtube.com/channel/${CHANNEL_ID}/streams`;
const VIDEO_LIMIT = 30;
const SHORTS_LIMIT = 30;
const STREAMS_LIMIT = 30;
const FETCH_HEADERS = {
  "accept-language": "ja",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
const META_CONCURRENCY = 1;
const META_DELAY_MS = 1200;
const FETCH_RETRIES = 2;
const MIN_HTML_BYTES = 50000;
const MAX_CAPTCHA_STREAK = 3;
const MIN_TRUSTED_ITEMS = 10;
const today = new Date().toISOString().slice(0, 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = FETCH_RETRIES) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      lastErr = new Error(String(res.status));
    } catch (e) {
      lastErr = e;
    }
    if (i < retries - 1) await sleep(1500 * (i + 1));
  }
  throw lastErr;
}

function extractJsonBlock(html, marker) {
  const start = String(html).indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  if (html[jsonStart] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractYtInitialData(html) {
  return extractJsonBlock(html, "var ytInitialData = ");
}

function isCaptchaPage(html) {
  const s = String(html);
  return (
    s.length < MIN_HTML_BYTES ||
    (s.includes("captcha-form") && !s.includes("ytInitialData")) ||
    (s.includes("g-recaptcha") && !s.includes("ytInitialPlayerResponse"))
  );
}

function extractLockupViewCount(lv) {
  const rows =
    lv.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
  for (const row of rows) {
    for (const part of row.metadataParts || []) {
      const count = parseJapaneseViewCount(part.text?.content || "");
      if (count != null) return count;
    }
  }
  return null;
}

async function mapPool(items, fn, concurrency = META_CONCURRENCY) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function mergeVideoLists(prevVideos, newVideos) {
  const prev = Array.isArray(prevVideos) ? prevVideos : [];
  const next = Array.isArray(newVideos) ? newVideos : [];
  if (!prev.length) return next;
  if (!next.length) return prev;
  const map = new Map(prev.map((v) => [v.videoId, v]));
  for (const v of next) {
    const prevEntry = map.get(v.videoId) || {};
    const merged = { ...prevEntry, ...v, videoId: v.videoId };
    if (prevEntry.type === "live" || v.type === "live") merged.type = "live";
    if (prevEntry.type === "short" || v.type === "short") merged.type = "short";
    if (prevEntry.viewCount != null && (merged.viewCount == null || merged.viewCount <= 0)) {
      merged.viewCount = prevEntry.viewCount;
      merged.views = prevEntry.views || formatViews(prevEntry.viewCount);
    }
    map.set(v.videoId, merged);
  }
  const seen = new Set();
  const merged = [];
  for (const v of next) {
    if (!v.videoId || seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    merged.push(map.get(v.videoId));
  }
  for (const v of prev) {
    if (!v.videoId || seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    merged.push(v);
  }
  return merged;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function formatViews(n) {
  if (typeof n !== "number" || n <= 0) return "";
  return n.toLocaleString("ja-JP") + "回";
}

function pickViewCount(next, prev) {
  if (typeof next === "number" && next > 0 && typeof prev === "number" && prev > 0) {
    return Math.max(next, prev);
  }
  if (typeof next === "number" && next > 0) return next;
  if (typeof prev === "number" && prev > 0) return prev;
  return next ?? prev ?? null;
}

function parseViewCount(html, videoId = "") {
  if (!html || isCaptchaPage(html)) return null;
  const s = String(html);
  const direct = s.match(/"viewCount":"(\d+)"/);
  if (direct) return Number(direct[1]);

  const player = extractJsonBlock(s, "var ytInitialPlayerResponse = ");
  if (player?.videoDetails?.viewCount) return Number(player.videoDetails.viewCount);

  const primary = s.match(
    /"videoPrimaryInfoRenderer"[\s\S]{0,5000}?"(?:simpleText|content)":"([\d,.]+(?:万)?回視聴)"/
  );
  if (primary) {
    const count = parseJapaneseViewCount(primary[1]);
    if (count != null) return count;
  }

  if (videoId) {
    const near = s.match(
      new RegExp(
        `"${videoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]{0,2500}?"(?:simpleText|content)":"([\\d,.]+(?:万)?回視聴)"`
      )
    );
    if (near) {
      const count = parseJapaneseViewCount(near[1]);
      if (count != null) return count;
    }
  }
  return null;
}

function parseUploadDate(html) {
  const m = String(html).match(/"uploadDate":"([^"]+)"/);
  return m ? m[1].slice(0, 10) : "";
}

function isMembersOnlyLockup(lv) {
  const s = JSON.stringify(lv);
  return s.includes("BADGE_MEMBERS_ONLY") || s.includes("メンバー限定");
}

function parseShortAccessibility(text) {
  const raw = String(text || "");
  const title = raw.split(",")[0]?.trim() || "";
  return { title, viewCount: parseJapaneseViewCount(raw) };
}

function parseJapaneseViewCount(text) {
  const man = String(text).match(/([\d.]+)\s*万回視聴/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const plain = String(text).match(/([\d,]+)\s*回視聴/);
  if (plain) return Number(plain[1].replace(/,/g, ""));
  return null;
}

function parseTitle(html) {
  const m = String(html).match(/<meta property="og:title" content="([^"]+)"/);
  return m ? decodeEntities(m[1]) : "";
}

function parseVideoType(html, id) {
  const s = String(html);
  if (/"isLiveContent"\s*:\s*true/.test(s)) return "live";
  if (
    s.includes(`youtube.com/shorts/${id}`) ||
    /"isShortsEligible"\s*:\s*true/.test(s)
  ) return "short";
  return "video";
}

async function fetchVideoMeta(id, hintType = "video", forceLive = false) {
  let type = hintType;
  let viewCount = null;
  let published = "";
  let title = "";
  let captcha = false;
  const urls =
    hintType === "short"
      ? [`https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/watch?v=${id}`]
      : [`https://www.youtube.com/watch?v=${id}`];

  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: FETCH_HEADERS });
        if (!res.ok) continue;
        const html = await res.text();
        if (isCaptchaPage(html)) {
          captcha = true;
          continue;
        }
        captcha = false;
        const parsedViews = parseViewCount(html, id);
        if (parsedViews != null) viewCount = parsedViews;
        published = parseUploadDate(html) || published;
        title = parseTitle(html) || title;
        type = forceLive || hintType === "live" ? "live" : parseVideoType(html, id);
        if (viewCount != null) return { type, viewCount, published, title, captcha: false };
      } catch {}
    }
  }
  return { type, viewCount, published, title, captcha };
}

async function fetchViewCountsFromApi(ids) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !ids.length) return new Map();
  const map = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", chunk.join(","));
    url.searchParams.set("key", key);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("YouTube API:", res.status, chunk.length, "ids");
        continue;
      }
      const json = await res.json();
      for (const item of json.items || []) {
        const vc = Number(item.statistics?.viewCount);
        if (Number.isFinite(vc) && vc >= 0) map.set(item.id, vc);
      }
    } catch (e) {
      console.warn("YouTube API failed:", e.message);
    }
  }
  return map;
}

async function applyApiViewCounts(videos) {
  const ids = videos.map((v) => v.videoId).filter(Boolean);
  const apiViews = await fetchViewCountsFromApi(ids);
  if (!apiViews.size) return 0;
  let updated = 0;
  for (const v of videos) {
    const vc = apiViews.get(v.videoId);
    if (vc == null) continue;
    v.viewCount = pickViewCount(vc, v.viewCount);
    v.views = formatViews(v.viewCount);
    updated++;
  }
  console.log(`YouTube API viewCount updated: ${updated}/${videos.length}`);
  return updated;
}

async function enrichMissingVideoMeta(videos, liveIds) {
  const targets = videos.filter((v) => v.viewCount == null || !v.published);
  if (!targets.length) return;
  let captchaStreak = 0;
  for (const v of targets) {
    if (captchaStreak >= MAX_CAPTCHA_STREAK) {
      console.warn(`stopping meta fetch after ${MAX_CAPTCHA_STREAK} captcha pages`);
      break;
    }
    const isLive = v.type === "live" || liveIds.has(v.videoId);
    const meta = await fetchVideoMeta(v.videoId, v.type, isLive);
    v.type = isLive ? "live" : meta.type;
    if (meta.viewCount != null) {
      v.viewCount = meta.viewCount;
      v.views = formatViews(meta.viewCount);
      captchaStreak = 0;
    } else if (meta.captcha) {
      captchaStreak++;
    }
    if (!v.published && meta.published) v.published = meta.published;
    if (!v.title && meta.title) v.title = meta.title;
    if (v.type === "short" && !v.url.includes("/shorts/")) {
      v.url = `https://www.youtube.com/shorts/${v.videoId}`;
    }
    await sleep(META_DELAY_MS);
  }
}

function walkLockupViewModels(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.lockupViewModel) {
    const lv = node.lockupViewModel;
    const id =
      lv.onTap?.innertubeCommand?.watchEndpoint?.videoId ||
      lv.contentId ||
      lv.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url?.match(/vi\/([^/]+)/)?.[1];
    const title = lv.metadata?.lockupMetadataViewModel?.title?.content;
    if (id) {
      out.push({
        videoId: id,
        title: title || "",
        membersOnly: isMembersOnlyLockup(lv),
        viewCount: extractLockupViewCount(lv),
      });
    }
  }
  for (const key of Object.keys(node)) walkLockupViewModels(node[key], out);
}

function walkStreamsLockupViewModels(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.lockupViewModel?.contentId) {
    const lv = node.lockupViewModel;
    out.push({
      videoId: lv.contentId,
      title: lv.metadata?.lockupMetadataViewModel?.title?.content || "",
      membersOnly: isMembersOnlyLockup(lv),
      viewCount: extractLockupViewCount(lv),
      type: "live",
    });
  }
  for (const key of Object.keys(node)) walkStreamsLockupViewModels(node[key], out);
}

function walkShortsLockupViewModels(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.shortsLockupViewModel) {
    const lv = node.shortsLockupViewModel;
    const id = lv.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
    const parsed = parseShortAccessibility(lv.accessibilityText);
    if (id) {
      out.push({
        videoId: id,
        title: parsed.title,
        viewCount: parsed.viewCount,
        membersOnly: isMembersOnlyLockup(lv),
        type: "short",
      });
    }
  }
  for (const key of Object.keys(node)) walkShortsLockupViewModels(node[key], out);
}

async function fetchChannelPageList(url, walker, limit) {
  try {
    const res = await fetchWithRetry(url, { headers: FETCH_HEADERS });
    const html = await res.text();
    const data = extractYtInitialData(html);
    if (!data) return [];
    const items = [];
    walker(data, items);
    const seen = new Set();
    const uniq = [];
    for (const item of items) {
      if (seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      uniq.push(item);
      if (uniq.length >= limit) break;
    }
    return uniq;
  } catch {
    return [];
  }
}

async function fetchChannelVideoList() {
  return fetchChannelPageList(CHANNEL_VIDEOS_URL, walkLockupViewModels, VIDEO_LIMIT);
}

async function fetchChannelShortsList() {
  return fetchChannelPageList(CHANNEL_SHORTS_URL, walkShortsLockupViewModels, SHORTS_LIMIT);
}

async function fetchChannelStreamsList() {
  return fetchChannelPageList(CHANNEL_STREAMS_URL, walkStreamsLockupViewModels, STREAMS_LIMIT);
}

async function fetchRssMap() {
  const map = new Map();
  try {
    const res = await fetchWithRetry(RSS_URL);
    const xml = await res.text();
    for (const e of xml.split("<entry>").slice(1)) {
      const id = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || "";
      if (!id) continue;
      const rawTitle = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
      const rawPublished = (e.match(/<published>(.*?)<\/published>/) || [])[1] || "";
      map.set(id, {
        title: decodeEntities(rawTitle.trim()),
        published: rawPublished ? rawPublished.slice(0, 10) : "",
      });
    }
  } catch {}
  return map;
}

async function fetchVideos() {
  const prev = await readJson("data/videos.json", { videos: [] });
  const prevMap = Object.fromEntries((prev.videos || []).map((v) => [v.videoId, v]));
  const rssMap = await fetchRssMap();
  const [videoList, shortsList, streamsList] = await Promise.all([
    fetchChannelVideoList(),
    fetchChannelShortsList(),
    fetchChannelStreamsList(),
  ]);
  const liveIds = new Set(streamsList.map((s) => s.videoId));
  let channelList = [...videoList];
  const seen = new Set(channelList.map((v) => v.videoId));
  for (const item of channelList) {
    if (liveIds.has(item.videoId)) item.type = "live";
  }
  for (const item of shortsList) {
    if (seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    channelList.push(item);
  }
  for (const item of streamsList) {
    if (seen.has(item.videoId)) continue;
    seen.add(item.videoId);
    channelList.push(item);
  }
  // RSS で拾えた最新動画も足す（チャンネルページ取得失敗時の保険）
  for (const [videoId, rss] of rssMap) {
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    channelList.push({ videoId, title: rss.title });
  }

  const prevCount = (prev.videos || []).length;
  const channelFetched = videoList.length + shortsList.length + streamsList.length;

  // チャンネルページが取れないときは RSS の15件にフォールバック
  if (!channelList.length) {
    channelList = [...rssMap.entries()].map(([videoId, rss]) => ({ videoId, title: rss.title }));
  }

  let videos = channelList.map((item) => {
    const { videoId, title, membersOnly, type: hintType, viewCount: hintViews } = item;
    const rss = rssMap.get(videoId);
    const prevVideo = prevMap[videoId] || {};
    const isShort = hintType === "short";
    const viewCount = pickViewCount(hintViews, prevVideo.viewCount);
    return {
      title: rss?.title || title || prevVideo.title || "",
      videoId,
      url: isShort
        ? `https://www.youtube.com/shorts/${videoId}`
        : `https://www.youtube.com/watch?v=${videoId}`,
      views: viewCount != null ? formatViews(viewCount) : (prevVideo.views || ""),
      viewCount,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      published: rss?.published || prevVideo.published || "",
      membersOnly: membersOnly ?? prevVideo.membersOnly ?? false,
      type: hintType || (liveIds.has(videoId) ? "live" : "") || prevVideo.type || "video",
    };
  }).filter((v) => v.videoId);

  await applyApiViewCounts(videos);
  await enrichMissingVideoMeta(videos, liveIds);

  // 取得件数が少なすぎるときは前回データを残す（一時的な YouTube 側エラー対策）
  if (channelFetched < MIN_TRUSTED_ITEMS && prevCount >= MIN_TRUSTED_ITEMS) {
    console.warn(`channel fetch weak (${channelFetched}); merging with previous ${prevCount} items`);
    videos = mergeVideoLists(prev.videos, videos);
  }

  for (const v of videos) {
    if (liveIds.has(v.videoId)) v.type = "live";
  }
  videos.sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")));

  const missingViews = videos.filter((v) => !(v.viewCount > 0)).length;
  if (missingViews) console.warn(`viewCount missing for ${missingViews}/${videos.length} videos`);

  return videos;
}

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

async function fetchStats() {
  try {
    const res = await fetch(`https://api.socialcounts.org/youtube-live-subscriber-count/${CHANNEL_ID}`);
    if (!res.ok) throw new Error(String(res.status));
    return parseLiveStats(await res.json());
  } catch {
    return null;
  }
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

// --- videos ---
try {
  const videos = await fetchVideos();
  if (videos.length) {
    const payload = { updated: today, source: "youtube-channel", videos };
    await writeFile("data/videos.json", JSON.stringify(payload, null, 2) + "\n");
    await writeFile(
      "data/videos.js",
      "// Auto-generated by scripts/fetch-data.mjs\nwindow.__NAZEYAMA_VIDEOS__ = " + JSON.stringify(payload) + ";\n"
    );
    console.log(`videos updated: ${videos.length} items`);
  } else {
    console.warn("no videos parsed; keeping existing data/videos.json");
  }
} catch (e) {
  console.error("videos failed:", e.message);
}

// --- stats ---
try {
  const prev = await readJson("data/stats.json", {});
  const live = await fetchStats();
  const stats = {
    updated: today,
    source: live ? "socialcounts" : (prev.source || "initial-fallback"),
    // 取得できない値は前回値を保持
    subscribers: live?.subscribers ?? prev.subscribers ?? 0,
    views: live?.views ?? prev.views ?? 0,
    videos: live?.videos ?? prev.videos ?? 0,
  };
  await writeFile("data/stats.json", JSON.stringify(stats, null, 2) + "\n");
  console.log("stats updated; subscribers =", stats.subscribers);
} catch (e) {
  console.error("stats failed:", e.message);
}

// --- books (covers & ASIN) ---
try {
  await fetchBooks();
} catch (e) {
  console.error("books failed:", e.message);
}

// --- SEO (検索・LINEシェア用タグ) ---
try {
  await syncSeo();
} catch (e) {
  console.error("seo sync failed:", e.message);
}

// --- site.yaml → site.js（ローカル file:// プレビュー用） ---
try {
  await exportSiteBundle();
} catch (e) {
  console.error("site export failed:", e.message);
}
