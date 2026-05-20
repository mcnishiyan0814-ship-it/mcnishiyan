# Dashboard Automation

Notion ダッシュボードを自動更新するスクリプト群。GitHub Actions で 30分おきに動きます。

## 構成

| スクリプト   | 役割                                                             |
| ------------ | ---------------------------------------------------------------- |
| `news.mjs`   | Google News RSS（キーワード検索） → Claude判定 → Notion投入       |
| `todo.mjs`   | Outlook (Microsoft Graph) → Claude分析 → TODO登録                |
| `slack.mjs`  | 自分宛 Slack メンション → Claudeでカテゴリ/領域分類 → Notion     |
| `limitless.mjs` | Limitless 前日ライフログ → Claudeで要約 → Notion                |
| `ism.mjs`    | GMOスピリットベンチャー宣言から日付ベースで1件抽選 → ダッシュボード最上部に表示 |
| `kumagai.mjs`| X API v2 で @m_kumagai の投稿を取得 → 24h以内/以前を自動仕分け → Notion |
| `learn.mjs`  | ニュースDBの承認/却下 → 学習ログへ転写 → 次回プロンプトに使用    |

すべて **毎朝 9:00 JST** に一括実行されます (`.github/workflows/dashboard.yml`)。手動実行は GitHub Actions の workflow_dispatch から可能 (job を選択)。

## Notion 側 (作成済み)

親ページ: `📊 マイダッシュボード` 配下に4つのDB

- `📰 ニュース` (databaseId: `b4503d855b614b25b51a61e1ebc74fdb`)
- `✅ TODO`   (databaseId: `54d712b5440d4e698737e19a2c2f6782`)
- `💬 Slackメンション` (databaseId: `3a7933c505754214bf9c7b8205941e29`)
- `🎙️ ライフログ要約` (databaseId: `642dea6cbd8641b89003ee45b0675193`)
- `🔑 キーワード設定` (databaseId: `b1094664ba754bdba15efa34af86671c`)
- `📈 学習ログ` (databaseId: `b06060ad74b64a34ad9990ad2e240622`)

## セットアップ

### 1. Notion インテグレーション

1. https://www.notion.so/profile/integrations で新しい内部インテグレーションを作成
2. シークレットを取得 (`secret_xxx`)
3. ダッシュボードページの「…」→「コネクト」でインテグレーションを追加 (4つのDBにアクセスが伝播)

### 2. Microsoft Graph (Outlook)

1. https://entra.microsoft.com → アプリの登録 → 新規登録
2. リダイレクトURI: `http://localhost:8000/callback`
3. API のアクセス許可: `Mail.Read`, `offline_access` (委任)
4. クライアントシークレット発行
5. 一度認可コードフローを通して refresh_token を取得（[手順](https://learn.microsoft.com/graph/auth-v2-user)）

### 3. Anthropic API

https://console.anthropic.com で API key を発行

### 4. Slack (User Token)

Slackの `search.messages` を使うため **User Token (xoxp-)** が必要です。

1. https://api.slack.com/apps → Create New App → From scratch
2. OAuth & Permissions → "User Token Scopes" に追加:
   - `search:read` (検索)
   - `users:read` (ユーザー名解決, 任意)
   - `channels:read` `groups:read` `im:read` `mpim:read` (チャンネル名解決, 任意)
3. Install to Workspace → 同意 → 発行された **User OAuth Token (xoxp-)** を取得
4. ワークスペース管理者の承認が必要な場合は申請

> 注: Bot Token (xoxb-) では `search.messages` は使えないため、必ず User Token を使ってください。

### 5. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions で以下を登録:

- `NOTION_TOKEN`
- `ANTHROPIC_API_KEY`
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REFRESH_TOKEN`
- `SLACK_USER_TOKEN` (xoxp- で始まるトークン)
- `SLACK_USER_ID` (任意。未設定なら U02D2CUDT2Q を既定値で使用)
- `LIMITLESS_API_KEY` (https://limitless.ai → Settings → API Keys で発行)
- `APIFY_TOKEN` (https://console.apify.com/account/integrations の Personal API Token。Apify "apidojo/tweet-scraper" 用)

### 6. キーワード初期投入

Notion の `🔑 キーワード設定` DB に、追いかけたいキーワードを追加 (有効=チェック)。
例: 「生成AI」「Claude」「GMO」「セキュリティ」など。

## ローカル実行

```bash
cd automation
npm install
NOTION_TOKEN=... ANTHROPIC_API_KEY=... npm run news
```

## 学習サイクル

1. `news.mjs` が記事を投入 (ステータス=要レビュー)
2. ユーザーがNotionで `承認` or `却下` に変更
3. `learn.mjs` が学習ログDBにコピー
4. 次回 `news.mjs` 実行時にfew-shot例として再投入

## チューニング

- `NEWS_THRESHOLD` 環境変数で関連度閾値 (デフォルト60) を調整
- `config.mjs` の `YAHOO_RSS_FEEDS` でフィード追加削除
- `MODEL` 環境変数でClaudeモデル切替 (デフォルト sonnet)

## コスト試算 (精度優先構成)

| 項目           | 想定                       | 月額                |
| -------------- | -------------------------- | ------------------- |
| Claude (news)  | 30分おき × 30件 × Sonnet  | 約 $20-40           |
| Claude (todo)  | 30分おき × 5件             | 約 $2-5             |
| Notion         | 既存個人プラン             | 既存                |
| GitHub Actions | パブリック=無料 / 私的=可  | $0-数百円           |
| **合計**       |                            | **約 ¥4,000-7,000** |
