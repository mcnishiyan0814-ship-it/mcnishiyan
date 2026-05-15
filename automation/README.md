# Dashboard Automation

Notion ダッシュボードを自動更新するスクリプト群。GitHub Actions で 30分おきに動きます。

## 構成

| スクリプト   | 役割                                                             |
| ------------ | ---------------------------------------------------------------- |
| `news.mjs`   | Yahoo!ニュース RSS → キーワード絞り込み → Claude判定 → Notion投入 |
| `todo.mjs`   | Outlook (Microsoft Graph) → Claude分析 → TODO登録                |
| `learn.mjs`  | ニュースDBの承認/却下 → 学習ログへ転写 → 次回プロンプトに使用    |

## Notion 側 (作成済み)

親ページ: `📊 マイダッシュボード` 配下に4つのDB

- `📰 ニュース` (databaseId: `b4503d855b614b25b51a61e1ebc74fdb`)
- `✅ TODO`   (databaseId: `54d712b5440d4e698737e19a2c2f6782`)
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

### 4. GitHub Secrets

リポジトリの Settings → Secrets and variables → Actions で以下を登録:

- `NOTION_TOKEN`
- `ANTHROPIC_API_KEY`
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REFRESH_TOKEN`

### 5. キーワード初期投入

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
