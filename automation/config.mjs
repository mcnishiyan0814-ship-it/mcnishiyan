// Notion DB / Data Source IDs (固定)
export const DB = {
  news: {
    databaseId: "b4503d855b614b25b51a61e1ebc74fdb",
    dataSourceId: "f2263cd7-8fc6-44b9-9120-08c1a8e6f008",
  },
  todo: {
    databaseId: "54d712b5440d4e698737e19a2c2f6782",
    dataSourceId: "0bada8da-e5a2-439d-901e-bb54db17dc5b",
  },
  keywords: {
    databaseId: "b1094664ba754bdba15efa34af86671c",
    dataSourceId: "98824775-d5f5-4fe4-9365-3592b63f376b",
  },
  learning: {
    databaseId: "b06060ad74b64a34ad9990ad2e240622",
    dataSourceId: "57424560-a5ce-4bd7-8905-893072b85113",
  },
};

// Yahoo!ニュース 主要RSS（カテゴリ別公式フィード）
// https://news.yahoo.co.jp/rss
export const YAHOO_RSS_FEEDS = [
  { url: "https://news.yahoo.co.jp/rss/topics/top-picks.xml", category: "その他" },
  { url: "https://news.yahoo.co.jp/rss/topics/domestic.xml", category: "社会" },
  { url: "https://news.yahoo.co.jp/rss/topics/world.xml", category: "国際" },
  { url: "https://news.yahoo.co.jp/rss/topics/business.xml", category: "経済" },
  { url: "https://news.yahoo.co.jp/rss/topics/entertainment.xml", category: "エンタメ" },
  { url: "https://news.yahoo.co.jp/rss/topics/sports.xml", category: "スポーツ" },
  { url: "https://news.yahoo.co.jp/rss/topics/it.xml", category: "テック" },
  { url: "https://news.yahoo.co.jp/rss/topics/science.xml", category: "テック" },
];

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// 関連度がこの値以上の記事のみNotionへ投入
export const NEWS_RELEVANCE_THRESHOLD = Number(process.env.NEWS_THRESHOLD || 60);

// GMOサインの差出人パターン
export const GMO_SIGN_SENDERS = [
  "noreply@gmosign.com",
  "info@gmosign.com",
  "support@gmosign.com",
];
