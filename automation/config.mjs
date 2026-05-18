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
  slack: {
    databaseId: "3a7933c505754214bf9c7b8205941e29",
    dataSourceId: "453567de-ef79-46d9-ae1d-eddeaba4f6cd",
  },
  limitless: {
    databaseId: "642dea6cbd8641b89003ee45b0675193",
    dataSourceId: "19a7e486-db0a-4335-afeb-a2fef7966c57",
  },
};

// Slack のユーザーID（自分）。MCPで確認済みの値を既定にする
export const SLACK_USER_ID = process.env.SLACK_USER_ID || "U02D2CUDT2Q";

// チャンネル名（小文字）→ 領域 マッピング（部分一致、上から評価）
export const CHANNEL_DOMAIN_RULES = [
  { match: ["セキュリティ", "security", "ssl"], domain: "セキュリティ" },
  { match: ["air"], domain: "AIR" },
  { match: ["人事", "hr", "新卒", "採用"], domain: "人事" },
  { match: ["役員", "exec", "bod", "board"], domain: "役員" },
  { match: ["広報", "pr", "メディア", "ir"], domain: "広報" },
  { match: ["aidx", "生成ai", "ai"], domain: "AIDX" },
];

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
