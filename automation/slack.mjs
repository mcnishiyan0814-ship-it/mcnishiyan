// Slack search.messages で自分宛メンションを取得 → Claude分類 → Notion
import { DB, SLACK_USER_ID, CHANNEL_DOMAIN_RULES } from "./config.mjs";
import { notion, linkExists } from "./lib/notion.mjs";
import { classifySlackMention } from "./lib/claude.mjs";

const TOKEN = process.env.SLACK_USER_TOKEN;
if (!TOKEN) {
  console.error("Missing SLACK_USER_TOKEN");
  process.exit(1);
}

async function slackApi(method, params = {}) {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const j = await r.json();
  if (!j.ok) throw new Error(`Slack ${method} failed: ${j.error || JSON.stringify(j)}`);
  return j;
}

function inferDomain(channelName) {
  const low = channelName.toLowerCase();
  for (const rule of CHANNEL_DOMAIN_RULES) {
    if (rule.match.some((m) => low.includes(m.toLowerCase()))) return rule.domain;
  }
  return "その他";
}

function tsToIso(ts) {
  return new Date(Number(ts.split(".")[0]) * 1000).toISOString();
}

async function fetchMentions() {
  // search.messages は user token (xoxp-) のみ動作
  const query = `to:<@${SLACK_USER_ID}>`;
  const j = await slackApi("search.messages", {
    query,
    sort: "timestamp",
    sort_dir: "desc",
    count: 50,
  });
  return j.messages?.matches ?? [];
}

async function createMention(m, classified, domain) {
  return notion.pages.create({
    parent: { database_id: DB.slack.databaseId },
    properties: {
      内容サマリ: {
        title: [{ text: { content: (classified.summary || m.text || "").slice(0, 200) } }],
      },
      カテゴリ: { select: { name: classified.category || "その他" } },
      領域: { select: { name: domain } },
      ステータス: { select: { name: "未読" } },
      日時: { date: { start: tsToIso(m.ts), time_zone: null } },
      差出人: {
        rich_text: [{ text: { content: m.username || m.user || "" } }],
      },
      チャンネル: {
        rich_text: [{ text: { content: m.channel?.name || m.channel?.id || "" } }],
      },
      本文: { rich_text: [{ text: { content: (m.text || "").slice(0, 1900) } }] },
      リンク: { url: m.permalink },
    },
  });
}

async function main() {
  console.log("=== Slack mentions ingest start ===");
  const matches = await fetchMentions();
  console.log(`Fetched ${matches.length} mention candidates`);

  let inserted = 0;
  for (const m of matches) {
    try {
      if (!m.permalink) continue;
      if (await linkExists(DB.slack.databaseId, m.permalink)) continue;
      const channelName = m.channel?.name || "";
      const domain = inferDomain(channelName);
      const classified = await classifySlackMention({
        text: m.text || "",
        channel: channelName,
        from: m.username || m.user || "",
      });
      await createMention(m, classified, domain);
      inserted++;
      console.log(`  ✓ [${classified.category}/${domain}] ${(classified.summary || m.text).slice(0, 60)}`);
    } catch (e) {
      console.error(`  ERR:`, e.message);
    }
  }
  console.log(`=== Inserted ${inserted} mentions ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
