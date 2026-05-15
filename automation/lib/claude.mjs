import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "../config.mjs";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 構造化出力をJSONで取得（cache_control を含むメッセージで送る）
export async function judgeNews({ article, keywords, examples }) {
  const includeKw = keywords.filter((k) => k.kind === "含む").map((k) => k.name);
  const excludeKw = keywords.filter((k) => k.kind === "除外").map((k) => k.name);
  const topics = keywords.filter((k) => k.kind === "トピック").map((k) => k.name);

  const systemBlocks = [
    {
      type: "text",
      text: [
        "あなたはニュースキュレーターです。ユーザーが設定したキーワードと過去の承認/却下フィードバックを参考に、Yahoo!ニュースの記事を表示すべきか判定します。",
        "",
        "## 必ず守るルール",
        "- 除外キーワードを含む記事は relevance を 0 にする",
        "- ユーザーの関心領域は『含むキーワード』『トピック』『過去の承認例』から推定する",
        "- 過去の却下例と類似する記事は厳しめに採点する",
        "- 出力は JSON のみ（前置きや```不要）",
      ].join("\n"),
    },
    {
      type: "text",
      text: [
        "## キーワード設定（現在有効なもの）",
        `含む: ${includeKw.join("、") || "(未設定)"}`,
        `除外: ${excludeKw.join("、") || "(未設定)"}`,
        `関心トピック: ${topics.join("、") || "(未設定)"}`,
        "",
        "## 過去の承認/却下フィードバック（最大30件）",
        examples.length === 0
          ? "(まだフィードバックがありません)"
          : examples
              .map(
                (e) =>
                  `- [${e.verdict}] ${e.title}${e.comment ? `（コメント: ${e.comment}）` : ""}`
              )
              .join("\n"),
      ].join("\n"),
      cache_control: { type: "ephemeral" },
    },
  ];

  const userText = [
    "次の記事を判定してください。",
    `タイトル: ${article.title}`,
    `カテゴリ(RSS区分): ${article.category}`,
    `概要: ${article.description || "(なし)"}`,
    `URL: ${article.url}`,
    "",
    "次のJSONスキーマで出力:",
    "{",
    '  "relevance": 0-100の整数,',
    '  "summary": "日本語で1-2文の要旨",',
    '  "reason": "なぜこの関連度なのかを1文で",',
    '  "category": "政治|経済|テック|社会|国際|スポーツ|エンタメ|その他 のいずれか",',
    '  "hit_keywords": ["記事に該当した含む/トピックキーワードの配列"]',
    "}",
  ].join("\n");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: systemBlocks,
    messages: [{ role: "user", content: userText }],
  });

  const text = res.content.find((c) => c.type === "text")?.text ?? "{}";
  const json = extractJson(text);
  return {
    relevance: Number(json.relevance ?? 0),
    summary: String(json.summary ?? "").slice(0, 500),
    reason: String(json.reason ?? "").slice(0, 300),
    category: String(json.category ?? "その他"),
    hitKeywords: Array.isArray(json.hit_keywords) ? json.hit_keywords.slice(0, 10) : [],
    usage: res.usage,
  };
}

export async function classifySlackMention({ text, channel, from }) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "あなたはSlackメッセージを分類するアシスタントです。出力はJSONのみ。",
    messages: [
      {
        role: "user",
        content: [
          "次のSlackメンションを分類してください。",
          `チャンネル: ${channel}`,
          `差出人: ${from}`,
          `本文: ${text}`,
          "",
          "出力スキーマ:",
          "{",
          '  "category": "報告|依頼|リマインド|その他 のいずれか",',
          '  "summary": "30文字以内の要旨（タイトル用）",',
          '  "intent": "発信者の意図を1文で"',
          "}",
          "",
          "判定基準:",
          "- 依頼: アクションを求めている (確認/対応/レビュー依頼など)",
          "- 報告: 完了報告・進捗共有・情報共有",
          "- リマインド: 期限・締切の催促、再周知",
          "- 上記に当てはまらないものは その他",
        ].join("\n"),
      },
    ],
  });
  const text2 = res.content.find((c) => c.type === "text")?.text ?? "{}";
  return extractJson(text2);
}

export async function classifyEmail({ subject, from, snippet }) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      "あなたはメールから電子契約(GMOサイン)のアクション項目を抽出するアシスタントです。出力はJSONのみ。",
    messages: [
      {
        role: "user",
        content: [
          "次のメールからTODOを抽出してください。",
          `差出人: ${from}`,
          `件名: ${subject}`,
          `本文抜粋: ${snippet}`,
          "",
          "出力スキーマ:",
          "{",
          '  "is_actionable": true|false,',
          '  "task": "30文字以内のタスク名（例: 〇〇社との契約書に署名）",',
          '  "summary": "1-2文の要点",',
          '  "priority": "高|中|低",',
          '  "due_date": "YYYY-MM-DD または null"',
          "}",
        ].join("\n"),
      },
    ],
  });
  const text = res.content.find((c) => c.type === "text")?.text ?? "{}";
  return extractJson(text);
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}
