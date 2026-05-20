// X API v2 から @m_kumagai の最近の投稿を取得し、Notionに反映。
// - 24時間以内の投稿は「最新24h=true」、それ以前は false
// - 既存ツイートIDはスキップ（重複防止）
// - 既存DB上で「最新24h=true」かつ古くなったものは false に下げる
import { DB, X_USERNAME } from "./config.mjs";
import { notion, queryAll, getProp } from "./lib/notion.mjs";

const BEARER = process.env.X_BEARER_TOKEN;
if (!BEARER) {
  console.error("Missing X_BEARER_TOKEN");
  process.exit(1);
}

const API = "https://api.twitter.com/2";

async function xApi(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers: { Authorization: `Bearer ${BEARER}` } });
  if (!r.ok) throw new Error(`X API ${path} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function getUserId(username) {
  if (process.env.X_USER_ID) return process.env.X_USER_ID;
  const j = await xApi(`/users/by/username/${username}`);
  return j.data?.id;
}

async function fetchRecentTweets(userId) {
  // 直近100件まで取得。24h以内+それ以前の境目判定に十分。
  // referenced_tweets でリポスト/引用/返信を判別、public_metrics で各種カウント
  const j = await xApi(`/users/${userId}/tweets`, {
    max_results: 100,
    "tweet.fields": "created_at,public_metrics,referenced_tweets,text",
    exclude: "", // replies/retweets 含む
  });
  return j.data ?? [];
}

function classifyType(tweet) {
  const refs = tweet.referenced_tweets ?? [];
  for (const r of refs) {
    if (r.type === "retweeted") return "リポスト";
    if (r.type === "quoted") return "引用";
    if (r.type === "replied_to") return "返信";
  }
  return "投稿";
}

function within24h(isoTime) {
  return Date.now() - new Date(isoTime).getTime() <= 24 * 60 * 60 * 1000;
}

async function existingTweetIds() {
  // 既にDBに入っている全ツイートIDをセットで返す
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

function buildLink(tweetId) {
  return `https://x.com/${X_USERNAME}/status/${tweetId}`;
}

async function createTweetPage(tweet) {
  const isRecent = within24h(tweet.created_at);
  const type = classifyType(tweet);
  const metrics = tweet.public_metrics ?? {};
  return notion.pages.create({
    parent: { database_id: DB.kumagai.databaseId },
    icon: { type: "emoji", emoji: type === "リポスト" ? "🔁" : type === "引用" ? "💬" : "🐦" },
    properties: {
      投稿内容: { title: [{ text: { content: (tweet.text || "").slice(0, 200) } }] },
      投稿日時: { date: { start: tweet.created_at } },
      タイプ: { select: { name: type } },
      いいね: { number: metrics.like_count ?? 0 },
      リポスト: { number: metrics.retweet_count ?? 0 },
      返信数: { number: metrics.reply_count ?? 0 },
      閲覧数: { number: metrics.impression_count ?? 0 },
      リンク: { url: buildLink(tweet.id) },
      ツイートID: { rich_text: [{ text: { content: tweet.id } }] },
      最新24h: { checkbox: isRecent },
    },
  });
}

async function refreshRecentFlags(existing) {
  // DB側で「最新24h=true」だが24h経過したものは false に下げる、
  // および「最新24h=false」だが24h以内（新規取り込み直後の保険）は true に上げる
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
  console.log("=== Kumagai X ingest start ===");
  const userId = await getUserId(X_USERNAME);
  console.log(`User: @${X_USERNAME} (${userId})`);

  const existing = await existingTweetIds();
  console.log(`Existing tweets in Notion: ${existing.size}`);

  const tweets = await fetchRecentTweets(userId);
  console.log(`Fetched ${tweets.length} tweets`);

  let inserted = 0;
  for (const t of tweets) {
    if (existing.has(t.id)) continue;
    try {
      await createTweetPage(t);
      inserted++;
      const tag = within24h(t.created_at) ? "[24h]" : "[old]";
      console.log(`  + ${tag} ${classifyType(t)}: ${(t.text || "").slice(0, 60).replace(/\n/g, " ")}`);
    } catch (e) {
      console.error(`  ERR tweet ${t.id}: ${e.message}`);
    }
  }

  // 既存行の最新24hフラグを再計算
  await refreshRecentFlags(existing);

  console.log(`=== Inserted ${inserted} tweets, flags refreshed ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
