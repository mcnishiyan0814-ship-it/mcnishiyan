// Yahoo!ニュース RSS → Claude判定 → Notion投入
import { XMLParser } from "fast-xml-parser";
import { DB, YAHOO_RSS_FEEDS, NEWS_RELEVANCE_THRESHOLD } from "./config.mjs";
import { notion, queryAll, getProp, urlExists } from "./lib/notion.mjs";
import { judgeNews } from "./lib/claude.mjs";

const parser = new XMLParser({ ignoreAttributes: false });

async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 dashboard-bot" } });
  if (!res.ok) {
    console.warn(`RSS fetch failed: ${feed.url} (${res.status})`);
    return [];
  }
  const xml = await res.text();
  const j = parser.parse(xml);
  const items = j?.rss?.channel?.item ?? [];
  return (Array.isArray(items) ? items : [items]).map((it) => ({
    title: String(it.title ?? "").trim(),
    description: String(it.description ?? "").trim(),
    url: String(it.link ?? "").trim(),
    pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
    source: "Yahoo!ニュース",
    category: feed.category,
  }));
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
  console.log("=== News ingest start ===");
  const [keywords, examples] = await Promise.all([loadKeywords(), loadExamples()]);
  console.log(`Keywords: ${keywords.length}, Examples: ${examples.length}`);

  const includeKw = keywords.filter((k) => k.kind === "含む").map((k) => k.name.toLowerCase());

  const all = (await Promise.all(YAHOO_RSS_FEEDS.map(fetchFeed))).flat();
  console.log(`Fetched ${all.length} items`);

  // 先に文字列マッチで粗くフィルタ（含むキーワードが1つでも入っていれば候補）
  const candidates = includeKw.length === 0
    ? all
    : all.filter((a) => {
        const hay = `${a.title} ${a.description}`.toLowerCase();
        return includeKw.some((k) => hay.includes(k));
      });
  console.log(`After keyword pre-filter: ${candidates.length}`);

  // URL重複除外（DB照会）
  const fresh = [];
  for (const c of candidates) {
    if (!c.url) continue;
    if (await urlExists(DB.news.databaseId, c.url)) continue;
    fresh.push(c);
  }
  console.log(`After dedup: ${fresh.length}`);

  let inserted = 0;
  for (const article of fresh.slice(0, 30)) {
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
