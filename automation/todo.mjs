// Microsoft Graph API で Outlook を巡回し、GMOサインメール等から TODO 抽出
import { DB, GMO_SIGN_SENDERS } from "./config.mjs";
import { notion, emailUrlExists } from "./lib/notion.mjs";
import { classifyEmail } from "./lib/claude.mjs";

const TENANT = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.MS_REFRESH_TOKEN;

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    scope: "https://graph.microsoft.com/Mail.Read offline_access",
  });
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Token exchange failed: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}

async function searchMessages(token) {
  // 過去2日のメールから差出人で絞る
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const filters = GMO_SIGN_SENDERS.map(
    (s) => `from/emailAddress/address eq '${s}'`
  ).join(" or ");
  const url =
    `https://graph.microsoft.com/v1.0/me/messages` +
    `?$filter=receivedDateTime ge ${since} and (${filters})` +
    `&$select=id,subject,from,bodyPreview,receivedDateTime,webLink` +
    `&$top=50`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Graph search failed: ${r.status} ${await r.text()}`);
  return (await r.json()).value;
}

async function createTodo(msg, parsed) {
  return notion.pages.create({
    parent: { database_id: DB.todo.databaseId },
    properties: {
      タスク: { title: [{ text: { content: (parsed.task || msg.subject).slice(0, 200) } }] },
      ステータス: { select: { name: "未着手" } },
      優先度: { select: { name: parsed.priority || "中" } },
      ソース: { select: { name: "Outlook(GMOサイン)" } },
      期限: parsed.due_date ? { date: { start: parsed.due_date } } : { date: null },
      差出人: {
        rich_text: [
          { text: { content: msg.from?.emailAddress?.address || "" } },
        ],
      },
      件名: { rich_text: [{ text: { content: msg.subject || "" } }] },
      サマリ: { rich_text: [{ text: { content: parsed.summary || "" } }] },
      元メールURL: { url: msg.webLink },
    },
  });
}

async function main() {
  console.log("=== TODO ingest start ===");
  const token = await getAccessToken();
  const messages = await searchMessages(token);
  console.log(`Fetched ${messages.length} messages`);

  let inserted = 0;
  for (const msg of messages) {
    try {
      if (await emailUrlExists(DB.todo.databaseId, msg.webLink)) continue;
      const parsed = await classifyEmail({
        subject: msg.subject || "",
        from: msg.from?.emailAddress?.address || "",
        snippet: msg.bodyPreview || "",
      });
      if (!parsed.is_actionable) {
        console.log(`  skip (non-actionable): ${msg.subject}`);
        continue;
      }
      await createTodo(msg, parsed);
      console.log(`  ✓ ${parsed.task || msg.subject}`);
      inserted++;
    } catch (e) {
      console.error(`  ERR: ${msg.subject}`, e.message);
    }
  }
  console.log(`=== Inserted ${inserted} todos ===`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
