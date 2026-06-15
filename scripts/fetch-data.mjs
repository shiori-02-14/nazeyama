// =========================================================
//  動画(RSS)と登録者数を取得して data/*.json を更新するスクリプト
//  GitHub Actions から `node scripts/fetch-data.mjs` で実行されます。
//  - 依存なし（Node 18+ の fetch を使用）
//  - 取得できない値は前回値を保持（推測で埋めない＝ファクトチェック方針）
// =========================================================
import { writeFile, readFile } from "node:fs/promises";
import { fetchBooks } from "./fetch-books.mjs";

const CHANNEL_ID = "UCMn-qF0yqH-07bEJBaWUL5A";
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const CHANNEL_VIDEOS_URL = `https://www.youtube.com/channel/${CHANNEL_ID}/videos`;
const CHANNEL_SHORTS_URL = `https://www.youtube.com/channel/${CHANNEL_ID}/shorts`;
const VIDEO_LIMIT = 30;
const SHORTS_LIMIT = 30;
const FETCH_HEADERS = {
  "accept-language": "ja",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
const META_CONCURRENCY = 6;
const FETCH_RETRIES = 3;
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

function extractYtInitialData(html) {
  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
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
    map.set(v.videoId, { ...map.get(v.videoId), ...v, videoId: v.videoId });
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

function parseViewCount(html) {
  const m = String(html).match(/"viewCount":"(\d+)"/);
  return m ? Number(m[1]) : null;
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

async function fetchVideoMeta(id, hintType = "video") {
  let type = hintType;
  let viewCount = null;
  let published = "";
  let title = "";
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: FETCH_HEADERS });
    if (res.ok) {
      const html = await res.text();
      viewCount = parseViewCount(html);
      published = parseUploadDate(html);
      title = parseTitle(html);
      type = parseVideoType(html, id);
    }
  } catch {}
  return { type, viewCount, published, title };
}

function walkLockupViewModels(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.lockupViewModel) {
    const lv = node.lockupViewModel;
    const id =
      lv.onTap?.innertubeCommand?.watchEndpoint?.videoId ||
      lv.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url?.match(/vi\/([^/]+)/)?.[1];
    const title = lv.metadata?.lockupMetadataViewModel?.title?.content;
    if (id) out.push({ videoId: id, title: title || "", membersOnly: isMembersOnlyLockup(lv) });
  }
  for (const key of Object.keys(node)) walkLockupViewModels(node[key], out);
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
  const [videoList, shortsList] = await Promise.all([
    fetchChannelVideoList(),
    fetchChannelShortsList(),
  ]);
  let channelList = [...videoList];
  const seen = new Set(channelList.map((v) => v.videoId));
  for (const item of shortsList) {
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
  const channelFetched = videoList.length + shortsList.length;

  // チャンネルページが取れないときは RSS の15件にフォールバック
  if (!channelList.length) {
    channelList = [...rssMap.entries()].map(([videoId, rss]) => ({ videoId, title: rss.title }));
  }

  let videos = channelList.map((item) => {
    const { videoId, title, membersOnly, type: hintType, viewCount: hintViews } = item;
    const rss = rssMap.get(videoId);
    const prevVideo = prevMap[videoId] || {};
    const isShort = hintType === "short";
    const viewCount = hintViews ?? prevVideo.viewCount ?? null;
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
      type: hintType || prevVideo.type || "video",
    };
  }).filter((v) => v.videoId);

  await mapPool(videos, async (v) => {
    const meta = await fetchVideoMeta(v.videoId, v.type);
    v.type = meta.type;
    if (meta.viewCount != null) {
      v.viewCount = meta.viewCount;
      v.views = formatViews(meta.viewCount);
    }
    if (!v.published && meta.published) v.published = meta.published;
    if (!v.title && meta.title) v.title = meta.title;
    if (v.type === "short" && !v.url.includes("/shorts/")) {
      v.url = `https://www.youtube.com/shorts/${v.videoId}`;
    }
  });

  // 取得件数が少なすぎるときは前回データを残す（一時的な YouTube 側エラー対策）
  if (channelFetched < MIN_TRUSTED_ITEMS && prevCount >= MIN_TRUSTED_ITEMS) {
    console.warn(`channel fetch weak (${channelFetched}); merging with previous ${prevCount} items`);
    videos = mergeVideoLists(prev.videos, videos);
  }

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
    await writeFile("data/videos.json", JSON.stringify({ updated: today, source: "youtube-channel", videos }, null, 2) + "\n");
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
