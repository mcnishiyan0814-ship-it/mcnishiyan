// ローカルで一度だけ実行して MS Graph の refresh_token を取得するヘルパー。
// 使い方:
//   1. Azure に「シングルテナント」または「マルチテナント」アプリ登録
//   2. リダイレクト URI に http://localhost:8765/callback を追加
//   3. API のアクセス許可 (委任) で Mail.Read, offline_access を追加・同意
//   4. クライアントシークレットを発行
//   5. このリポジトリの automation ディレクトリで:
//        MS_TENANT_ID=... MS_CLIENT_ID=... MS_CLIENT_SECRET=... \
//          node scripts/get-ms-refresh-token.mjs
//   6. ブラウザが開くのでサインイン → 完了したら refresh_token が出力される
//   7. それを GitHub Secrets の MS_REFRESH_TOKEN に登録
import http from "node:http";
import { URL } from "node:url";

const TENANT = process.env.MS_TENANT_ID || "common";
const CLIENT_ID = required("MS_CLIENT_ID");
const CLIENT_SECRET = required("MS_CLIENT_SECRET");
const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPE = "https://graph.microsoft.com/Mail.Read offline_access";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

const authUrl =
  `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
  `&response_mode=query` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&prompt=consent`;

console.log("\n以下のURLをブラウザで開いてサインインしてください:\n");
console.log(authUrl);
console.log("\n(自動で開かない場合は手動でコピーしてください)\n");

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404).end();
    return;
  }
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const code = u.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("No code parameter");
    return;
  }
  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      scope: SCOPE,
    });
    const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = await r.json();
    if (!r.ok) {
      res.writeHead(500).end(`Token exchange failed: ${JSON.stringify(j)}`);
      console.error(j);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      "<h1>OK</h1><p>ターミナルに refresh_token が出力されました。このタブは閉じてください。</p>"
    );
    console.log("\n=== refresh_token ===");
    console.log(j.refresh_token);
    console.log("\nこれを GitHub Secrets の MS_REFRESH_TOKEN に登録してください。\n");
    setTimeout(() => server.close(), 500);
  } catch (e) {
    res.writeHead(500).end(String(e));
    console.error(e);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on ${REDIRECT} ...`);
});
