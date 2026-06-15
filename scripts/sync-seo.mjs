// site.yaml の検索設定を index.html / books.html に反映（GitHub Actions 用）
import { readFile, writeFile } from "node:fs/promises";

function parseSiteYaml(src) {
  const site = { title: "nazeyama", tagline: "", url: "", seo: {} };
  const seo = {
    title: "",
    description: "",
    keywords: [],
    books_title: "おすすめの本",
    books_description: "",
  };
  let inSite = false;
  let inSeo = false;
  let inKeywords = false;

  for (const raw of src.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^site:\s*$/.test(line)) {
      inSite = true;
      continue;
    }
    if (inSite && /^[a-z_]+:/.test(line) && !/^\s/.test(line)) break;
    if (!inSite) continue;

    if (/^\s+seo:\s*$/.test(line)) {
      inSeo = true;
      continue;
    }
    if (inSeo && /^\s+keywords:\s*$/.test(line)) {
      inKeywords = true;
      continue;
    }
    if (inSeo && inKeywords && /^\s+-\s+/.test(line)) {
      const kw = line.match(/^\s+-\s+"(.*)"\s*$/) || line.match(/^\s+-\s+(.+)\s*$/);
      if (kw) seo.keywords.push(kw[1].replace(/^"|"$/g, ""));
      continue;
    }
    if (inSeo && inKeywords && /^\s+\w/.test(line) && !/^\s+-\s+/.test(line)) {
      inKeywords = false;
    }
    if (inSeo && !inKeywords) {
      const trimmed = line.replace(/\s+#.*$/, "");
      const m = trimmed.match(/^\s+(title|description|books_title|books_description):\s+"(.*)"\s*$/) ||
        trimmed.match(/^\s+(title|description|books_title|books_description):\s+(.+)\s*$/);
      if (m) seo[m[1]] = m[2].replace(/^"|"$/g, "");
      continue;
    }
    if (!inSeo) {
      const trimmed = line.replace(/\s+#.*$/, "");
      const m = trimmed.match(/^\s+(title|tagline|url):\s+"(.*)"\s*$/) ||
        trimmed.match(/^\s+(title|tagline|url):\s+(.+)\s*$/);
      if (m) site[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }

  const logoM = src.match(/^\s+logo:\s+"(.*)"/m);
  site.logo = logoM ? logoM[1] : "assets/images/nazeyama.jpg";
  site.seo = seo;
  if (!site.seo.title) site.seo.title = `${site.title}｜${site.tagline}`;
  if (!site.seo.description) {
    site.seo.description =
      `物理系YouTuber ${site.title}（ナゼヤマ）の公式サイト。理系・リケジョ・大学院・物理の勉強と日常を発信。${site.tagline}`;
  }
  if (!site.seo.books_description) {
    site.seo.books_description =
      `${site.title} のおすすめ小説・院試参考書。理系・物理の読書リスト。`;
  }
  return site;
}

function escAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function setMeta(html, name, content) {
  const val = escAttr(content);
  const re = new RegExp(`(<meta\\s+name="${name}"\\s+content=")[^"]*("\\s*/?>)`, "i");
  if (re.test(html)) return html.replace(re, `$1${val}$2`);
  return html.replace("</head>", `  <meta name="${name}" content="${val}" />\n</head>`);
}

function setMetaProp(html, prop, content) {
  const val = escAttr(content);
  const re = new RegExp(`(<meta\\s+property="${prop}"\\s+content=")[^"]*("\\s*/?>)`, "i");
  if (re.test(html)) return html.replace(re, `$1${val}$2`);
  return html.replace("</head>", `  <meta property="${prop}" content="${val}" />\n</head>`);
}

function setTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${escAttr(title)}</title>`);
}

function setCanonical(html, url) {
  if (!url) return html;
  const normalized = /\.html$/i.test(url) ? url : url.replace(/\/?$/, "/");
  const tag = `<link rel="canonical" href="${escAttr(normalized)}" />`;
  if (/rel="canonical"/i.test(html)) {
    return html.replace(/<link rel="canonical" href="[^"]*" \/>/i, tag);
  }
  return html.replace("</head>", `  ${tag}\n</head>`);
}

async function syncPage(file, { title, description, keywords, canonical, ogImage, ogUrl }) {
  let html = await readFile(file, "utf8");
  html = setTitle(html, title);
  html = setMeta(html, "description", description);
  html = setMeta(html, "keywords", keywords);
  html = setMetaProp(html, "og:title", title);
  html = setMetaProp(html, "og:description", description);
  if (ogImage) html = setMetaProp(html, "og:image", ogImage);
  if (ogUrl) html = setMetaProp(html, "og:url", ogUrl);
  html = setMeta(html, "twitter:title", title);
  html = setMeta(html, "twitter:description", description);
  if (ogImage) html = setMeta(html, "twitter:image", ogImage);
  html = setCanonical(html, canonical);
  await writeFile(file, html);
}

function absUrl(base, path) {
  if (!base || !path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return base.replace(/\/?$/, "/") + path.replace(/^\//, "");
}

async function syncSitemap(baseUrl) {
  if (!baseUrl) return;
  const root = baseUrl.replace(/\/?$/, "/");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${root}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${root}books.html</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
</urlset>
`;
  await writeFile("sitemap.xml", xml);
  const robots = `User-agent: *
Allow: /

Sitemap: ${root}sitemap.xml
`;
  await writeFile("robots.txt", robots);
}

const src = await readFile("content/site.yaml", "utf8");
const site = parseSiteYaml(src);
const keywords = site.seo.keywords.join(", ");
const homeTitle = site.seo.title;
const booksTitle = `${site.seo.books_title}｜${site.title}`;
const ogImage = absUrl(site.url, site.logo);
const homeUrl = site.url ? site.url.replace(/\/?$/, "/") : "";

await syncPage("index.html", {
  title: homeTitle,
  description: site.seo.description,
  keywords,
  canonical: homeUrl,
  ogImage,
  ogUrl: homeUrl,
});
await syncPage("books.html", {
  title: booksTitle,
  description: site.seo.books_description,
  keywords,
  canonical: homeUrl + "books.html",
  ogImage,
  ogUrl: homeUrl + "books.html",
});
await syncSitemap(site.url);

console.log("SEO synced:", homeTitle);
