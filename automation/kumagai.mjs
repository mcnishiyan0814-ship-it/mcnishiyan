// Apify の Tweet Scraper Actor で @m_kumagai の投稿を取得し、Notionに反映。
// - 24時間以内の投稿は「最新24h=true」、それ以前は false
// - 既存ツイートIDはスキップ（重複防止）
// - 既存DB上で「最新24h=true」かつ古くなったものは false に下げる
//
// Apify Actor: https://apify.com/apidojo/tweet-scraper
// 同期実行 + データセット取得を1リクエストで行う:
//   POST https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=...
import { DB, X_USERNAME } from "./config.mjs";
import { notion, queryAll, getProp } from "./lib/notion.mjs";

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error("Missing APIFY_TOKEN");
  process.exit(1);
}

const ACTOR = process.env.APIFY_ACTOR || "apidojo~tweet-scraper";
const MAX_TWEETS = Number(process.env.MAX_TWEETS || 50);

async function fetchTweetsFromApify() {
  const url = `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
  const body = {
    twitterHandles: [X_USERNAME],
    maxItems: MAX_TWEETS,
    sort: "Latest",
    tweetLanguage: "ja",
  };
  console.log(`Calling Apify actor ${ACTOR} for @${X_USERNAME} ...`);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Apify call failed: ${r.status} ${await r.text()}`);
  }
  const items = await r.json();
  return Array.isArray(items) ? items : [];
}

// Apify tweet item の差分を吸収して共通スキーマに正規化
function normalize(item) {
  // フィールド命名は actor のバージョンで揺れがあるためいくつかフォールバック
  const id =
    item.id || item.tweetId || item.id_str || item.url?.split("/status/")[1]?.split("?")[0];
  const text = item.text || item.fullText || item.full_text || "";
  const createdAt =
    item.createdAt || item.created_at || item.timestamp || item.date || null;
  const link =
    item.url ||
    item.tweetUrl ||
    (id ? `https://x.com/${X_USERNAME}/status/${id}` : null);
  const metrics = {
    like: item.likeCount ?? item.favorite_count ?? item.likes ?? 0,
    retweet: item.retweetCount ?? item.retweets ?? 0,
    reply: item.replyCount ?? item.replies ?? 0,
    view: item.viewCount ?? item.views ?? 0,
  };
  let type = "投稿";
  if (item.isRetweet || item.retweeted_tweet) type = "リポスト";
  else if (item.isQuote || item.quoted_tweet) type = "引用";
  else if (item.isReply || item.in_reply_to_status_id) type = "返信";
  return { id, text, createdAt, link, metrics, type };
}

function within24h(isoTime) {
  if (!isoTime) return false;
  return Date.now() - new Date(isoTime).getTime() <= 24 * 60 * 60 * 1000;
}

async function existingTweets() {
  const pages = await queryAll(DB.kumagai.databaseId, undefined, [
    { property: "投稿日時", direction: "descending" },
  ]);
  const map = new Map();
  for (const p of pages) {
    const tid = getProp(p, "ツイートID");
    if (tid) map.set(tid, p);
  }
  return map;
}

async function createTweetPage(t) {
  if (!t.id) throw new Error("No tweet id");
  const isRecent = within24h(t.createdAt);
  return notion.pages.create({
    parent: { database_id: DB.kumagai.databaseId },
    icon: { type: "emoji", emoji: t.type === "リポスト" ? "🔁" : t.type === "引用" ? "💬" : "🐦" },
    properties: {
      投稿内容: { title: [{ text: { content: (t.text || "").slice(0, 200) } }] },
      投稿日時: t.createdAt ? { date: { start: new Date(t.createdAt).toISOString() } } : { date: null },
      タイプ: { select: { name: t.type } },
      いいね: { number: t.metrics.like },
      リポスト: { number: t.metrics.retweet },
      返信数: { number: t.metrics.reply },
      閲覧数: { number: t.metrics.view },
      リンク: { url: t.link },
      ツイートID: { rich_text: [{ text: { content: String(t.id) } }] },
      最新24h: { checkbox: isRecent },
    },
  });
}

async function refreshRecentFlags(existing) {
  for (const [, page] of existing) {
    const postedAt = getProp(page, "投稿日時");
    if (!postedAt) continue;
    const recent = within24h(postedAt);
    const flag = getProp(page, "最新24h");
    if (flag !== recent) {
      await notion.pages.update({
        page_id: page.id,
        properties: { 最新24h: { checkbox: recent } },
      });
    }
  }
}

async function main() {
  console.log("=== Kumagai X ingest start (Apify) ===");
  const existing = await existingTweets();
  console.log(`Existing tweets in Notion: ${existing.size}`);

  const raw = await fetchTweetsFromApify();
  console.log(`Fetched ${raw.length} items from Apify`);

  let inserted = 0;
  for (const item of raw) {
    const t = normalize(item);
    if (!t.id) continue;
    if (existing.has(t.id)) continue;
    try {
      await createTweetPage(t);
      inserted++;
      const tag = within24h(t.createdAt) ? "[24h]" : "[old]";
      console.log(`  + ${tag} ${t.type}: ${(t.text || "").slice(0, 60).replace(/\n/g, " ")}`);
    } catch (e) {
      console.error(`  ERR tweet ${t.id}: ${e.message}`);
    }
  }

  await refreshRecentFlags(existing);
  console.log(`=== Inserted ${inserted} tweets, flags refreshed ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
