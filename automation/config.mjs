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
  isms: {
    databaseId: "93e80f8204a54355a798e08c57ba0d19",
    dataSourceId: "b89ad090-4edf-48e6-b5de-280587f67e12",
  },
};

// ダッシュボードの親ページ ID（今日のイズムのテキスト埋め込み先）
export const DASHBOARD_PAGE_ID = "3616bc8c-3888-815e-881b-c22b6c562160";

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

// Google News RSS
// キーワード検索: https://news.google.com/rss/search?q=<keyword>&hl=ja&gl=JP&ceid=JP:ja
// トップ: https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja
export const GOOGLE_NEWS_BASE = "https://news.google.com/rss";
export const GOOGLE_NEWS_LANG = "hl=ja&gl=JP&ceid=JP:ja";

// 含むキーワードが未設定のときに使うフォールバック検索
export const FALLBACK_QUERIES = ["AI", "経済", "テック"];

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// 関連度がこの値以上の記事のみNotionへ投入
export const NEWS_RELEVANCE_THRESHOLD = Number(process.env.NEWS_THRESHOLD || 60);

// 取り込み対象の時間ウィンドウ（時間）。pubDate がこの値より古い記事は捨てる
export const NEWS_WINDOW_HOURS = Number(process.env.NEWS_WINDOW_HOURS || 24);

// GMOサインの差出人パターン
export const GMO_SIGN_SENDERS = [
  "noreply@gmosign.com",
  "info@gmosign.com",
  "support@gmosign.com",
];
