// Limitless AI の前日ライフログ → Claudeで要約 → Notion投入
import { DB, MODEL } from "./config.mjs";
import { notion } from "./lib/notion.mjs";
import { anthropic } from "./lib/claude.mjs";

const LIMITLESS_KEY = process.env.LIMITLESS_API_KEY;
const TZ = process.env.LIMITLESS_TZ || "Asia/Tokyo";

if (!LIMITLESS_KEY) {
  console.error("Missing LIMITLESS_API_KEY");
  process.exit(1);
}

function yesterdayJST() {
  // 日本時間で「前日」の YYYY-MM-DD を返す
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setUTCDate(jst.getUTCDate() - 1);
  return jst.toISOString().slice(0, 10);
}

async function fetchLifelogs(date) {
  // Limitless API: https://limitless.ai/developers/docs/api
  const url =
    `https://api.limitless.ai/v1/lifelogs` +
    `?date=${date}&timezone=${encodeURIComponent(TZ)}&includeMarkdown=true&limit=50`;
  const r = await fetch(url, { headers: { "X-API-Key": LIMITLESS_KEY } });
  if (!r.ok) {
    throw new Error(`Limitless API failed: ${r.status} ${await r.text()}`);
  }
  const j = await r.json();
  return j.data?.lifelogs ?? j.lifelogs ?? [];
}

async function summarize(date, lifelogs) {
  const items = lifelogs
    .map(
      (l) =>
        `### ${l.startTime || ""} - ${l.endTime || ""}: ${l.title || ""}\n${l.markdown || ""}`
    )
    .join("\n\n---\n\n");

  const userPrompt = [
    `次の Limitless ライフログ（${date}、件数: ${lifelogs.length}）をNotion用に要約してください。`,
    "",
    "## 出力フォーマット (Notion Markdown)",
    "",
    "## 🕒 タイムライン",
    "- **HH:MM-HH:MM** 概要を一行で（誰と何の話か）",
    "（最大15項目、時系列）",
    "",
    "## 📝 主要トピック",
    "1. **タイトル** — 1-2文の要点",
    "（3-5項目）",
    "",
    "## ✅ TODO候補",
    "- [ ] 未完アクション（最大5項目）",
    "",
    "## 🎯 意思決定・合意事項",
    "- 明確に決まったこと（なければ「なし」）",
    "",
    "全体で日本語、3000文字以内、Markdownのみ（前置きや```で囲まない）。",
    "",
    "## 入力ログ",
    "",
    items,
  ].join("\n");

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: userPrompt }],
  });

  const markdown = res.content.find((c) => c.type === "text")?.text ?? "";

  // 主要トピックのタイトルを抜き出して MULTI_SELECT 用に
  const topics = [];
  const topicSection = markdown.match(/## 📝 主要トピック\s*([\s\S]*?)(?=\n## |\n#|$)/);
  if (topicSection) {
    const lines = topicSection[1].split("\n");
    for (const line of lines) {
      const m = line.match(/^\d+\.\s+\*\*(.+?)\*\*/);
      if (m) topics.push(m[1].slice(0, 100));
    }
  }

  return { markdown, topics };
}

async function alreadyExists(dateStr) {
  const r = await notion.databases.query({
    database_id: DB.limitless.databaseId,
    filter: { property: "日付", date: { equals: dateStr } },
    page_size: 1,
  });
  return r.results.length > 0;
}

async function createSummaryPage(date, lifelogs, summary) {
  return notion.pages.create({
    parent: { database_id: DB.limitless.databaseId },
    icon: { type: "emoji", emoji: "🎧" },
    properties: {
      日付タイトル: {
        title: [{ text: { content: `${date} ライフログ要約` } }],
      },
      日付: { date: { start: date } },
      ログ件数: { number: lifelogs.length },
      主要トピック: { multi_select: summary.topics.map((t) => ({ name: t })) },
      TODO反映済: { checkbox: false },
    },
    children: markdownToBlocks(summary.markdown),
  });
}

// 簡易 Markdown → Notion blocks 変換
function markdownToBlocks(md) {
  const blocks = [];
  const lines = md.split("\n");
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: line.slice(3) } }] },
      });
    } else if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ type: "text", text: { content: line.slice(6) } }],
          checked: line.startsWith("- [x] "),
        },
      });
    } else if (line.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: line.slice(2) } }],
        },
      });
    } else if (/^\d+\.\s/.test(line)) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{ type: "text", text: { content: line.replace(/^\d+\.\s/, "") } }],
        },
      });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: line } }] },
      });
    }
  }
  return blocks;
}

async function main() {
  const date = process.argv[2] || yesterdayJST();
  console.log(`=== Limitless ingest for ${date} ===`);

  if (await alreadyExists(date)) {
    console.log(`Already exists for ${date}, skipping.`);
    return;
  }

  const lifelogs = await fetchLifelogs(date);
  console.log(`Fetched ${lifelogs.length} lifelogs`);
  if (lifelogs.length === 0) {
    console.log("No lifelogs for this date, skipping.");
    return;
  }

  const summary = await summarize(date, lifelogs);
  await createSummaryPage(date, lifelogs, summary);
  console.log(`✓ Created summary for ${date} (topics: ${summary.topics.join(", ")})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
