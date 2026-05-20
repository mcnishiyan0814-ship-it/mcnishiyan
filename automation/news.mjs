// Google News RSS → Claude判定 → Notion投入
// 含むキーワードごとに検索クエリを叩き、結果をマージしてClaudeで関連度を判定する
import { XMLParser } from "fast-xml-parser";
import {
  DB,
  GOOGLE_NEWS_BASE,
  GOOGLE_NEWS_LANG,
  FALLBACK_QUERIES,
  NEWS_RELEVANCE_THRESHOLD,
} from "./config.mjs";
import { notion, queryAll, getProp, urlExists } from "./lib/notion.mjs";
import { judgeNews } from "./lib/claude.mjs";

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchGoogleNewsQuery(query) {
  const url = `${GOOGLE_NEWS_BASE}/search?q=${encodeURIComponent(query)}&${GOOGLE_NEWS_LANG}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 dashboard-bot" },
  });
  if (!res.ok) {
    console.warn(`Google News fetch failed for "${query}": ${res.status}`);
    return [];
  }
  const xml = await res.text();
  const j = parser.parse(xml);
  const items = j?.rss?.channel?.item ?? [];
  const list = Array.isArray(items) ? items : [items];
  return list.map((it) => {
    // Google News の description は HTML を含むので簡易タグ除去
    const descRaw = String(it.description ?? "").replace(/<[^>]+>/g, " ");
    // source タグから配信元を抽出
    const source =
      typeof it.source === "object"
        ? it.source?.["#text"] || it.source?.text || ""
        : String(it.source ?? "");
    return {
      title: String(it.title ?? "").trim(),
      description: descRaw.replace(/\s+/g, " ").trim().slice(0, 800),
      url: String(it.link ?? "").trim(),
      pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      source: source || "Google News",
      query,
    };
  });
}

async function loadKeywords() {
  const pages = await queryAll(DB.keywords.databaseId, {
    property: "有効",
    checkbox: { equals: true },
  });
  return pages.map((p) => ({
    name: getProp(p, "キーワード"),
    kind: getProp(p, "種別"),
    priority: getProp(p, "優先度"),
  }));
}

async function loadExamples() {
  const pages = await queryAll(
    DB.learning.databaseId,
    { property: "学習に使用", checkbox: { equals: true } },
    [{ property: "判定日", direction: "descending" }]
  );
  return pages.slice(0, 30).map((p) => ({
    title: getProp(p, "記事タイトル"),
    verdict: getProp(p, "判定"),
    comment: getProp(p, "ユーザーコメント"),
  }));
}

async function createNewsPage(article, judgment) {
  return notion.pages.create({
    parent: { database_id: DB.news.databaseId },
    properties: {
      タイトル: { title: [{ text: { content: article.title.slice(0, 200) } }] },
      ステータス: { select: { name: "要レビュー" } },
      関連度: { number: judgment.relevance },
      Claude要約: { rich_text: [{ text: { content: judgment.summary } }] },
      選定理由: { rich_text: [{ text: { content: judgment.reason } }] },
      ヒットキーワード: {
        multi_select: judgment.hitKeywords.map((n) => ({ name: n.slice(0, 100) })),
      },
      カテゴリ: { select: { name: judgment.category } },
      公開日時: article.pubDate ? { date: { start: article.pubDate } } : { date: null },
      ソース: { rich_text: [{ text: { content: article.source } }] },
      URL: { url: article.url },
    },
  });
}

async function main() {
  console.log("=== News ingest start (Google News) ===");
  const [keywords, examples] = await Promise.all([loadKeywords(), loadExamples()]);
  console.log(`Keywords: ${keywords.length}, Examples: ${examples.length}`);

  const includeKw = keywords.filter((k) => k.kind === "含む");
  const queries = includeKw.length === 0 ? FALLBACK_QUERIES : includeKw.map((k) => k.name);
  console.log(`Queries: ${queries.join(", ")}`);

  const all = (await Promise.all(queries.map(fetchGoogleNewsQuery))).flat();

  // URL重複除去（同じ記事が複数クエリでヒット）
  const seen = new Set();
  const dedupedLocal = [];
  for (const a of all) {
    if (!a.url || seen.has(a.url)) continue;
    seen.add(a.url);
    dedupedLocal.push(a);
  }
  console.log(`Fetched ${all.length}, deduped locally to ${dedupedLocal.length}`);

  // Notion 上で既に取り込み済みの URL を弾く
  const fresh = [];
  for (const c of dedupedLocal) {
    if (await urlExists(DB.news.databaseId, c.url)) continue;
    fresh.push(c);
  }
  console.log(`After Notion dedup: ${fresh.length}`);

  let inserted = 0;
  for (const article of fresh.slice(0, 40)) {
    try {
      const judgment = await judgeNews({ article, keywords, examples });
      if (judgment.relevance < NEWS_RELEVANCE_THRESHOLD) {
        console.log(`  skip (rel=${judgment.relevance}): ${article.title}`);
        continue;
      }
      await createNewsPage(article, judgment);
      console.log(`  ✓ rel=${judgment.relevance}: ${article.title}`);
      inserted++;
    } catch (e) {
      console.error(`  ERR: ${article.title}`, e.message);
    }
  }
  console.log(`=== Inserted ${inserted} articles ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
