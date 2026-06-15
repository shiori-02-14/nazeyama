// =========================================================
//  content/site.yaml の books から表紙・ASIN を Amazon 検索で取得
//  data/books.json に保存（GitHub Actions / 手動実行）
// =========================================================
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FETCH_HEADERS = {
  "accept-language": "ja",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
const FETCH_DELAY_MS = 2500;
const FETCH_RETRIES = 3;
const today = new Date().toISOString().slice(0, 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bookKey(title, author) {
  return String(title || "").trim() + "\0" + String(author || "").trim();
}

/** site.yaml の books: ブロックだけを抜き出してパース（依存ライブラリなし） */
function parseBooksFromSiteYaml(src) {
  const result = { novels: { items: [] }, exam: { items: [] } };
  let inBooks = false;
  let section = null;
  let item = null;
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^books:\s*$/.test(line)) {
      inBooks = true;
      continue;
    }
    if (inBooks && /^[a-z_]+:/.test(line) && !/^\s/.test(line)) break;
    if (!inBooks) continue;
    if (/^\s+novels:/.test(line)) {
      section = "novels";
      continue;
    }
    if (/^\s+exam:/.test(line)) {
      section = "exam";
      continue;
    }
    if (!section) continue;
    const titleM =
      line.match(/^\s+-\s+title:\s+"(.+)"\s*$/) ||
      line.match(/^\s+-\s+title:\s+(.+)\s*$/);
    if (titleM) {
      item = { title: titleM[1].replace(/^"|"$/g, "") };
      result[section].items.push(item);
      continue;
    }
    const fieldM =
      line.match(/^\s+(author|comment):\s+"(.*)"\s*$/) ||
      line.match(/^\s+(author|comment):\s+(.*)\s*$/);
    if (fieldM && item) item[fieldM[1]] = fieldM[2].replace(/^"|"$/g, "");
  }
  return result;
}

function upgradeCoverUrl(url) {
  if (!url) return "";
  return url.replace(/\._AC_[A-Z0-9_]+\.jpg/, "._AC_SL500_.jpg");
}

function buildSearchQuery(title, author) {
  const parts = [title];
  const a = String(author || "").trim();
  if (a && a !== "—" && a !== "-") parts.push(a);
  return parts.join(" ").trim();
}

function parseAmazonSearch(html) {
  if (/Robot Check|captcha/i.test(html)) return { blocked: true };
  const asin = html.match(/data-asin="([A-Z0-9]{10})"/)?.[1] || "";
  const img = html.match(/src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)?.[1] || "";
  return { asin, coverUrl: upgradeCoverUrl(img) };
}

async function fetchWithRetry(url, retries = FETCH_RETRIES) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS });
      if (res.ok) return await res.text();
      lastErr = new Error(String(res.status));
    } catch (e) {
      lastErr = e;
    }
    if (i < retries - 1) await sleep(1500 * (i + 1));
  }
  throw lastErr;
}

async function searchAmazonBook(title, author) {
  const q = encodeURIComponent(buildSearchQuery(title, author));
  const url = `https://www.amazon.co.jp/s?k=${q}&i=stripbooks`;
  const html = await fetchWithRetry(url);
  const parsed = parseAmazonSearch(html);
  if (parsed.blocked) throw new Error("amazon blocked");
  return parsed;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function prevItemMap(prev) {
  const map = new Map();
  for (const key of ["novels", "exam"]) {
    for (const item of prev[key]?.items || []) {
      map.set(bookKey(item.title, item.author), item);
    }
  }
  return map;
}

async function enrichCategoryItems(items, prevMap) {
  const out = [];
  for (const book of items) {
    const key = bookKey(book.title, book.author);
    const prev = prevMap.get(key) || {};
    let asin = prev.asin || "";
    let coverUrl = prev.coverUrl || "";

    if (!asin || !coverUrl) {
      try {
        const found = await searchAmazonBook(book.title, book.author);
        if (found.asin) asin = found.asin;
        if (found.coverUrl) coverUrl = found.coverUrl;
      } catch (e) {
        console.warn(`  skip ${book.title}: ${e.message}`);
      }
      await sleep(FETCH_DELAY_MS);
    }

    out.push({
      title: book.title,
      author: book.author || "",
      asin: asin || "",
      coverUrl: coverUrl || "",
    });
  }
  return out;
}

export async function fetchBooks() {
  const books = parseBooksFromSiteYaml(await readFile("content/site.yaml", "utf8"));
  if (!books.novels.items.length && !books.exam.items.length) {
    throw new Error("site.yaml の books: に本がありません");
  }

  const prev = await readJson("data/books.json", { novels: { items: [] }, exam: { items: [] } });
  const prevMap = prevItemMap(prev);

  console.log("fetching book covers from Amazon...");
  const novels = await enrichCategoryItems(books.novels.items, prevMap);
  const exam = await enrichCategoryItems(books.exam.items, prevMap);

  const payload = {
    updated: today,
    source: "amazon-search",
    novels: { items: novels },
    exam: { items: exam },
  };
  await writeFile("data/books.json", JSON.stringify(payload, null, 2) + "\n");
  const withCover = [...novels, ...exam].filter((b) => b.coverUrl).length;
  console.log(`books updated: ${withCover}/${novels.length + exam.length} covers`);
  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchBooks().catch((e) => {
    console.error("books failed:", e.message);
    process.exitCode = 1;
  });
}
