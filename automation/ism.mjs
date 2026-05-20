// 毎朝、日付ベースの決定論的ランダムでイズムを1つ選び:
//   1. Notion DB の旧「今日のイズム」を解除し、新しい行に立てる
//   2. ダッシュボードページ最上部の quote ブロック (3行) を rich_text を上書きして差し替え
//   - ブロックの位置は保持される（delete + insert ではなく block update を使う）
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DB, DASHBOARD_PAGE_ID } from "./config.mjs";
import { notion } from "./lib/notion.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadIsms() {
  const raw = await readFile(path.join(__dirname, "data", "isms.json"), "utf-8");
  return JSON.parse(raw);
}

function todayJST() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function pickIndex(dateStr, n) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

function tagOf(ism) {
  return ism.subcategory
    ? `${ism.id} ${ism.category}・${ism.subcategory}`
    : `${ism.id} ${ism.category}`;
}

async function listAllChildren(pageId) {
  const out = [];
  let cursor;
  do {
    const r = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

function plainText(rich) {
  return (rich ?? []).map((t) => t.plain_text).join("");
}

async function updateDashboardQuoteBlocks(newIsm) {
  const children = await listAllChildren(DASHBOARD_PAGE_ID);
  // 連続する3つの quote ブロックで、1行目に「今日のイズム」を含むものを探す
  let startIdx = -1;
  for (let i = 0; i + 2 < children.length; i++) {
    const a = children[i];
    const b = children[i + 1];
    const c = children[i + 2];
    if (a.type !== "quote" || b.type !== "quote" || c.type !== "quote") continue;
    if (!plainText(a.quote.rich_text).includes("今日のイズム")) continue;
    startIdx = i;
    break;
  }
  if (startIdx === -1) {
    console.warn(
      "  could not find today's-ism quote blocks (3 consecutive quotes with '今日のイズム'); skipping page update"
    );
    return;
  }
  const [b1, b2, b3] = children.slice(startIdx, startIdx + 3);
  const newL1 = `📜 **今日のイズム** — ${tagOf(newIsm)}`;
  const newL3 = newIsm.text;
  await notion.blocks.update({
    block_id: b1.id,
    quote: { rich_text: markdownToRich(newL1) },
  });
  await notion.blocks.update({
    block_id: b2.id,
    quote: { rich_text: [{ type: "text", text: { content: "" } }] },
  });
  await notion.blocks.update({
    block_id: b3.id,
    quote: { rich_text: [{ type: "text", text: { content: newL3 } }] },
  });
}

// 簡易 markdown → Notion rich_text 変換（**bold** のみ対応）
function markdownToRich(s) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", text: { content: s.slice(last, m.index) } });
    }
    parts.push({
      type: "text",
      text: { content: m[1] },
      annotations: { bold: true },
    });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ type: "text", text: { content: s.slice(last) } });
  return parts.length ? parts : [{ type: "text", text: { content: s } }];
}

async function findRowByNumber(number) {
  const r = await notion.databases.query({
    database_id: DB.isms.databaseId,
    filter: { property: "番号", rich_text: { equals: number } },
    page_size: 1,
  });
  return r.results[0];
}

async function clearTodayFlag() {
  const r = await notion.databases.query({
    database_id: DB.isms.databaseId,
    filter: { property: "今日のイズム", checkbox: { equals: true } },
    page_size: 100,
  });
  for (const row of r.results) {
    await notion.pages.update({
      page_id: row.id,
      properties: { 今日のイズム: { checkbox: false } },
    });
  }
}

async function main() {
  const date = process.argv[2] || todayJST();
  const isms = await loadIsms();
  const newIsm = isms[pickIndex(date, isms.length)];
  console.log(`=== Today's ism (${date}) ===`);
  console.log(`  ${newIsm.id}: ${newIsm.text.slice(0, 80)}...`);

  // DB の今日フラグを一旦全部下げる
  await clearTodayFlag();

  // 新しい行に立てる
  const row = await findRowByNumber(newIsm.id);
  if (!row) {
    console.error(`Row not found for ${newIsm.id}`);
    process.exit(1);
  }
  await notion.pages.update({
    page_id: row.id,
    properties: {
      今日のイズム: { checkbox: true },
      最終表示日: { date: { start: date } },
    },
  });

  // ダッシュボード上部の quote ブロックを書き換え
  await updateDashboardQuoteBlocks(newIsm);

  console.log("=== Done ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
