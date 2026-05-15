// ニュースDBで「承認」「却下」になった記事を 学習ログ DB へ転写
import { DB } from "./config.mjs";
import { notion, queryAll, getProp } from "./lib/notion.mjs";

async function existsInLearning(url) {
  const r = await notion.databases.query({
    database_id: DB.learning.databaseId,
    filter: { property: "URL", url: { equals: url } },
    page_size: 1,
  });
  return r.results.length > 0;
}

async function main() {
  console.log("=== Learning sync start ===");
  const reviewed = await queryAll(DB.news.databaseId, {
    or: [
      { property: "ステータス", select: { equals: "承認" } },
      { property: "ステータス", select: { equals: "却下" } },
    ],
  });

  let copied = 0;
  for (const page of reviewed) {
    const url = getProp(page, "URL");
    if (!url) continue;
    if (await existsInLearning(url)) continue;

    const verdict = getProp(page, "ステータス");
    const title = getProp(page, "タイトル");
    await notion.pages.create({
      parent: { database_id: DB.learning.databaseId },
      properties: {
        記事タイトル: { title: [{ text: { content: title.slice(0, 200) } }] },
        判定: { select: { name: verdict } },
        Claude推論スコア: { number: getProp(page, "関連度") ?? 0 },
        Claude選定理由: {
          rich_text: [{ text: { content: getProp(page, "選定理由") ?? "" } }],
        },
        ヒットキーワード: {
          multi_select: (getProp(page, "ヒットキーワード") ?? []).map((n) => ({ name: n })),
        },
        学習に使用: { checkbox: true },
        URL: { url },
      },
    });
    copied++;
    console.log(`  + [${verdict}] ${title}`);
  }
  console.log(`=== Copied ${copied} feedbacks ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
